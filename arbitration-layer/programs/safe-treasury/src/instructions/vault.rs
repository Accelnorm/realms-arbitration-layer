use crate::contexts::*;
use crate::error::SafeTreasuryError;
use crate::events::*;
use crate::state::{AssetType, NativeVault};
use crate::utils::validate_token_program_for_asset_type;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TransferChecked};

pub fn init_native_vault(ctx: Context<InitNativeVault>) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == ctx.accounts.safe_policy.authority,
        SafeTreasuryError::Unauthorized
    );

    let vault = &mut ctx.accounts.vault;
    vault.safe = ctx.accounts.safe.key();
    vault.authority = ctx.accounts.safe_policy.authority;
    vault.bump = ctx.bumps.vault;
    Ok(())
}

pub fn fund_native_vault(ctx: Context<FundNativeVault>, amount: u64) -> Result<()> {
    let safe_policy = &ctx.accounts.safe_policy;

    require!(
        ctx.accounts.authority.key() == safe_policy.authority,
        SafeTreasuryError::Unauthorized
    );

    require!(
        !safe_policy.treasury_mode_enabled,
        SafeTreasuryError::TreasuryModeEnabled
    );

    require!(
        ctx.accounts.vault.safe == ctx.accounts.safe.key(),
        SafeTreasuryError::InvalidVaultAccount
    );
    require!(
        ctx.accounts.vault.authority == safe_policy.authority,
        SafeTreasuryError::InvalidVaultAccount
    );

    let vault_info = ctx.accounts.vault.to_account_info();
    let payer_info = ctx.accounts.payer.to_account_info();

    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &payer_info.key(),
        &vault_info.key(),
        amount,
    );
    anchor_lang::solana_program::program::invoke(&transfer_ix, &[payer_info, vault_info])?;

    Ok(())
}

pub fn init_spl_vault(ctx: Context<InitSplVault>) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == ctx.accounts.safe_policy.authority,
        SafeTreasuryError::Unauthorized
    );
    Ok(())
}

pub fn fund_spl_vault(ctx: Context<FundSplVault>, amount: u64) -> Result<()> {
    let safe_policy = &ctx.accounts.safe_policy;

    require!(
        !safe_policy.treasury_mode_enabled,
        SafeTreasuryError::TreasuryModeEnabled
    );

    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.funder_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.funder.to_account_info(),
        },
    );
    token_interface::transfer_checked(transfer_ctx, amount, ctx.accounts.mint.decimals)?;
    Ok(())
}

pub fn init_challenge_bond_vault(ctx: Context<InitChallengeBondVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.total_bonds_held = 0;
    vault.bump = ctx.bumps.vault;
    Ok(())
}

pub fn exit_custody(ctx: Context<ExitCustody>, args: ExitCustodyArgs) -> Result<()> {
    let safe_policy = &ctx.accounts.safe_policy;

    require!(
        ctx.accounts.authority.key() == safe_policy.authority,
        SafeTreasuryError::Unauthorized
    );
    require!(
        safe_policy.exit_custody_allowed,
        SafeTreasuryError::ExitCustodyNotAllowed
    );
    require!(
        ctx.accounts.recipient.key() == args.recipient,
        SafeTreasuryError::RecipientMismatch
    );

    if args.asset_type == u8::from(AssetType::Native) {
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
            native_vault.authority == safe_policy.authority,
            SafeTreasuryError::InvalidVaultAccount
        );

        let (expected_vault, _) = Pubkey::find_program_address(
            &[b"native_vault", native_vault.safe.as_ref()],
            &crate::ID,
        );
        require!(
            expected_vault == vault_info.key(),
            SafeTreasuryError::InvalidVaultAccount
        );

        let recipient_info = ctx.accounts.recipient.to_account_info();
        let lamports = vault_info.lamports();
        let recipient_new_balance = recipient_info
            .lamports()
            .checked_add(lamports)
            .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

        **vault_info.try_borrow_mut_lamports()? = 0;
        **recipient_info.try_borrow_mut_lamports()? = recipient_new_balance;
    } else if args.asset_type == u8::from(AssetType::Spl)
        || args.asset_type == u8::from(AssetType::Spl2022)
    {
        validate_token_program_for_asset_type(args.asset_type, ctx.accounts.token_program.key())?;

        let safe_policy_authority_seed = safe_policy.authority.as_ref();
        let safe_policy_bump_seed = [safe_policy.bump];
        let signer_seeds: &[&[u8]] = &[
            b"safe_policy",
            safe_policy_authority_seed,
            safe_policy_bump_seed.as_ref(),
        ];
        let signer = [signer_seeds];

        let vault_token = ctx
            .accounts
            .vault_token_account
            .as_ref()
            .ok_or(SafeTreasuryError::MissingTokenAccounts)?;
        let recipient_token = ctx
            .accounts
            .recipient_token_account
            .as_ref()
            .ok_or(SafeTreasuryError::MissingTokenAccounts)?;
        let mint = ctx
            .accounts
            .mint
            .as_ref()
            .ok_or(SafeTreasuryError::MissingTokenAccounts)?;

        require!(
            recipient_token.owner == args.recipient,
            SafeTreasuryError::RecipientMismatch
        );
        require!(
            recipient_token.mint == vault_token.mint,
            SafeTreasuryError::MintMismatch
        );
        require!(mint.key() == vault_token.mint, SafeTreasuryError::MintMismatch);

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                mint: mint.to_account_info(),
                from: vault_token.to_account_info(),
                to: recipient_token.to_account_info(),
                authority: safe_policy.to_account_info(),
            },
            &signer,
        );
        token_interface::transfer_checked(transfer_ctx, vault_token.amount, mint.decimals)?;
    } else {
        return err!(SafeTreasuryError::InvalidAssetConfig);
    }

    emit!(CustodyExited {
        safe: safe_policy.key(),
        asset_type: args.asset_type as u8,
        recipient: args.recipient,
    });

    Ok(())
}
