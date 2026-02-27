use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitializeSafePolicy<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + SafePolicy::INIT_SPACE,
        seeds = [b"safe_policy", authority.key().as_ref()],
        bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateSafePolicy<'info> {
    #[account(
        mut,
        seeds = [b"safe_policy", authority.key().as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct InitializeSafePolicyArgs {
    pub resolver: Pubkey,
    pub dispute_window: u64,
    pub challenge_bond: u64,
    pub eligibility_mint: Pubkey,
    pub min_token_balance: u64,
    pub max_appeal_rounds: u8,
    pub appeal_window_duration: u64,
    pub ipfs_policy_hash: [u8; 32],
    pub treasury_mode_enabled: bool,
    pub payout_cancellation_allowed: bool,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct UpdateSafePolicyArgs {
    pub resolver: Pubkey,
    pub dispute_window: u64,
    pub challenge_bond: u64,
    pub eligibility_mint: Pubkey,
    pub min_token_balance: u64,
    pub max_appeal_rounds: u8,
    pub appeal_window_duration: u64,
    pub ipfs_policy_hash: [u8; 32],
    pub treasury_mode_enabled: bool,
    pub payout_cancellation_allowed: bool,
}
