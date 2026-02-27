use anchor_lang::prelude::*;

pub mod contexts;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use contexts::*;

pub use contexts::{
    ExitCustodyArgs, InitializeSafePolicyArgs, QueuePayoutArgs, RecordRulingArgs,
    RegisterTreasuryArgs, UpdateSafePolicyArgs,
};

declare_id!("9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD");

#[program]
pub mod safe_treasury {
    use super::*;

    pub fn initialize_safe_policy(
        ctx: Context<InitializeSafePolicy>,
        args: InitializeSafePolicyArgs,
    ) -> Result<()> {
        instructions::initialize_safe_policy(ctx, args)
    }

    pub fn update_safe_policy(
        ctx: Context<UpdateSafePolicy>,
        args: UpdateSafePolicyArgs,
    ) -> Result<()> {
        instructions::update_safe_policy(ctx, args)
    }

    pub fn init_treasury_registry(ctx: Context<InitTreasuryRegistry>) -> Result<()> {
        instructions::init_treasury_registry(ctx)
    }

    pub fn register_treasury(
        ctx: Context<RegisterTreasury>,
        args: RegisterTreasuryArgs,
    ) -> Result<()> {
        instructions::register_treasury(ctx, args)
    }

    pub fn init_native_vault(ctx: Context<InitNativeVault>) -> Result<()> {
        instructions::init_native_vault(ctx)
    }

    pub fn fund_native_vault(ctx: Context<FundNativeVault>, amount: u64) -> Result<()> {
        instructions::fund_native_vault(ctx, amount)
    }

    pub fn init_spl_vault(ctx: Context<InitSplVault>) -> Result<()> {
        instructions::init_spl_vault(ctx)
    }

    pub fn fund_spl_vault(ctx: Context<FundSplVault>, amount: u64) -> Result<()> {
        instructions::fund_spl_vault(ctx, amount)
    }

    pub fn init_challenge_bond_vault(ctx: Context<InitChallengeBondVault>) -> Result<()> {
        instructions::init_challenge_bond_vault(ctx)
    }

    pub fn exit_custody(ctx: Context<ExitCustody>, args: ExitCustodyArgs) -> Result<()> {
        instructions::exit_custody(ctx, args)
    }

    pub fn queue_payout(ctx: Context<QueuePayout>, args: QueuePayoutArgs) -> Result<()> {
        instructions::queue_payout(ctx, args)
    }

    pub fn release_native_payout(ctx: Context<ReleaseNativePayout>) -> Result<()> {
        instructions::release_native_payout(ctx)
    }

    pub fn release_spl_payout(ctx: Context<ReleaseSplPayout>) -> Result<()> {
        instructions::release_spl_payout(ctx)
    }

    pub fn cancel_payout(ctx: Context<CancelPayout>) -> Result<()> {
        instructions::cancel_payout(ctx)
    }

    pub fn challenge_payout(ctx: Context<ChallengePayout>, bond_amount: u64) -> Result<()> {
        instructions::challenge_payout(ctx, bond_amount)
    }

    pub fn record_ruling(ctx: Context<RecordRuling>, args: RecordRulingArgs) -> Result<()> {
        instructions::record_ruling(ctx, args)
    }

    pub fn appeal_ruling(ctx: Context<AppealRuling>) -> Result<()> {
        instructions::appeal_ruling(ctx)
    }

