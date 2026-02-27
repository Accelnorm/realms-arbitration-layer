use anchor_lang::prelude::*;

#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Copy)]
pub enum PayoutStatus {
    Queued,
    Challenged,
    Released,
    Cancelled,
    Denied,
}

impl PayoutStatus {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => PayoutStatus::Queued,
            1 => PayoutStatus::Challenged,
            2 => PayoutStatus::Released,
            3 => PayoutStatus::Cancelled,
            4 => PayoutStatus::Denied,
            // Explicit panic on invalid discriminant: a silent fallback would
            // mask state-corruption bugs at the cost of a slightly less
            // descriptive error.  In practice this can only be reached by
            // direct account data manipulation (bypassing Anchor's type checks).
            _ => panic!("invalid PayoutStatus discriminant: {v}"),
        }
    }
}

impl From<PayoutStatus> for u8 {
    fn from(s: PayoutStatus) -> u8 {
        match s {
            PayoutStatus::Queued => 0,
            PayoutStatus::Challenged => 1,
            PayoutStatus::Released => 2,
            PayoutStatus::Cancelled => 3,
            PayoutStatus::Denied => 4,
        }
    }
}

#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Copy)]
pub enum AssetType {
    Native,
    Spl,
    Spl2022,
    Nft,
}

impl AssetType {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => AssetType::Native,
            1 => AssetType::Spl,
            2 => AssetType::Spl2022,
            3 => AssetType::Nft,
            _ => panic!("invalid AssetType discriminant: {v}"),
        }
    }
}

impl From<AssetType> for u8 {
    fn from(s: AssetType) -> u8 {
        match s {
            AssetType::Native => 0,
            AssetType::Spl => 1,
            AssetType::Spl2022 => 2,
            AssetType::Nft => 3,
        }
    }
}

#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Copy)]
pub enum RulingOutcome {
    Allow,
    Deny,
}

impl RulingOutcome {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => RulingOutcome::Allow,
            1 => RulingOutcome::Deny,
            _ => panic!("invalid RulingOutcome discriminant: {v}"),
        }
    }
}

impl From<RulingOutcome> for u8 {
    fn from(s: RulingOutcome) -> u8 {
        match s {
            RulingOutcome::Allow => 0,
            RulingOutcome::Deny => 1,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct SafePolicy {
    pub authority: Pubkey,
    pub resolver: Pubkey,
    pub dispute_window: u64,
    pub challenge_bond: u64,
    pub eligibility_mint: Pubkey,
    pub min_token_balance: u64,
    pub max_appeal_rounds: u8,
    pub appeal_window_duration: u64,
    pub appeal_bond_multiplier: u8,
    pub ipfs_policy_hash: [u8; 32],
    pub exit_custody_allowed: bool,
    pub payout_cancellation_allowed: bool,
    pub treasury_mode_enabled: bool,
    pub payout_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Payout {
    pub payout_id: u64,
    pub payout_index: u64,
    pub safe: Pubkey,
    pub asset_type: u8,
    pub mint: Option<Pubkey>,
    pub recipient: Pubkey,
    pub amount: u64,
    pub metadata_hash: Option<[u8; 32]>,
    pub status: u8,
    pub dispute_deadline: i64,
    pub policy_snapshot: SafePolicy,
    pub challenge: Option<Pubkey>,
    pub dispute_round: u8,
    pub finalized: bool,
    pub final_outcome: Option<u8>,
    pub bump: u8,
}

impl Payout {
    pub fn is_releasable_at(&self, unix_timestamp: i64) -> bool {
        if self.challenge.is_none() {
            unix_timestamp >= self.dispute_deadline
        } else if self.finalized {
            self.final_outcome == Some(0)
        } else {
            false
        }
    }

    pub fn is_releasable(&self) -> bool {
        match Clock::get() {
            Ok(clock) => self.is_releasable_at(clock.unix_timestamp),
            Err(_) => false,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct Challenge {
    pub payout: Pubkey,
    pub challenger: Pubkey,
    pub bond_amount: u64,
    pub round: u8,
    pub created_at: i64,
    pub appeal_deadline: i64,
    pub current_outcome: Option<u8>,
    pub ruling_recorded_for_round: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct NativeVault {
    pub safe: Pubkey,
    pub authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SplVault {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ChallengeBondVault {
    pub total_bonds_held: u64,
    pub bump: u8,
}

#[derive(Clone, Debug, AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Copy)]
pub enum TreasuryMode {
    SafeCustodied,
    Legacy,
}

impl TreasuryMode {
    pub fn from_u8(v: u8) -> Self {
        match v {
            0 => TreasuryMode::SafeCustodied,
            1 => TreasuryMode::Legacy,
            _ => panic!("invalid TreasuryMode discriminant: {v}"),
        }
    }
}

impl From<TreasuryMode> for u8 {
    fn from(s: TreasuryMode) -> u8 {
        match s {
            TreasuryMode::SafeCustodied => 0,
            TreasuryMode::Legacy => 1,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct TreasuryInfo {
    pub safe: Pubkey,
    pub mode: u8,
    pub registered_at: i64,
    pub bump: u8,
}

impl TreasuryInfo {
    pub fn is_enforced(&self) -> bool {
        self.mode == 0
    }

    pub fn is_legacy(&self) -> bool {
        self.mode == 1
    }
}

#[account]
#[derive(InitSpace)]
pub struct TreasuryRegistry {
    pub treasury_count: u64,
    pub bump: u8,
}
