use crate::contexts::*;
use crate::error::SafeTreasuryError;
use crate::events::*;
use crate::state::*;
use crate::utils::{
    add_duration, compute_ruling_payload_hash, is_passed_proposal_state,
    read_governance_proposal_proof,
};
use anchor_lang::prelude::*;

pub fn challenge_payout(ctx: Context<ChallengePayout>, bond_amount: u64) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let challenge = &mut ctx.accounts.challenge;
    let challenger_token_account = &ctx.accounts.challenger_token_account;
    let clock = Clock::get()?;

    require!(
        payout.status == 0,
        SafeTreasuryError::PayoutNotChallengeable
    );
    require!(
        clock.unix_timestamp < payout.dispute_deadline,
        SafeTreasuryError::DisputeWindowExpired
    );
    require!(
        payout.policy_snapshot.eligibility_mint == challenger_token_account.mint,
        SafeTreasuryError::MintMismatch
    );
    require!(
        challenger_token_account.amount >= payout.policy_snapshot.min_token_balance,
        SafeTreasuryError::InsufficientTokenBalance
    );
    require!(
        bond_amount == payout.policy_snapshot.challenge_bond,
        SafeTreasuryError::IncorrectBondAmount
    );

    let vault_info = ctx.accounts.vault.to_account_info();
    let challenger_info = ctx.accounts.challenger.to_account_info();
    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &challenger_info.key(),
        &vault_info.key(),
        bond_amount,
    );
    anchor_lang::solana_program::program::invoke(&transfer_ix, &[challenger_info, vault_info])?;

    ctx.accounts.vault.total_bonds_held = ctx
        .accounts
        .vault
        .total_bonds_held
        .checked_add(bond_amount)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    challenge.payout = payout.key();
    challenge.challenger = ctx.accounts.challenger.key();
    challenge.bond_amount = bond_amount;
    challenge.round = 0;
    challenge.created_at = clock.unix_timestamp;
    challenge.appeal_deadline = 0;
    challenge.current_outcome = None;
    challenge.ruling_recorded_for_round = 0;
    challenge.bump = ctx.bumps.challenge;

    payout.status = u8::from(PayoutStatus::Challenged);
    payout.challenge = Some(challenge.key());
    payout.dispute_round = 0;

    emit!(PayoutChallenged {
        safe: payout.safe,
        payout_id: payout.payout_id,
        dispute_id: challenge.key(),
        challenger: challenge.challenger,
        bond_amount: challenge.bond_amount,
        round: challenge.round,
    });

    Ok(())
}

