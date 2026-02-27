use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct InitTreasuryRegistry<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + TreasuryRegistry::INIT_SPACE,
        seeds = [b"treasury_registry"],
        bump
    )]
    pub registry: Account<'info, TreasuryRegistry>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterTreasury<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TreasuryInfo::INIT_SPACE,
        seeds = [b"treasury_info", safe.key().as_ref()],
        bump
    )]
    pub treasury_info: Account<'info, TreasuryInfo>,
    #[account(
        mut,
        seeds = [b"treasury_registry"],
        bump
    )]
    pub registry: Account<'info, TreasuryRegistry>,
    /// CHECK: safe is only used as PDA seed for treasury_info derivation and stored pubkey reference.
    pub safe: UncheckedAccount<'info>,
    #[account(
        seeds = [b"safe_policy", authority.key().as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RegisterTreasuryArgs {
    pub mode: u8,
}
