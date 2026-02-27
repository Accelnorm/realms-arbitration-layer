use crate::contexts::*;
use crate::error::SafeTreasuryError;
use crate::events::*;
use crate::state::*;
use anchor_lang::prelude::*;

pub fn init_treasury_registry(ctx: Context<InitTreasuryRegistry>) -> Result<()> {
    let registry = &mut ctx.accounts.registry;
    registry.treasury_count = 0;
    registry.bump = ctx.bumps.registry;
    Ok(())
}

pub fn register_treasury(ctx: Context<RegisterTreasury>, args: RegisterTreasuryArgs) -> Result<()> {
    let treasury_info = &mut ctx.accounts.treasury_info;
    let registry = &mut ctx.accounts.registry;
    let safe_policy = &ctx.accounts.safe_policy;

    require!(
        ctx.accounts.authority.key() == safe_policy.authority,
        SafeTreasuryError::Unauthorized
    );

    require!(
        args.mode == u8::from(TreasuryMode::SafeCustodied)
            || args.mode == u8::from(TreasuryMode::Legacy),
        SafeTreasuryError::InvalidTreasuryMode
    );

    if args.mode == u8::from(TreasuryMode::SafeCustodied) {
        require!(
            safe_policy.treasury_mode_enabled,
            SafeTreasuryError::InvalidTreasuryMode
        );
    }

    treasury_info.safe = ctx.accounts.safe.key();
    treasury_info.mode = args.mode;
    treasury_info.bump = ctx.bumps.treasury_info;

    let clock = Clock::get()?;
    treasury_info.registered_at = clock.unix_timestamp;

    registry.treasury_count = registry
        .treasury_count
        .checked_add(1)
        .ok_or(SafeTreasuryError::ArithmeticOverflow)?;

    emit!(TreasuryRegistered {
        safe: treasury_info.safe,
        mode: args.mode,
        is_enforced: args.mode == 0,
    });

    Ok(())
}