pub fn record_ruling(ctx: Context<RecordRuling>, args: RecordRulingArgs) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let challenge = &mut ctx.accounts.challenge;

    require!(
        payout.status == 1,
        SafeTreasuryError::InvalidStateTransition
    );

    if args.authorization_mode == 0 {
        require!(
            ctx.accounts.resolver.is_signer,
            SafeTreasuryError::UnauthorizedResolver
        );
        require!(
            ctx.accounts.resolver.key() == payout.policy_snapshot.resolver,
            SafeTreasuryError::UnauthorizedResolver
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
            proposal.governance == payout.policy_snapshot.resolver,
            SafeTreasuryError::UnauthorizedResolver
        );
        require!(
            is_passed_proposal_state(proposal.state),
            SafeTreasuryError::ProposalNotPassed
        );

        let provided_payload_hash = args
            .payload_hash
            .ok_or(error!(SafeTreasuryError::InvalidProposalProof))?;
        let expected_payload_hash =
            compute_ruling_payload_hash(payout.payout_id, args.round, args.outcome, args.is_final);

        require!(
            provided_payload_hash == expected_payload_hash,
            SafeTreasuryError::PayloadHashMismatch
        );

        if let Some(proposal_state) = args.proposal_state {
            require!(
                proposal_state == proposal.state,
                SafeTreasuryError::InvalidProposalProof
            );
        }
    } else {
        return err!(SafeTreasuryError::InvalidAuthorizationMode);
    }

    require!(
        args.outcome == u8::from(RulingOutcome::Allow)
            || args.outcome == u8::from(RulingOutcome::Deny),
        SafeTreasuryError::InvalidRulingOutcome
    );

    let next_round_record = args
        .round
        .checked_add(1)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    require!(
        args.round == payout.dispute_round,
        SafeTreasuryError::RoundMismatch
    );
    require!(!payout.finalized, SafeTreasuryError::AlreadyFinalized);
    require!(
        challenge.ruling_recorded_for_round < next_round_record,
        SafeTreasuryError::RulingAlreadyRecorded
    );

    let clock = Clock::get()?;

    // Reset the appeal window every time a ruling is recorded, not only on
    // the first round.  Previously only round-0 updated the deadline, which
    // meant subsequent rounds had no fresh appeal window.
    challenge.appeal_deadline =
        add_duration(clock.unix_timestamp, payout.policy_snapshot.appeal_window_duration)?;

    challenge.current_outcome = Some(args.outcome);
    challenge.ruling_recorded_for_round = next_round_record;

    if args.is_final {
        payout.finalized = true;
        payout.final_outcome = Some(args.outcome);

        if args.outcome == u8::from(RulingOutcome::Allow) {
            payout.status = u8::from(PayoutStatus::Queued);
        } else {
            payout.status = u8::from(PayoutStatus::Denied);
            emit!(PayoutDenied {
                safe: payout.safe,
                payout_id: payout.payout_id,
            });
        }

        let vault_info = ctx.accounts.vault.to_account_info();
        let challenger_info = ctx.accounts.challenger.to_account_info();
        let safe_info = ctx.accounts.safe.to_account_info();

        let bond = challenge.bond_amount;
        ctx.accounts.vault.total_bonds_held = ctx
            .accounts
            .vault
            .total_bonds_held
            .checked_sub(bond)
            .ok_or(SafeTreasuryError::ArithmeticUnderflow)?;

        if args.outcome == u8::from(RulingOutcome::Deny) {
            // Challenger wins: return their bond.
            let vault_new = vault_info
                .lamports()
                .checked_sub(bond)
                .ok_or(SafeTreasuryError::ArithmeticUnderflow)?;
            let challenger_new = challenger_info
                .lamports()
                .checked_add(bond)
                .ok_or(SafeTreasuryError::ArithmeticOverflow)?;
            **vault_info.try_borrow_mut_lamports()? = vault_new;
            **challenger_info.try_borrow_mut_lamports()? = challenger_new;
        } else {
            // Challenger loses (Allow): slash bond to the safe treasury.
            let vault_new = vault_info
                .lamports()
                .checked_sub(bond)
                .ok_or(SafeTreasuryError::ArithmeticUnderflow)?;
            let safe_new = safe_info
                .lamports()
                .checked_add(bond)
                .ok_or(SafeTreasuryError::ArithmeticOverflow)?;
            **vault_info.try_borrow_mut_lamports()? = vault_new;
            **safe_info.try_borrow_mut_lamports()? = safe_new;
        }

        emit!(RulingFinalized {
            safe: payout.safe,
            payout_id: payout.payout_id,
            dispute_id: challenge.key(),
            round: args.round,
            outcome: args.outcome as u8,
        });
    }

    emit!(RulingRecorded {
        safe: payout.safe,
        payout_id: payout.payout_id,
        dispute_id: challenge.key(),
        round: args.round,
        outcome: args.outcome as u8,
        is_final: args.is_final,
    });

    Ok(())
}

pub fn appeal_ruling(ctx: Context<AppealRuling>) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let challenge = &mut ctx.accounts.challenge;
    let clock = Clock::get()?;

    require!(
        payout.status == 1,
        SafeTreasuryError::InvalidStateTransition
    );
    require!(!payout.finalized, SafeTreasuryError::AlreadyFinalized);
    require!(
        challenge.round < payout.policy_snapshot.max_appeal_rounds,
        SafeTreasuryError::MaxAppealsReached
    );
    require!(
        clock.unix_timestamp < challenge.appeal_deadline,
        SafeTreasuryError::AppealWindowExpired
    );
    require!(
        ctx.accounts.appellant.key() == challenge.challenger,
        SafeTreasuryError::Unauthorized
    );

    let appeal_power = (challenge.round as u32)
        .checked_add(1)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;
    let multiplier = (payout.policy_snapshot.appeal_bond_multiplier as u64)
        .checked_pow(appeal_power)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;
    let required_bond = payout
        .policy_snapshot
        .challenge_bond
        .checked_mul(multiplier)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    let vault_info = ctx.accounts.vault.to_account_info();
    let appellant_info = ctx.accounts.appellant.to_account_info();
    let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
        &appellant_info.key(),
        &vault_info.key(),
        required_bond,
    );
    anchor_lang::solana_program::program::invoke(&transfer_ix, &[appellant_info, vault_info])?;

    ctx.accounts.vault.total_bonds_held = ctx
        .accounts
        .vault
        .total_bonds_held
        .checked_add(required_bond)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    challenge.bond_amount = challenge
        .bond_amount
        .checked_add(required_bond)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    challenge.round = challenge
        .round
        .checked_add(1)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;
    payout.dispute_round = challenge.round;
    challenge.current_outcome = None;

    let new_appeal_deadline =
        add_duration(clock.unix_timestamp, payout.policy_snapshot.appeal_window_duration)?;
    challenge.appeal_deadline = new_appeal_deadline;

    emit!(RulingAppealed {
        safe: payout.safe,
        payout_id: payout.payout_id,
        dispute_id: challenge.key(),
        new_round: challenge.round,
        bond_amount: required_bond,
    });

    Ok(())
}

