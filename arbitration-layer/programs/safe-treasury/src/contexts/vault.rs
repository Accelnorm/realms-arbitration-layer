use crate::error::SafeTreasuryError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct InitNativeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + NativeVault::INIT_SPACE,
        seeds = [b"native_vault", safe.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, NativeVault>,
    #[account(mut)]
    /// CHECK: safe is only used as PDA seed for vault derivation and stored pubkey reference.
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

#[derive(Accounts)]
pub struct FundNativeVault<'info> {
    #[account(
        mut,
        seeds = [b"native_vault", safe.key().as_ref()],
        bump = vault.bump,
        constraint = vault.safe == safe.key() @ SafeTreasuryError::InvalidVaultAccount,
        constraint = vault.authority == safe_policy.authority @ SafeTreasuryError::InvalidVaultAccount
    )]
    pub vault: Account<'info, NativeVault>,
    #[account(mut)]
    /// CHECK: safe is only used as PDA seed for vault derivation and key equality checks.
    pub safe: UncheckedAccount<'info>,
    #[account(
        seeds = [b"safe_policy", authority.key().as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitSplVault<'info> {
    #[account(
        init,
        payer = authority,
        seeds = [b"spl_vault", safe_policy.key().as_ref(), mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = safe_policy,
        token::token_program = token_program
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"safe_policy", authority.key().as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct FundSplVault<'info> {
    #[account(
        mut,
        seeds = [b"spl_vault", safe_policy.key().as_ref(), mint.key().as_ref()],
        bump,
        constraint = vault_token_account.mint == mint.key() @ crate::error::SafeTreasuryError::MintMismatch,
        constraint = vault_token_account.owner == safe_policy.key() @ crate::error::SafeTreasuryError::Unauthorized
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        seeds = [b"safe_policy", safe_policy.authority.as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(
        mut,
        constraint = funder_token_account.owner == funder.key() @ crate::error::SafeTreasuryError::Unauthorized,
        constraint = funder_token_account.mint == mint.key() @ crate::error::SafeTreasuryError::MintMismatch
    )]
    pub funder_token_account: InterfaceAccount<'info, TokenAccount>,
    pub funder: Signer<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitChallengeBondVault<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + ChallengeBondVault::INIT_SPACE,
        seeds = [b"challenge_bond_vault"],
        bump
    )]
    pub vault: Account<'info, ChallengeBondVault>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExitCustody<'info> {
    #[account(
        seeds = [b"safe_policy", safe_policy.authority.as_ref()],
        bump = safe_policy.bump
    )]
    pub safe_policy: Account<'info, SafePolicy>,
    #[account(mut)]
    /// CHECK: vault account is validated in instruction logic by owner, seeds, and account data decoding.
    pub vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub vault_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    /// CHECK: recipient pubkey is compared against args and only used as transfer destination.
    pub recipient: UncheckedAccount<'info>,
    #[account(mut)]
    pub recipient_token_account: Option<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Option<InterfaceAccount<'info, Mint>>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize)]
pub struct ExitCustodyArgs {
    pub asset_type: u8,
    pub recipient: Pubkey,
}
