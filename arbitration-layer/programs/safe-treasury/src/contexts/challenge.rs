use crate::error::SafeTreasuryError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct ChallengePayout<'info> {
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
        init,
        payer = challenger,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [b"challenge", payout.key().as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(
        mut,
        seeds = [b"safe_policy", safe_policy.authority.as_ref()],
        bump = safe_policy.bump,
        // Prevent policy-substitution: an attacker must not be able to supply
        // a weaker policy (lower bond / different eligibility_mint) to bypass
        // challenge eligibility.  The authority field uniquely identifies the
        // policy PDA, so matching it against the payout's snapshot is sufficient.
        constraint = safe_policy.authority == payout.policy_snapshot.authority
            @ SafeTreasuryError::Unauthorized
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    /// CHECK: safe is used as a PDA seed and lamport-transfer target; ownership/type checks are enforced in instruction logic.
    pub safe: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"challenge_bond_vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, ChallengeBondVault>,
    #[account(
        constraint = challenger_token_account.owner == challenger.key()
            @ SafeTreasuryError::Unauthorized
    )]
    pub challenger_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub challenger: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordRuling<'info> {
    #[account(
        mut,
        seeds = [
            b"payout",
            safe.key().as_ref(),
            payout.payout_index.to_le_bytes().as_ref(),
        ],
        bump = payout.bump,
        constraint = payout.status == 1
    )]
    pub payout: Account<'info, Payout>,
    #[account(
        mut,
        seeds = [b"challenge", payout.key().as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(
        seeds = [b"safe_policy", safe_policy.authority.as_ref()],
        bump = safe_policy.bump,
        constraint = safe_policy.authority == payout.policy_snapshot.authority
            @ SafeTreasuryError::Unauthorized
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(
        mut,
        seeds = [b"challenge_bond_vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, ChallengeBondVault>,
    #[account(
        mut,
        constraint = challenger.key() == challenge.challenger @ SafeTreasuryError::Unauthorized
    )]
    /// CHECK: challenger is constrained to challenge.challenger and only receives/refunds lamports.
    pub challenger: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: safe is only used as lamport-transfer target and PDA seed for payout derivation.
    pub safe: UncheckedAccount<'info>,
    /// CHECK: signer and key checks are enforced in record_ruling based on authorization_mode.
    pub resolver: UncheckedAccount<'info>,
    /// CHECK: proposal proof account is validated in instruction logic via read_governance_proposal_proof.
    pub proposal: Option<UncheckedAccount<'info>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AppealRuling<'info> {
    #[account(
        mut,
        seeds = [
            b"payout",
            safe.key().as_ref(),
            payout.payout_index.to_le_bytes().as_ref(),
        ],
        bump = payout.bump,
        constraint = payout.status == 1
    )]
    pub payout: Account<'info, Payout>,
    #[account(
        mut,
        seeds = [b"challenge", payout.key().as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(
        seeds = [b"safe_policy", safe_policy.authority.as_ref()],
        bump = safe_policy.bump,
        constraint = safe_policy.authority == payout.policy_snapshot.authority
            @ SafeTreasuryError::Unauthorized
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    /// CHECK: safe is only used as PDA seed for payout derivation and lamport-transfer target.
    pub safe: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"challenge_bond_vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, ChallengeBondVault>,
    #[account(mut)]
    pub appellant: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeRuling<'info> {
    #[account(
        mut,
        seeds = [
            b"payout",
            safe.key().as_ref(),
            payout.payout_index.to_le_bytes().as_ref(),
        ],
        bump = payout.bump,
        constraint = payout.status == 1
    )]
    pub payout: Account<'info, Payout>,
    #[account(
        mut,
        seeds = [b"challenge", payout.key().as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(
        seeds = [b"safe_policy", safe_policy.authority.as_ref()],
        bump = safe_policy.bump,
        constraint = safe_policy.authority == payout.policy_snapshot.authority
            @ SafeTreasuryError::Unauthorized
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(
        mut,
        seeds = [b"challenge_bond_vault"],
        bump = vault.bump
    )]
    pub vault: Account<'info, ChallengeBondVault>,
    #[account(
        mut,
        constraint = challenger.key() == challenge.challenger @ SafeTreasuryError::Unauthorized
    )]
    /// CHECK: challenger is constrained to challenge.challenger and only receives/refunds lamports.
    pub challenger: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: safe is only used as lamport-transfer target and PDA seed for payout derivation.
    pub safe: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct RecordRulingArgs {
    pub round: u8,
    pub outcome: u8,
    pub is_final: bool,
    pub authorization_mode: u8,
    pub payload_hash: Option<[u8; 32]>,
    pub proposal_owner: Option<Pubkey>,
    pub proposal_signatory: Option<Pubkey>,
    pub proposal_state: Option<u8>,
}
