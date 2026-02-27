//! Shared test helpers for safe-treasury integration tests.
//!
//! All helpers work through the program's public instruction interface —
//! no internal state is accessed directly except for post-execution assertions.

#![allow(dead_code)]

use anchor_lang::{AccountDeserialize, AnchorDeserialize, InstructionData, ToAccountMetas};
use safe_treasury::{
    state::{Challenge, ChallengeBondVault, SafePolicy},
    ID as PROGRAM_ID,
};
use solana_program::program_option::COption;
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::Account,
    clock::Clock,
    instruction::{AccountMeta, Instruction, InstructionError},
    program_pack::Pack,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction, system_program,
    transaction::{Transaction, TransactionError},
};
use spl_token::state::{AccountState as TokenAccountState, Mint};

// ──────────────────────────────────────────────────────────────────────────────
// PDA derivation
// ──────────────────────────────────────────────────────────────────────────────

pub fn policy_pda(authority: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"safe_policy", authority.as_ref()], &PROGRAM_ID)
}

/// Derive the PDA for payout number `index` (= policy.payout_count at queue time).
pub fn payout_pda(safe: Pubkey, index: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"payout", safe.as_ref(), &index.to_le_bytes()],
        &PROGRAM_ID,
    )
}

pub fn challenge_pda(payout: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"challenge", payout.as_ref()], &PROGRAM_ID)
}

pub fn bond_vault_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"challenge_bond_vault"], &PROGRAM_ID)
}

pub fn native_vault_pda(safe: Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"native_vault", safe.as_ref()], &PROGRAM_ID)
}

// ──────────────────────────────────────────────────────────────────────────────
// Program test setup
// ──────────────────────────────────────────────────────────────────────────────

pub fn make_program_test() -> ProgramTest {
    ProgramTest::new(
        "safe_treasury",
        PROGRAM_ID,
        processor!(safe_treasury::entry),
    )
}

/// Shortcut: start and return context.
pub async fn setup() -> ProgramTestContext {
    make_program_test().start_with_context().await
}

// ──────────────────────────────────────────────────────────────────────────────
// SOL funding helper (BanksClient has no airdrop in 1.18.x)
// ──────────────────────────────────────────────────────────────────────────────

pub async fn airdrop(ctx: &mut ProgramTestContext, recipient: Pubkey, lamports_amount: u64) {
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let ix = system_instruction::transfer(&ctx.payer.pubkey(), &recipient, lamports_amount);
    let tx = Transaction::new_signed_with_payer(
        &[ix],
        Some(&ctx.payer.pubkey()),
        &[&ctx.payer],
        blockhash,
    );
    ctx.banks_client.process_transaction(tx).await.unwrap();
}

// ──────────────────────────────────────────────────────────────────────────────
// Clock manipulation
// ──────────────────────────────────────────────────────────────────────────────

pub async fn advance_clock(ctx: &mut ProgramTestContext, seconds: i64) {
    let mut clock: Clock = ctx.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp += seconds;
    ctx.set_sysvar(&clock);
}

// ──────────────────────────────────────────────────────────────────────────────
// Default arg factories
// ──────────────────────────────────────────────────────────────────────────────

pub fn default_policy_args(
    resolver: Pubkey,
    eligibility_mint: Pubkey,
) -> safe_treasury::InitializeSafePolicyArgs {
    safe_treasury::InitializeSafePolicyArgs {
        resolver,
        dispute_window: 86_400,     // 24 h
        challenge_bond: 50_000_000, // 0.05 SOL
        eligibility_mint,
        min_token_balance: 1_000,
        max_appeal_rounds: 2,
        appeal_window_duration: 86_400,
        ipfs_policy_hash: [0u8; 32],
        treasury_mode_enabled: false,
        payout_cancellation_allowed: true,
    }
}

