use crate::contexts::*;
use crate::error::SafeTreasuryError;
use crate::events::*;
use crate::state::*;
use crate::utils::{
    add_duration, compute_payout_id, compute_queue_payload_hash, read_governance_proposal_proof,
    validate_token_program_for_asset_type,
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TransferChecked};

pub fn queue_payout(ctx: Context<QueuePayout>, args: QueuePayoutArgs) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let safe_policy = &mut ctx.accounts.safe_policy;
    let clock = Clock::get()?;

    if args.authorization_mode == 0 {
        require!(
            ctx.accounts.authority.is_signer,
            SafeTreasuryError::Unauthorized
        );
        require!(
            ctx.accounts.authority.key() == safe_policy.authority,
            SafeTreasuryError::Unauthorized
        );
    } else if args.authorization_mode == 1 {
        let proposal_info = ctx
            .accounts
            .proposal
            .as_ref()
            .ok_or(error!(SafeTreasuryError::InvalidProposalProof))?
            .to_account_info();

        let proposal = read_governance_proposal_proof(&proposal_info)?;

        require!(
            proposal.governance == safe_policy.authority,
            SafeTreasuryError::Unauthorized
        );

        let provided_payload_hash = args
            .payload_hash
            .ok_or(error!(SafeTreasuryError::InvalidProposalProof))?;
        let expected_payload_hash = compute_queue_payload_hash(&args, safe_policy.key());

        require!(
            provided_payload_hash == expected_payload_hash,
            SafeTreasuryError::PayloadHashMismatch
        );
    } else {
        return err!(SafeTreasuryError::InvalidAuthorizationMode);
    }

    match args.asset_type {
        x if x == u8::from(AssetType::Native) => {
            require!(args.mint.is_none(), SafeTreasuryError::InvalidAssetConfig);
            require!(args.amount > 0, SafeTreasuryError::InvalidAssetConfig);
        }
        x if x == u8::from(AssetType::Spl) || x == u8::from(AssetType::Spl2022) => {
            require!(args.mint.is_some(), SafeTreasuryError::InvalidAssetConfig);
            require!(args.amount > 0, SafeTreasuryError::InvalidAssetConfig);
        }
        x if x == u8::from(AssetType::Nft) => {
            require!(args.mint.is_some(), SafeTreasuryError::InvalidAssetConfig);
            require!(args.amount == 1, SafeTreasuryError::InvalidNftAmount);
        }
        _ => return err!(SafeTreasuryError::InvalidAssetConfig),
    }

    let seed_hash = compute_payout_id(&args, safe_policy.key());
    payout.payout_id = seed_hash;
    payout.payout_index = safe_policy.payout_count;
    payout.safe = ctx.accounts.safe.key();
    payout.asset_type = args.asset_type;
    payout.mint = args.mint;
    payout.recipient = args.recipient;
    payout.amount = args.amount;
    payout.metadata_hash = args.metadata_hash;
    payout.status = 0;
    payout.dispute_deadline = add_duration(clock.unix_timestamp, safe_policy.dispute_window)?;
    payout.policy_snapshot = SafePolicy {
        authority: safe_policy.authority,
        resolver: safe_policy.resolver,
        dispute_window: safe_policy.dispute_window,
        challenge_bond: safe_policy.challenge_bond,
        eligibility_mint: safe_policy.eligibility_mint,
        min_token_balance: safe_policy.min_token_balance,
        max_appeal_rounds: safe_policy.max_appeal_rounds,
        appeal_window_duration: safe_policy.appeal_window_duration,
        appeal_bond_multiplier: safe_policy.appeal_bond_multiplier,
        ipfs_policy_hash: safe_policy.ipfs_policy_hash,
        exit_custody_allowed: safe_policy.exit_custody_allowed,
        payout_cancellation_allowed: safe_policy.payout_cancellation_allowed,
        treasury_mode_enabled: safe_policy.treasury_mode_enabled,
        payout_count: safe_policy.payout_count,
        bump: safe_policy.bump,
    };
    payout.challenge = None;
    payout.dispute_round = 0;
    payout.finalized = false;
    payout.final_outcome = None;
    payout.bump = ctx.bumps.payout;

    safe_policy.payout_count = safe_policy
        .payout_count
        .checked_add(1)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    emit!(PayoutQueued {
        safe: payout.safe,
        payout_id: payout.payout_id,
        asset_type: payout.asset_type as u8,
        mint: payout.mint,
        recipient: payout.recipient,
        amount: payout.amount,
        dispute_deadline: payout.dispute_deadline,
        policy_hash: payout.policy_snapshot.ipfs_policy_hash,
    });

    Ok(())
}

