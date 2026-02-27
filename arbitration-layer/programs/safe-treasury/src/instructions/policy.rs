use crate::contexts::*;
use crate::error::SafeTreasuryError;
use crate::events::*;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn initialize_safe_policy(
    ctx: Context<InitializeSafePolicy>,
    args: InitializeSafePolicyArgs,
) -> Result<()> {
    require!(
        args.dispute_window >= 3600,
        SafeTreasuryError::PolicyFloorViolation
    );
    require!(
        args.challenge_bond >= 10_000_000,
        SafeTreasuryError::PolicyFloorViolation
    );
    require!(
        args.max_appeal_rounds >= 2,
        SafeTreasuryError::PolicyFloorViolation
    );

    let policy = &mut ctx.accounts.safe_policy;
    policy.authority = ctx.accounts.authority.key();
    policy.resolver = args.resolver;
    policy.dispute_window = args.dispute_window;
    policy.challenge_bond = args.challenge_bond;
    policy.eligibility_mint = args.eligibility_mint;
    policy.min_token_balance = args.min_token_balance;
    policy.max_appeal_rounds = args.max_appeal_rounds;
    policy.appeal_window_duration = args.appeal_window_duration;
    policy.appeal_bond_multiplier = 2u8;
    policy.ipfs_policy_hash = args.ipfs_policy_hash;
    policy.exit_custody_allowed = false;
    policy.payout_cancellation_allowed = args.payout_cancellation_allowed;
    policy.treasury_mode_enabled = args.treasury_mode_enabled;
    policy.payout_count = 0;
    policy.bump = ctx.bumps.safe_policy;

    emit!(TreasuryPolicySet {
        safe_policy: policy.key(),
        authority: policy.authority,
        resolver: policy.resolver,
        dispute_window: policy.dispute_window,
        challenge_bond: policy.challenge_bond,
        max_appeal_rounds: policy.max_appeal_rounds,
    });

    Ok(())
}

pub fn update_safe_policy(
    ctx: Context<UpdateSafePolicy>,
    args: UpdateSafePolicyArgs,
) -> Result<()> {
    let policy = &mut ctx.accounts.safe_policy;

    require!(
        ctx.accounts.authority.key() == policy.authority,
        SafeTreasuryError::Unauthorized
    );
    require!(
        args.dispute_window >= 3600,
        SafeTreasuryError::PolicyFloorViolation
    );
    require!(
        args.challenge_bond >= 10_000_000,
        SafeTreasuryError::PolicyFloorViolation
    );
    require!(
        args.max_appeal_rounds >= 2,
        SafeTreasuryError::PolicyFloorViolation
    );

    policy.resolver = args.resolver;
    policy.dispute_window = args.dispute_window;
    policy.challenge_bond = args.challenge_bond;
    policy.eligibility_mint = args.eligibility_mint;
    policy.min_token_balance = args.min_token_balance;
    policy.max_appeal_rounds = args.max_appeal_rounds;
    policy.appeal_window_duration = args.appeal_window_duration;
    policy.appeal_bond_multiplier = 2u8;
    policy.ipfs_policy_hash = args.ipfs_policy_hash;
    policy.payout_cancellation_allowed = args.payout_cancellation_allowed;
    policy.treasury_mode_enabled = args.treasury_mode_enabled;

    emit!(TreasuryPolicySet {
        safe_policy: policy.key(),
        authority: policy.authority,
        resolver: policy.resolver,
        dispute_window: policy.dispute_window,
        challenge_bond: policy.challenge_bond,
        max_appeal_rounds: policy.max_appeal_rounds,
    });

    Ok(())
}
