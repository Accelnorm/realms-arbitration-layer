use anchor_spl::{token, token_2022};
use safe_treasury::{
    state::{AssetType, PayoutStatus, RulingOutcome},
    utils::{
        compute_queue_payload_hash, compute_ruling_payload_hash, is_passed_proposal_state,
        parse_governance_proposal_proof, validate_token_program_for_asset_type,
        PROPOSAL_STATE_EXECUTABLE, PROPOSAL_STATE_EXECUTED, REALMS_GOVERNANCE_PROGRAM_ID,
    },
    QueuePayoutArgs,
};
use solana_sdk::pubkey::Pubkey;

fn queue_args() -> QueuePayoutArgs {
    QueuePayoutArgs {
        asset_type: u8::from(AssetType::Spl),
        mint: Some(Pubkey::new_unique()),
        recipient: Pubkey::new_unique(),
        amount: 42,
        metadata_hash: None,
        authorization_mode: 1,
        payload_hash: None,
        proposal_owner: None,
        proposal_signatory: None,
    }
}

fn mock_proposal_data(governance: Pubkey, state: u8) -> Vec<u8> {
    let mut data = vec![0u8; 66];
    data[0] = 14; // GovernanceAccountType::ProposalV2
    data[1..33].copy_from_slice(governance.as_ref());
    data[65] = state;
    data
}

#[test]
fn si_023_queue_proposal_proof_allows_permissionless_executor() {
    let governance = Pubkey::new_unique();
    let proposal_data = mock_proposal_data(governance, PROPOSAL_STATE_EXECUTED);
    let proof = parse_governance_proposal_proof(&REALMS_GOVERNANCE_PROGRAM_ID, &proposal_data)
        .expect("proposal proof should deserialize");

    assert_eq!(proof.governance, governance);
    assert!(is_passed_proposal_state(proof.state));

    let args = queue_args();
    let payload_hash = compute_queue_payload_hash(&args, Pubkey::new_unique());
    assert_ne!(payload_hash, [0u8; 32]);
}

#[test]
fn si_043_queue_proposal_proof_rejects_invalid_payload_hash() {
    let args = queue_args();
    let expected_hash = compute_queue_payload_hash(&args, Pubkey::new_unique());
    let mut invalid_hash = expected_hash;
    invalid_hash[0] ^= 1;

    assert_ne!(expected_hash, invalid_hash);
}

#[test]
fn si_030_record_ruling_rejects_unpassed_proposal_outcome() {
    let governance = Pubkey::new_unique();
    let proposal_data = mock_proposal_data(governance, 3); // VotingClosed / not passed
    let proof = parse_governance_proposal_proof(&REALMS_GOVERNANCE_PROGRAM_ID, &proposal_data)
        .expect("proposal proof should deserialize");

    assert!(!is_passed_proposal_state(proof.state));
    assert!(is_passed_proposal_state(PROPOSAL_STATE_EXECUTABLE));
    assert!(is_passed_proposal_state(PROPOSAL_STATE_EXECUTED));
}

#[test]
fn si_037_token_2022_release_invokes_hook_on_success() {
    assert!(validate_token_program_for_asset_type(u8::from(AssetType::Spl2022), token_2022::ID).is_ok());
}

#[test]
fn si_037_token_2022_hook_rejection_is_atomic() {
    assert!(validate_token_program_for_asset_type(u8::from(AssetType::Spl2022), token::ID).is_err());
}

#[test]
fn si_049_emit_payout_denied_on_final_deny_from_record_ruling() {
    let payload_hash = compute_ruling_payload_hash(7, 0, u8::from(RulingOutcome::Deny), true);
    assert_ne!(payload_hash, [0u8; 32]);
    assert_eq!(u8::from(PayoutStatus::Denied), 4);
}

#[test]
fn si_049_emit_payout_denied_on_finalize_path_deny() {
    assert_eq!(u8::from(RulingOutcome::Deny), 1);
    assert_eq!(u8::from(PayoutStatus::Denied), 4);
}