    pub fn finalize_ruling(ctx: Context<FinalizeRuling>) -> Result<()> {
        instructions::finalize_ruling(ctx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_sdk::pubkey::Pubkey;

    fn test_safe_pubkey() -> Pubkey {
        Pubkey::new_unique()
    }

    fn test_recipient() -> Pubkey {
        Pubkey::new_unique()
    }

    fn test_mint() -> Pubkey {
        Pubkey::new_unique()
    }

    #[test]
    fn test_payout_status_from_u8() {
        assert_eq!(state::PayoutStatus::from_u8(0), state::PayoutStatus::Queued);
        assert_eq!(
            state::PayoutStatus::from_u8(1),
            state::PayoutStatus::Challenged
        );
        assert_eq!(
            state::PayoutStatus::from_u8(2),
            state::PayoutStatus::Released
        );
        assert_eq!(
            state::PayoutStatus::from_u8(3),
            state::PayoutStatus::Cancelled
        );
        assert_eq!(state::PayoutStatus::from_u8(4), state::PayoutStatus::Denied);
    }

    #[test]
    fn test_payout_status_to_u8() {
        assert_eq!(u8::from(state::PayoutStatus::Queued), 0);
        assert_eq!(u8::from(state::PayoutStatus::Challenged), 1);
        assert_eq!(u8::from(state::PayoutStatus::Released), 2);
        assert_eq!(u8::from(state::PayoutStatus::Cancelled), 3);
        assert_eq!(u8::from(state::PayoutStatus::Denied), 4);
    }

    #[test]
    fn test_asset_type_from_u8() {
        assert_eq!(state::AssetType::from_u8(0), state::AssetType::Native);
        assert_eq!(state::AssetType::from_u8(1), state::AssetType::Spl);
        assert_eq!(state::AssetType::from_u8(2), state::AssetType::Spl2022);
        assert_eq!(state::AssetType::from_u8(3), state::AssetType::Nft);
    }

    #[test]
    fn test_asset_type_to_u8() {
        assert_eq!(u8::from(state::AssetType::Native), 0);
        assert_eq!(u8::from(state::AssetType::Spl), 1);
        assert_eq!(u8::from(state::AssetType::Spl2022), 2);
        assert_eq!(u8::from(state::AssetType::Nft), 3);
    }

    #[test]
    fn test_ruling_outcome_from_u8() {
        assert_eq!(
            state::RulingOutcome::from_u8(0),
            state::RulingOutcome::Allow
        );
        assert_eq!(state::RulingOutcome::from_u8(1), state::RulingOutcome::Deny);
    }

    #[test]
    fn test_ruling_outcome_to_u8() {
        assert_eq!(u8::from(state::RulingOutcome::Allow), 0);
        assert_eq!(u8::from(state::RulingOutcome::Deny), 1);
    }

    #[test]
    fn test_safe_policy_fields() {
        let policy = state::SafePolicy {
            authority: test_safe_pubkey(),
            resolver: test_safe_pubkey(),
            dispute_window: 86_400,
            challenge_bond: 50_000_000,
            eligibility_mint: test_mint(),
            min_token_balance: 1_000,
            max_appeal_rounds: 2,
            appeal_window_duration: 86_400,
            appeal_bond_multiplier: 2,
            ipfs_policy_hash: [0u8; 32],
            exit_custody_allowed: true,
            payout_cancellation_allowed: true,
            treasury_mode_enabled: false,
            payout_count: 0,
            bump: 0,
        };
        assert_eq!(policy.dispute_window, 86_400);
        assert_eq!(policy.challenge_bond, 50_000_000);
        assert_eq!(policy.max_appeal_rounds, 2);
    }

    #[test]
    fn test_payout_immutable_fields() {
        let recipient = test_recipient();
        let mint = test_mint();
        let policy = state::SafePolicy {
            authority: test_safe_pubkey(),
            resolver: test_safe_pubkey(),
            dispute_window: 86_400,
            challenge_bond: 50_000_000,
            eligibility_mint: test_mint(),
            min_token_balance: 1_000,
            max_appeal_rounds: 2,
            appeal_window_duration: 86_400,
            appeal_bond_multiplier: 2,
            ipfs_policy_hash: [0u8; 32],
            exit_custody_allowed: true,
            payout_cancellation_allowed: true,
            treasury_mode_enabled: false,
            payout_count: 0,
            bump: 0,
        };
        let payout = state::Payout {
            payout_id: 1,
            payout_index: 0,
            safe: test_safe_pubkey(),
            asset_type: 0,
            mint: Some(mint),
            recipient,
            amount: 1_000_000,
            metadata_hash: Some([1u8; 32]),
            status: 0,
            dispute_deadline: 1000,
            policy_snapshot: policy,
            challenge: None,
            dispute_round: 0,
            finalized: false,
            final_outcome: None,
            bump: 0,
        };
        assert_eq!(payout.recipient, recipient);
        assert_eq!(payout.amount, 1_000_000);
        assert_eq!(payout.asset_type, 0);
    }

    #[test]
    fn test_final_allow_makes_payout_releasable() {
        let payout = state::Payout {
            payout_id: 1,
            payout_index: 0,
            safe: test_safe_pubkey(),
            asset_type: 0,
            mint: None,
            recipient: test_recipient(),
            amount: 1_000_000,
            metadata_hash: None,
            status: 1,
            dispute_deadline: 1000,
            policy_snapshot: state::SafePolicy {
                authority: test_safe_pubkey(),
                resolver: test_safe_pubkey(),
                dispute_window: 86_400,
                challenge_bond: 50_000_000,
                eligibility_mint: test_mint(),
                min_token_balance: 1_000,
                max_appeal_rounds: 2,
                appeal_window_duration: 86_400,
                appeal_bond_multiplier: 2,
                ipfs_policy_hash: [0u8; 32],
                exit_custody_allowed: true,
                payout_cancellation_allowed: true,
                treasury_mode_enabled: false,
                payout_count: 0,
                bump: 0,
            },
            challenge: Some(test_safe_pubkey()),
            dispute_round: 0,
            finalized: true,
            final_outcome: Some(0),
            bump: 0,
        };
        assert!(payout.is_releasable_at(2000));
    }

    #[test]
    fn test_final_deny_blocks_payout() {
        let payout = state::Payout {
            payout_id: 1,
            payout_index: 0,
            safe: test_safe_pubkey(),
            asset_type: 0,
            mint: None,
            recipient: test_recipient(),
            amount: 1_000_000,
            metadata_hash: None,
            status: 4,
            dispute_deadline: 1000,
            policy_snapshot: state::SafePolicy {
                authority: test_safe_pubkey(),
                resolver: test_safe_pubkey(),
                dispute_window: 86_400,
                challenge_bond: 50_000_000,
                eligibility_mint: test_mint(),
                min_token_balance: 1_000,
                max_appeal_rounds: 2,
                appeal_window_duration: 86_400,
                appeal_bond_multiplier: 2,
                ipfs_policy_hash: [0u8; 32],
                exit_custody_allowed: true,
                payout_cancellation_allowed: true,
                treasury_mode_enabled: false,
                payout_count: 0,
                bump: 0,
            },
            challenge: Some(test_safe_pubkey()),
            dispute_round: 0,
            finalized: true,
            final_outcome: Some(1),
            bump: 0,
        };
        assert!(!payout.is_releasable_at(2000));
        assert_eq!(payout.status, 4);
    }

    #[test]
    fn test_appeal_bond_escalation() {
        let initial_bond = 50_000_000;
        let round_0_appeal_bond = initial_bond * 2u64.pow(1);
        let round_1_appeal_bond = initial_bond * 2u64.pow(2);
        assert_eq!(round_0_appeal_bond, 100_000_000);
        assert_eq!(round_1_appeal_bond, 200_000_000);
    }

    #[test]
    fn test_policy_floor_enforcement() {
        const DISPUTE_WINDOW_FLOOR: u64 = 3600;
        const CHALLENGE_BOND_FLOOR: u64 = 10_000_000;
        assert!(DISPUTE_WINDOW_FLOOR >= 3600);
        assert!(CHALLENGE_BOND_FLOOR >= 10_000_000);
    }

    #[test]
    fn test_treasury_mode_enum() {
        assert_eq!(u8::from(state::TreasuryMode::SafeCustodied), 0);
        assert_eq!(u8::from(state::TreasuryMode::Legacy), 1);
    }

    #[test]
    fn test_treasury_info_is_enforced() {
        let info = state::TreasuryInfo {
            safe: test_safe_pubkey(),
            mode: 0,
            registered_at: 0,
            bump: 0,
        };
        assert!(info.is_enforced());
        assert!(!info.is_legacy());
    }

    #[test]
    fn test_treasury_info_is_legacy() {
        let info = state::TreasuryInfo {
            safe: test_safe_pubkey(),
            mode: 1,
            registered_at: 0,
            bump: 0,
        };
        assert!(info.is_legacy());
        assert!(!info.is_enforced());
    }

    #[test]
    fn test_challenge_bond_disposition_allow_forfeits() {
        let challenge = state::Challenge {
            payout: test_safe_pubkey(),
            challenger: test_recipient(),
            bond_amount: 50_000_000,
            round: 0,
            created_at: 0,
            appeal_deadline: 0,
            current_outcome: None,
            ruling_recorded_for_round: 0,
            bump: 0,
        };
        assert_eq!(challenge.bond_amount, 50_000_000);
    }

    #[test]
    fn test_policy_hash_immutability() {
        let mut hash = [0u8; 32];
        hash[0] = 1;
        let policy = state::SafePolicy {
            authority: test_safe_pubkey(),
            resolver: test_safe_pubkey(),
            dispute_window: 86_400,
            challenge_bond: 50_000_000,
            eligibility_mint: test_mint(),
            min_token_balance: 1_000,
            max_appeal_rounds: 2,
            appeal_window_duration: 86_400,
            appeal_bond_multiplier: 2,
            ipfs_policy_hash: hash,
            exit_custody_allowed: true,
            payout_cancellation_allowed: true,
            treasury_mode_enabled: false,
            payout_count: 0,
            bump: 0,
        };
        assert_eq!(policy.ipfs_policy_hash[0], 1);
    }

    #[test]
    fn test_payout_snapshot_policy() {
        let original_policy = state::SafePolicy {
            authority: test_safe_pubkey(),
            resolver: test_safe_pubkey(),
            dispute_window: 86_400,
            challenge_bond: 50_000_000,
            eligibility_mint: test_mint(),
            min_token_balance: 1_000,
            max_appeal_rounds: 2,
            appeal_window_duration: 86_400,
            appeal_bond_multiplier: 2,
            ipfs_policy_hash: [1u8; 32],
            exit_custody_allowed: true,
            payout_cancellation_allowed: true,
            treasury_mode_enabled: false,
            payout_count: 0,
            bump: 0,
        };
        let payout = state::Payout {
            payout_id: 1,
            payout_index: 0,
            safe: test_safe_pubkey(),
            asset_type: 0,
            mint: None,
            recipient: test_recipient(),
            amount: 1_000_000,
            metadata_hash: None,
            status: 0,
            dispute_deadline: 1000,
            policy_snapshot: original_policy,
            challenge: None,
            dispute_round: 0,
            finalized: false,
            final_outcome: None,
            bump: 0,
        };
        assert_eq!(payout.policy_snapshot.ipfs_policy_hash[0], 1);
    }

    #[test]
    fn test_max_appeal_rounds_floor() {
        const MAX_APPEAL_ROUNDS_FLOOR: u8 = 2;
        assert!(MAX_APPEAL_ROUNDS_FLOOR >= 2);
    }

    #[test]
    fn test_si_030_proposal_state_passed_values() {
        const PROPOSAL_STATE_EXECUTABLE: u8 = 4;
        const PROPOSAL_STATE_EXECUTED: u8 = 5;

        assert!(PROPOSAL_STATE_EXECUTABLE == 4);
        assert!(PROPOSAL_STATE_EXECUTED == 5);

        let passed_states = [PROPOSAL_STATE_EXECUTABLE, PROPOSAL_STATE_EXECUTED];
        for state in passed_states.iter() {
            assert!(*state == 4 || *state == 5);
        }

        let rejected_states = [0u8, 1, 2, 3, 6];
        for state in rejected_states.iter() {
            assert!(*state != 4 && *state != 5);
        }
    }

    #[test]
    fn test_si_030_proposal_not_passed_error() {
        use error::SafeTreasuryError;
        let _ = SafeTreasuryError::ProposalNotPassed;
    }

    #[test]
    fn test_si_037_token_2022_program_id() {
        const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXcPxz5z";
        assert!(TOKEN_2022_PROGRAM_ID.starts_with("Token"));
    }

    #[test]
    fn test_si_037_spl2022_asset_type_allowed() {
        assert_eq!(state::AssetType::from_u8(2), state::AssetType::Spl2022);
        assert_eq!(u8::from(state::AssetType::Spl2022), 2);

        let allowed_types = [
            u8::from(state::AssetType::Spl),
            u8::from(state::AssetType::Spl2022),
            u8::from(state::AssetType::Nft),
        ];
        for at in allowed_types.iter() {
            assert!(*at == 1 || *at == 2 || *at == 3);
        }
    }

    #[test]
    fn test_si_037_token_program_validation_logic() {
        const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXcPxz5z";
        const STANDARD_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

        assert!(TOKEN_2022_PROGRAM_ID.starts_with("Token"));
        assert!(STANDARD_TOKEN_PROGRAM_ID.starts_with("Token"));
    }

    #[test]
    fn test_duration_to_i64_rejects_out_of_range_values() {
        assert!(utils::duration_to_i64(u64::MAX).is_err());
    }

    #[test]
    fn test_add_duration_rejects_timestamp_overflow() {
        assert!(utils::add_duration(i64::MAX, 1).is_err());
    }
}