pub fn default_queue_args(recipient: Pubkey) -> safe_treasury::QueuePayoutArgs {
    safe_treasury::QueuePayoutArgs {
        asset_type: 0, // Native SOL
        mint: None,
        recipient,
        amount: 1_000_000,
        metadata_hash: None,
        // Mode 0 = direct authority signer; no governance proposal needed.
        authorization_mode: 0,
        payload_hash: None,
        proposal_owner: None,
        proposal_signatory: None,
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Instruction builders
// All AccountMeta signer flags match the Anchor #[derive(Accounts)] structs:
//  - PDAs are never signers
//  - UncheckedAccount without #[account(signer)] is not a signer
//  - Only Signer<'info> fields are is_signer=true
// ──────────────────────────────────────────────────────────────────────────────

pub fn ix_init_bond_vault(payer: Pubkey) -> Instruction {
    let (vault, _) = bond_vault_pda();
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(vault, false),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::InitChallengeBondVault {}.data(),
    }
}

pub fn ix_init_policy(
    authority: Pubkey,
    args: safe_treasury::InitializeSafePolicyArgs,
) -> Instruction {
    let (policy, _) = policy_pda(authority);
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(policy, false),
            AccountMeta::new(authority, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::InitializeSafePolicy { args }.data(),
    }
}

pub fn ix_update_policy(
    authority: Pubkey,
    args: safe_treasury::UpdateSafePolicyArgs,
) -> Instruction {
    let (policy, _) = policy_pda(authority);
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(policy, false),
            AccountMeta::new(authority, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::UpdateSafePolicy { args }.data(),
    }
}

pub fn ix_init_native_vault(safe: Pubkey, authority: Pubkey) -> Instruction {
    let (vault, _) = native_vault_pda(safe);
    let (policy, _) = policy_pda(authority);
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(vault, false),
            AccountMeta::new(safe, false),
            AccountMeta::new_readonly(policy, false),
            AccountMeta::new(authority, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::InitNativeVault {}.data(),
    }
}

pub fn ix_fund_native_vault(
    safe: Pubkey,
    authority: Pubkey,
    payer: Pubkey,
    amount: u64,
) -> Instruction {
    let (vault, _) = native_vault_pda(safe);
    let (policy, _) = policy_pda(authority);
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(vault, false),
            AccountMeta::new(safe, false),
            AccountMeta::new_readonly(policy, false),
            AccountMeta::new(authority, true),
            AccountMeta::new(payer, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::FundNativeVault { amount }.data(),
    }
}

pub fn ix_queue_payout(
    safe: Pubkey,
    policy: Pubkey,
    payer: Pubkey,
    // authority must be the safe_policy.authority; it signs in mode 0.
    authority: Pubkey,
    // payout_index = policy.payout_count at the moment of the call.
    payout_index: u64,
    args: safe_treasury::QueuePayoutArgs,
) -> Instruction {
    let (payout, _) = payout_pda(safe, payout_index);
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payout, false),
            AccountMeta::new(safe, false),
            AccountMeta::new(policy, false),
            AccountMeta::new(payer, true),
            // authority: is_signer=true for mode 0, false for mode 1 (DAO proposal)
            AccountMeta::new_readonly(authority, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::QueuePayout { args }.data(),
    }
}

pub fn ix_challenge_payout(
    payout: Pubkey,
    safe: Pubkey,
    policy: Pubkey,
    challenger: Pubkey,
    challenger_token_account: Pubkey,
    bond_amount: u64,
) -> Instruction {
    let (challenge, _) = challenge_pda(payout);
    let (vault, _) = bond_vault_pda();
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payout, false),
            AccountMeta::new(challenge, false),
            AccountMeta::new(policy, false),
            AccountMeta::new(safe, false),
            AccountMeta::new(vault, false),
            AccountMeta::new_readonly(challenger_token_account, false),
            AccountMeta::new(challenger, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::ChallengePayout { bond_amount }.data(),
    }
}

