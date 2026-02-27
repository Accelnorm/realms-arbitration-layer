use anchor_lang::prelude::*;

#[event]
pub struct TreasuryPolicySet {
    pub safe_policy: Pubkey,
    pub authority: Pubkey,
    pub resolver: Pubkey,
    pub dispute_window: u64,
    pub challenge_bond: u64,
    pub max_appeal_rounds: u8,
}

#[event]
pub struct TreasuryRegistered {
    pub safe: Pubkey,
    pub mode: u8,
    pub is_enforced: bool,
}

#[event]
pub struct PayoutQueued {
    pub safe: Pubkey,
    pub payout_id: u64,
    pub asset_type: u8,
    pub mint: Option<Pubkey>,
    pub recipient: Pubkey,
    pub amount: u64,
    pub dispute_deadline: i64,
    pub policy_hash: [u8; 32],
}

#[event]
pub struct PayoutChallenged {
    pub safe: Pubkey,
    pub payout_id: u64,
    pub dispute_id: Pubkey,
    pub challenger: Pubkey,
    pub bond_amount: u64,
    pub round: u8,
}

#[event]
pub struct RulingRecorded {
    pub safe: Pubkey,
    pub payout_id: u64,
    pub dispute_id: Pubkey,
    pub round: u8,
    pub outcome: u8,
    pub is_final: bool,
}

#[event]
pub struct RulingAppealed {
    pub safe: Pubkey,
    pub payout_id: u64,
    pub dispute_id: Pubkey,
    pub new_round: u8,
    pub bond_amount: u64,
}

#[event]
pub struct RulingFinalized {
    pub safe: Pubkey,
    pub payout_id: u64,
    pub dispute_id: Pubkey,
    pub round: u8,
    pub outcome: u8,
}

#[event]
pub struct PayoutReleased {
    pub safe: Pubkey,
    pub payout_id: u64,
    pub recipient: Pubkey,
    pub amount: u64,
    pub asset_type: u8,
}

#[event]
pub struct PayoutDenied {
    pub safe: Pubkey,
    pub payout_id: u64,
}

#[event]
pub struct PayoutCancelled {
    pub safe: Pubkey,
    pub payout_id: u64,
}

#[event]
pub struct CustodyExited {
    pub safe: Pubkey,
    pub asset_type: u8,
    pub recipient: Pubkey,
}