pub fn release_native_payout(ctx: Context<ReleaseNativePayout>) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let clock = Clock::get()?;

    require!(
        payout.status == 0,
        SafeTreasuryError::InvalidStateTransition
    );
    require!(
        payout.is_releasable_at(clock.unix_timestamp),
        SafeTreasuryError::PayoutNotReleasable
    );
    require!(
        payout.asset_type == u8::from(AssetType::Native),
        SafeTreasuryError::AssetTypeMismatch
    );

    let vault_info = ctx.accounts.vault.to_account_info();

    require!(
        vault_info.owner == &crate::ID,
        SafeTreasuryError::InvalidVaultAccount
    );

    let native_vault = {
        let data = vault_info.try_borrow_data()?;
        let mut data_slice: &[u8] = &data;
        NativeVault::try_deserialize(&mut data_slice)
            .map_err(|_| error!(SafeTreasuryError::InvalidVaultAccount))?
    };

    require!(
        native_vault.safe == ctx.accounts.safe.key(),
        SafeTreasuryError::InvalidVaultAccount
    );
    require!(
        native_vault.authority == payout.policy_snapshot.authority,
        SafeTreasuryError::InvalidVaultAccount
    );

    let (expected_vault, _) =
        Pubkey::find_program_address(&[b"native_vault", ctx.accounts.safe.key().as_ref()], &crate::ID);
    require!(
        expected_vault == vault_info.key(),
        SafeTreasuryError::InvalidVaultAccount
    );

    let recipient_info = ctx.accounts.recipient.to_account_info();

    let lamports = payout.amount;
    let vault_new_balance = vault_info
        .lamports()
        .checked_sub(lamports)
        .ok_or(SafeTreasuryError::ArithmeticUnderflow)?;
    let recipient_new_balance = recipient_info
        .lamports()
        .checked_add(lamports)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    **vault_info.try_borrow_mut_lamports()? = vault_new_balance;
    **recipient_info.try_borrow_mut_lamports()? = recipient_new_balance;

    payout.status = u8::from(PayoutStatus::Released);

    emit!(PayoutReleased {
        safe: payout.safe,
        payout_id: payout.payout_id,
        recipient: payout.recipient,
        amount: payout.amount,
        asset_type: 0 as u8,
    });

    Ok(())
}

pub fn release_spl_payout(ctx: Context<ReleaseSplPayout>) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let safe_policy = &ctx.accounts.safe_policy;
    let clock = Clock::get()?;

    require!(
        payout.status == 0,
        SafeTreasuryError::InvalidStateTransition
    );
    require!(
        payout.is_releasable_at(clock.unix_timestamp),
        SafeTreasuryError::PayoutNotReleasable
    );
    require!(
        payout.asset_type == u8::from(AssetType::Spl)
            || payout.asset_type == u8::from(AssetType::Spl2022)
            || payout.asset_type == u8::from(AssetType::Nft),
        SafeTreasuryError::AssetTypeMismatch
    );

    validate_token_program_for_asset_type(payout.asset_type, ctx.accounts.token_program.key())?;

    let transfer_amount = if payout.asset_type == u8::from(AssetType::Nft) {
        1
    } else {
        payout.amount
    };

    let safe_policy_authority_seed = safe_policy.authority.as_ref();
    let safe_policy_bump_seed = [safe_policy.bump];
    let signer_seeds: &[&[u8]] = &[
        b"safe_policy",
        safe_policy_authority_seed,
        safe_policy_bump_seed.as_ref(),
    ];
    let signer = [signer_seeds];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: safe_policy.to_account_info(),
        },
        &signer,
    );
    token_interface::transfer_checked(transfer_ctx, transfer_amount, ctx.accounts.mint.decimals)?;

    payout.status = u8::from(PayoutStatus::Released);

    emit!(PayoutReleased {
        safe: payout.safe,
        payout_id: payout.payout_id,
        recipient: payout.recipient,
        amount: transfer_amount,
        asset_type: payout.asset_type as u8,
    });

    Ok(())
}

pub fn cancel_payout(ctx: Context<CancelPayout>) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let safe_policy = &ctx.accounts.safe_policy;

    require!(
        ctx.accounts.authority.key() == safe_policy.authority,
        SafeTreasuryError::Unauthorized
    );
    require!(
        safe_policy.payout_cancellation_allowed,
        SafeTreasuryError::PayoutCancellationNotAllowed
    );
    require!(
        payout.status == 0,
        SafeTreasuryError::InvalidStateTransition
    );

    payout.status = u8::from(PayoutStatus::Cancelled);

    emit!(PayoutCancelled {
        safe: payout.safe,
        payout_id: payout.payout_id,
    });

    Ok(())
}