pub fn ix_record_ruling(
    payout: Pubkey,
    challenge: Pubkey,
    safe: Pubkey,
    policy: Pubkey,
    challenger: Pubkey,
    resolver: Pubkey,
    args: safe_treasury::RecordRulingArgs,
) -> Instruction {
    let (vault, _) = bond_vault_pda();
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payout, false),
            AccountMeta::new(challenge, false),
            AccountMeta::new_readonly(policy, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(challenger, false),
            AccountMeta::new(safe, false),
            AccountMeta::new(resolver, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::RecordRuling { args }.data(),
    }
}

pub fn ix_appeal_ruling(
    payout: Pubkey,
    challenge: Pubkey,
    safe: Pubkey,
    policy: Pubkey,
    appellant: Pubkey,
) -> Instruction {
    let (vault, _) = bond_vault_pda();
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payout, false),
            AccountMeta::new(challenge, false),
            AccountMeta::new_readonly(policy, false),
            AccountMeta::new(safe, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(appellant, true),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::AppealRuling {}.data(),
    }
}

pub fn ix_finalize_ruling(
    payout: Pubkey,
    challenge: Pubkey,
    safe: Pubkey,
    policy: Pubkey,
    challenger: Pubkey,
) -> Instruction {
    let (vault, _) = bond_vault_pda();
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payout, false),
            AccountMeta::new(challenge, false),
            AccountMeta::new_readonly(policy, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(challenger, false),
            AccountMeta::new(safe, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::FinalizeRuling {}.data(),
    }
}

pub fn ix_release_native_payout(payout: Pubkey, safe: Pubkey, recipient: Pubkey) -> Instruction {
    let (vault, _) = native_vault_pda(safe);
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payout, false),
            AccountMeta::new(vault, false),
            AccountMeta::new(safe, false),
            AccountMeta::new(recipient, false),
            AccountMeta::new_readonly(system_program::ID, false),
        ],
        data: safe_treasury::instruction::ReleaseNativePayout {}.data(),
    }
}

pub fn ix_cancel_payout(
    payout: Pubkey,
    safe: Pubkey,
    policy: Pubkey,
    authority: Pubkey,
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payout, false),
            AccountMeta::new_readonly(policy, false),
            AccountMeta::new(safe, false),
            AccountMeta::new(authority, true),
        ],
        data: safe_treasury::instruction::CancelPayout {}.data(),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Transaction helpers
// ──────────────────────────────────────────────────────────────────────────────

pub async fn send(
    ctx: &mut ProgramTestContext,
    instructions: &[Instruction],
    signers: &[&Keypair],
) -> Result<(), TransactionError> {
    let blockhash = ctx.banks_client.get_latest_blockhash().await.unwrap();
    let mut all_signers = vec![&ctx.payer];
    all_signers.extend_from_slice(signers);
    let tx = Transaction::new_signed_with_payer(
        instructions,
        Some(&ctx.payer.pubkey()),
        &all_signers,
        blockhash,
    );
    ctx.banks_client
        .process_transaction(tx)
        .await
        .map_err(|e| e.unwrap())
}

pub async fn send_ok(ctx: &mut ProgramTestContext, ixs: &[Instruction], signers: &[&Keypair]) {
    send(ctx, ixs, signers)
        .await
        .expect("transaction should succeed");
}