pub fn finalize_ruling(ctx: Context<FinalizeRuling>) -> Result<()> {
    let payout = &mut ctx.accounts.payout;
    let challenge = &mut ctx.accounts.challenge;
    let clock = Clock::get()?;

    require!(
        payout.status == 1,
        SafeTreasuryError::InvalidStateTransition
    );
    require!(!payout.finalized, SafeTreasuryError::AlreadyFinalized);

    // Guard: at least one ruling must have been recorded before finalization.
    // Without this, finalize_ruling could be called immediately after
    // challenge_payout because appeal_deadline starts at 0 (always past).
    require!(
        challenge.ruling_recorded_for_round > 0,
        SafeTreasuryError::CannotFinalizeYet
    );

    let can_finalize = if challenge.round >= payout.policy_snapshot.max_appeal_rounds {
        true
    } else {
        clock.unix_timestamp >= challenge.appeal_deadline
    };

    require!(can_finalize, SafeTreasuryError::CannotFinalizeYet);

    payout.finalized = true;

    // If no outcome was set for the current round (resolver never responded),
    // default to Deny — the payout remains blocked.
    let outcome = challenge
        .current_outcome
        .unwrap_or(u8::from(RulingOutcome::Deny));
    payout.final_outcome = Some(outcome);

    if outcome == u8::from(RulingOutcome::Allow) {
        payout.status = u8::from(PayoutStatus::Queued);
    } else {
        payout.status = u8::from(PayoutStatus::Denied);
        emit!(PayoutDenied {
            safe: payout.safe,
            payout_id: payout.payout_id,
        });
    }

    let vault_info = ctx.accounts.vault.to_account_info();
    let challenger_info = ctx.accounts.challenger.to_account_info();
    let safe_info = ctx.accounts.safe.to_account_info();

    let bond = challenge.bond_amount;
    ctx.accounts.vault.total_bonds_held = ctx
        .accounts
        .vault
        .total_bonds_held
        .checked_sub(bond)
        .ok_or(SafeTreasuryError::ArithmeticUnderflow)?;

    if outcome == u8::from(RulingOutcome::Deny) {
        // Challenger wins: return their bond.
        let vault_new = vault_info
            .lamports()
            .checked_sub(bond)
            .ok_or(SafeTreasuryError::ArithmeticUnderflow)?;
        let challenger_new = challenger_info
            .lamports()
            .checked_add(bond)
            .ok_or(SafeTreasuryError::ArithmeticOverflow)?;
        **vault_info.try_borrow_mut_lamports()? = vault_new;
        **challenger_info.try_borrow_mut_lamports()? = challenger_new;
    } else {
        // Challenger loses (Allow): slash bond to the safe treasury.
        let vault_new = vault_info
            .lamports()
            .checked_sub(bond)
            .ok_or(SafeTreasuryError::ArithmeticUnderflow)?;
        let safe_new = safe_info
            .lamports()
            .checked_add(bond)
            .ok_or(SafeTreasuryError::ArithmeticOverflow)?;
        **vault_info.try_borrow_mut_lamports()? = vault_new;
        **safe_info.try_borrow_mut_lamports()? = safe_new;
    }

    emit!(RulingFinalized {
        safe: payout.safe,
        payout_id: payout.payout_id,
        dispute_id: challenge.key(),
        round: challenge.round,
        outcome: outcome as u8,
    });

    Ok(())
}
