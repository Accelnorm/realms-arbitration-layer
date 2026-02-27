use cvlr::prelude::*;
use safe_treasury::contexts::QueuePayoutArgs;
use safe_treasury::state::{
    AssetType, Payout, PayoutStatus, RulingOutcome, SafePolicy, TreasuryInfo, TreasuryMode,
};
use safe_treasury::utils::{
    compute_payout_id, compute_queue_payload_hash, compute_ruling_payload_hash,
};
use solana_program::pubkey::Pubkey;

fn nondet_pubkey() -> Pubkey {
    Pubkey::new_from_array(nondet())
}

fn nondet_option_pubkey() -> Option<Pubkey> {
    if nondet::<bool>() {
        Some(nondet_pubkey())
    } else {
        None
    }
}

fn nondet_option_hash32() -> Option<[u8; 32]> {
    if nondet::<bool>() {
        Some(nondet())
    } else {
        None
    }
}

fn nondet_option_u8() -> Option<u8> {
    if nondet::<bool>() {
        Some(nondet())
    } else {
        None
    }
}

fn nondet_queue_payout_args() -> QueuePayoutArgs {
    QueuePayoutArgs {
        asset_type: nondet(),
        mint: nondet_option_pubkey(),
        recipient: nondet_pubkey(),
        amount: nondet(),
        metadata_hash: nondet_option_hash32(),
        authorization_mode: nondet(),
        payload_hash: nondet_option_hash32(),
        proposal_owner: nondet_option_pubkey(),
        proposal_signatory: nondet_option_pubkey(),
    }
}

fn nondet_safe_policy() -> SafePolicy {
    SafePolicy {
        authority: nondet_pubkey(),
        resolver: nondet_pubkey(),
        dispute_window: nondet(),
        challenge_bond: nondet(),
        eligibility_mint: nondet_pubkey(),
        min_token_balance: nondet(),
        max_appeal_rounds: nondet(),
        appeal_window_duration: nondet(),
        appeal_bond_multiplier: nondet(),
        ipfs_policy_hash: nondet(),
        exit_custody_allowed: nondet(),
        payout_cancellation_allowed: nondet(),
        treasury_mode_enabled: nondet(),
        payout_count: nondet(),
        bump: nondet(),
    }
}

fn nondet_payout() -> Payout {
    Payout {
        payout_id: nondet(),
        payout_index: nondet(),
        safe: nondet_pubkey(),
        asset_type: nondet(),
        mint: nondet_option_pubkey(),
        recipient: nondet_pubkey(),
        amount: nondet(),
        metadata_hash: nondet_option_hash32(),
        status: nondet(),
        dispute_deadline: nondet(),
        policy_snapshot: nondet_safe_policy(),
        challenge: nondet_option_pubkey(),
        dispute_round: nondet(),
        finalized: nondet(),
        final_outcome: nondet_option_u8(),
        bump: nondet(),
    }
}

#[rule]
pub fn rule_payout_status_roundtrip() {
    let s: u8 = nondet();
    cvlr_assume!(s <= 4);

    let roundtrip = u8::from(PayoutStatus::from_u8(s));
    cvlr_assert_eq!(roundtrip, s);
}

#[rule]
pub fn rule_asset_type_roundtrip() {
    let a: u8 = nondet();
    cvlr_assume!(a <= 3);

    let roundtrip = u8::from(AssetType::from_u8(a));
    cvlr_assert_eq!(roundtrip, a);
}

#[rule]
pub fn rule_ruling_outcome_roundtrip() {
    let o: u8 = nondet();
    cvlr_assume!(o <= 1);

    let roundtrip = u8::from(RulingOutcome::from_u8(o));
    cvlr_assert_eq!(roundtrip, o);
}

#[rule]
pub fn rule_treasury_mode_roundtrip() {
    let m: u8 = nondet();
    cvlr_assume!(m <= 1);

    let roundtrip = u8::from(TreasuryMode::from_u8(m));
    cvlr_assert_eq!(roundtrip, m);
}

#[rule]
pub fn rule_treasury_info_helpers_follow_mode_discriminant() {
    let mode: u8 = nondet();
    cvlr_assume!(mode <= 1);

    let info = TreasuryInfo {
        safe: nondet_pubkey(),
        mode,
        registered_at: nondet(),
        bump: nondet(),
    };

    cvlr_assert_eq!(info.is_enforced(), mode == 0);
    cvlr_assert_eq!(info.is_legacy(), mode == 1);
}

#[rule]
pub fn rule_compute_payout_id_is_deterministic() {
    let args = nondet_queue_payout_args();
    let safe = nondet_pubkey();

    let lhs = compute_payout_id(&args, safe);
    let rhs = compute_payout_id(&args, safe);

    cvlr_assert_eq!(lhs, rhs);
}

#[rule]
pub fn rule_compute_queue_payload_hash_is_deterministic() {
    let args = nondet_queue_payout_args();
    let safe_policy = nondet_pubkey();

    let lhs = compute_queue_payload_hash(&args, safe_policy);
    let rhs = compute_queue_payload_hash(&args, safe_policy);

    cvlr_assert_eq!(lhs, rhs);
}

#[rule]
pub fn rule_compute_ruling_payload_hash_is_deterministic() {
    let payout_id: u64 = nondet();
    let round: u8 = nondet();
    let outcome: u8 = nondet();
    let is_final: bool = nondet();

    let lhs = compute_ruling_payload_hash(payout_id, round, outcome, is_final);
    let rhs = compute_ruling_payload_hash(payout_id, round, outcome, is_final);

    cvlr_assert_eq!(lhs, rhs);
}

#[rule]
pub fn rule_payout_releasable_without_challenge_after_deadline() {
    let mut payout = nondet_payout();
    let deadline: i64 = nondet();
    let now: i64 = nondet();
    cvlr_assume!(now >= deadline);

    payout.challenge = None;
    payout.dispute_deadline = deadline;

    cvlr_assert!(payout.is_releasable_at(now));
}

#[rule]
pub fn rule_payout_not_releasable_without_challenge_before_deadline() {
    let mut payout = nondet_payout();
    let deadline: i64 = nondet();
    let now: i64 = nondet();
    cvlr_assume!(now < deadline);

    payout.challenge = None;
    payout.dispute_deadline = deadline;

    cvlr_assert!(!payout.is_releasable_at(now));
}

#[rule]
pub fn rule_payout_releasable_when_finalized_allow() {
    let mut payout = nondet_payout();
    let now: i64 = nondet();

    payout.challenge = Some(nondet_pubkey());
    payout.finalized = true;
    payout.final_outcome = Some(u8::from(RulingOutcome::Allow));

    cvlr_assert!(payout.is_releasable_at(now));
}

#[rule]
pub fn rule_payout_not_releasable_when_challenged_not_finalized() {
    let mut payout = nondet_payout();
    let now: i64 = nondet();

    payout.challenge = Some(nondet_pubkey());
    payout.finalized = false;
    payout.final_outcome = Some(u8::from(RulingOutcome::Allow));

    cvlr_assert!(!payout.is_releasable_at(now));
}

#[rule]
pub fn rule_payout_not_releasable_when_finalized_deny() {
    let mut payout = nondet_payout();
    let now: i64 = nondet();

    payout.challenge = Some(nondet_pubkey());
    payout.finalized = true;
    payout.final_outcome = Some(u8::from(RulingOutcome::Deny));

    cvlr_assert!(!payout.is_releasable_at(now));
}