pub async fn send_err(
    ctx: &mut ProgramTestContext,
    ixs: &[Instruction],
    signers: &[&Keypair],
) -> u32 {
    let err = send(ctx, ixs, signers)
        .await
        .expect_err("transaction should fail");
    match err {
        TransactionError::InstructionError(_, InstructionError::Custom(code)) => code,
        other => panic!("expected Custom error, got {:?}", other),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Account state readers
// ──────────────────────────────────────────────────────────────────────────────

pub async fn read_policy(ctx: &mut ProgramTestContext, authority: Pubkey) -> SafePolicy {
    let (pda, _) = policy_pda(authority);
    let account = ctx.banks_client.get_account(pda).await.unwrap().unwrap();
    SafePolicy::try_deserialize(&mut account.data.as_slice()).unwrap()
}

pub async fn read_payout(
    ctx: &mut ProgramTestContext,
    safe: Pubkey,
    index: u64,
) -> safe_treasury::state::Payout {
    let (pda, _) = payout_pda(safe, index);
    let account = ctx.banks_client.get_account(pda).await.unwrap().unwrap();
    safe_treasury::state::Payout::try_deserialize(&mut account.data.as_slice()).unwrap()
}

pub async fn read_challenge(ctx: &mut ProgramTestContext, payout: Pubkey) -> Challenge {
    let (pda, _) = challenge_pda(payout);
    let account = ctx.banks_client.get_account(pda).await.unwrap().unwrap();
    Challenge::try_deserialize(&mut account.data.as_slice()).unwrap()
}

pub async fn read_bond_vault(ctx: &mut ProgramTestContext) -> ChallengeBondVault {
    let (pda, _) = bond_vault_pda();
    let account = ctx.banks_client.get_account(pda).await.unwrap().unwrap();
    ChallengeBondVault::try_deserialize(&mut account.data.as_slice()).unwrap()
}

pub async fn lamports(ctx: &mut ProgramTestContext, pubkey: Pubkey) -> u64 {
    ctx.banks_client
        .get_account(pubkey)
        .await
        .unwrap()
        .map(|a| a.lamports)
        .unwrap_or(0)
}

// ──────────────────────────────────────────────────────────────────────────────
// Pre-built token account injection
// ──────────────────────────────────────────────────────────────────────────────

/// Injects a SPL mint and a token account holding `balance` tokens into ProgramTest.
/// Returns (mint_pubkey, token_account_pubkey).
pub fn inject_token_account(
    pt: &mut ProgramTest,
    owner: Pubkey,
    balance: u64,
) -> (Pubkey, Pubkey) {
    let mint_pubkey = Pubkey::new_unique();
    let token_account_pubkey = Pubkey::new_unique();
    let rent_exempt_lamports = 1_000_000;

    let mut mint_data = vec![0u8; Mint::LEN];
    Mint::pack(
        Mint {
            mint_authority: COption::None,
            supply: balance,
            decimals: 6,
            is_initialized: true,
            freeze_authority: COption::None,
        },
        &mut mint_data,
    )
    .unwrap();
    pt.add_account(
        mint_pubkey,
        Account {
            lamports: rent_exempt_lamports,
            data: mint_data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    );

    let mut token_data = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account::pack(
        spl_token::state::Account {
            mint: mint_pubkey,
            owner,
            amount: balance,
            delegate: COption::None,
            state: TokenAccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        },
        &mut token_data,
    )
    .unwrap();
    pt.add_account(
        token_account_pubkey,
        Account {
            lamports: rent_exempt_lamports,
            data: token_data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    );

    (mint_pubkey, token_account_pubkey)
}

// ──────────────────────────────────────────────────────────────────────────────
// Common setup sequence: init bond vault + policy
// ──────────────────────────────────────────────────────────────────────────────

/// Init the global challenge bond vault and a safe policy.
/// Returns (policy_pubkey, vault_pubkey).
pub async fn bootstrap(
    ctx: &mut ProgramTestContext,
    authority: &Keypair,
    policy_args: safe_treasury::InitializeSafePolicyArgs,
) -> (Pubkey, Pubkey) {
    let (policy, _) = policy_pda(authority.pubkey());
    let (vault, _) = bond_vault_pda();

    send_ok(ctx, &[ix_init_bond_vault(ctx.payer.pubkey())], &[]).await;
    send_ok(
        ctx,
        &[ix_init_policy(authority.pubkey(), policy_args)],
        &[authority],
    )
    .await;

    (policy, vault)
}
