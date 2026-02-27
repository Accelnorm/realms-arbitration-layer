use crate::error::SafeTreasuryError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct QueuePayout<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Payout::INIT_SPACE,
        seeds = [
            b"payout",
            safe.key().as_ref(),
            safe_policy.payout_count.to_le_bytes().as_ref(),
        ],
        bump
    )]
    pub payout: Account<'info, Payout>,
    #[account(mut)]
    /// CHECK: safe is only used as PDA seed input for payout derivation and as treasury transfer target.
    pub safe: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"safe_policy", safe_policy.authority.as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: signer validation depends on authorization mode and is enforced in instruction logic.
    pub authority: UncheckedAccount<'info>,
    /// CHECK: proposal proof account is validated in instruction logic when authorization_mode=proposal.
    pub proposal: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseNativePayout<'info> {
    #[account(
        mut,
        seeds = [
            b"payout",
            safe.key().as_ref(),
            payout.payout_index.to_le_bytes().as_ref(),
        ],
        bump = payout.bump,
        constraint = payout.status == 0
    )]
    pub payout: Account<'info, Payout>,
    #[account(
        mut,
        seeds = [b"native_vault", safe.key().as_ref()],
        bump
    )]
    /// CHECK: native vault PDA ownership/contents are validated in instruction logic before lamport movement.
    pub vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: safe is only used as PDA seed and transfer source/target metadata anchor in instruction logic.
    pub safe: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = recipient.key() == payout.recipient @ SafeTreasuryError::RecipientMismatch
    )]
    /// CHECK: recipient key is constrained to payout.recipient; no data deserialization is performed.
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseSplPayout<'info> {
    #[account(
        mut,
        seeds = [
            b"payout",
            safe.key().as_ref(),
            payout.payout_index.to_le_bytes().as_ref(),
        ],
        bump = payout.bump,
        constraint = payout.status == 0,
        constraint = payout.mint == Some(mint.key()) @ SafeTreasuryError::MintMismatch
    )]
    pub payout: Account<'info, Payout>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"spl_vault", safe_policy.key().as_ref(), mint.key().as_ref()],
        bump,
        constraint = vault_token_account.mint == mint.key() @ SafeTreasuryError::MintMismatch,
        constraint = vault_token_account.owner == safe_policy.key() @ SafeTreasuryError::Unauthorized
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        seeds = [b"safe_policy", payout.policy_snapshot.authority.as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    /// CHECK: safe is only used as PDA seed for payout derivation.
    pub safe: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = recipient_token_account.owner == payout.recipient @ SafeTreasuryError::RecipientMismatch,
        constraint = recipient_token_account.mint == mint.key() @ SafeTreasuryError::MintMismatch
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct CancelPayout<'info> {
    #[account(
        mut,
        seeds = [
            b"payout",
            safe.key().as_ref(),
            payout.payout_index.to_le_bytes().as_ref(),
        ],
        bump = payout.bump,
        constraint = payout.status == 0
    )]
    pub payout: Account<'info, Payout>,
    #[account(
        seeds = [b"safe_policy", payout.policy_snapshot.authority.as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    /// CHECK: safe is only used as PDA seed for payout derivation.
    pub safe: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct QueuePayoutArgs {
    pub asset_type: u8,
    pub mint: Option<Pubkey>,
    pub recipient: Pubkey,
    pub amount: u64,
    pub metadata_hash: Option<[u8; 32]>,
    pub authorization_mode: u8,
    pub payload_hash: Option<[u8; 32]>,
    pub proposal_owner: Option<Pubkey>,
    pub proposal_signatory: Option<Pubkey>,
}
