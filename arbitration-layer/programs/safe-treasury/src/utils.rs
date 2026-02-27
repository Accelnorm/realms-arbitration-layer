use crate::contexts::QueuePayoutArgs;
use crate::error::SafeTreasuryError;
use crate::state::AssetType;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;
use anchor_lang::solana_program::hash::hash;
use anchor_spl::{token, token_2022};

const PROPOSAL_V2_ACCOUNT_TYPE: u8 = 14;
const PROPOSAL_DATA_MIN_LEN: usize = 66;
const PROPOSAL_GOVERNANCE_START: usize = 1;
const PROPOSAL_GOVERNANCE_END: usize = 33;
const PROPOSAL_STATE_INDEX: usize = 65;

pub const PROPOSAL_STATE_EXECUTABLE: u8 = 4;
pub const PROPOSAL_STATE_EXECUTED: u8 = 5;

pub const REALMS_GOVERNANCE_PROGRAM_ID: Pubkey =
    pubkey!("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
pub const REALMS_GOVERNANCE_TEST_PROGRAM_ID: Pubkey =
    pubkey!("GTesTBiEWE32WHXXE2S4XbZvA5CrEc4xs6ZgRe895dP");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GovernanceProposalProof {
    pub governance: Pubkey,
    pub state: u8,
}

pub fn is_governance_program(program_id: &Pubkey) -> bool {
    *program_id == REALMS_GOVERNANCE_PROGRAM_ID || *program_id == REALMS_GOVERNANCE_TEST_PROGRAM_ID
}

pub fn is_passed_proposal_state(state: u8) -> bool {
    state == PROPOSAL_STATE_EXECUTABLE || state == PROPOSAL_STATE_EXECUTED
}

pub fn parse_governance_proposal_proof(
    proposal_owner: &Pubkey,
    proposal_data: &[u8],
) -> Result<GovernanceProposalProof> {
    require!(
        is_governance_program(proposal_owner),
        SafeTreasuryError::InvalidProposalProof
    );
    require!(
        proposal_data.len() >= PROPOSAL_DATA_MIN_LEN,
        SafeTreasuryError::InvalidProposalProof
    );
    require!(
        proposal_data[0] == PROPOSAL_V2_ACCOUNT_TYPE,
        SafeTreasuryError::InvalidProposalProof
    );

    let governance_bytes: [u8; 32] = proposal_data[PROPOSAL_GOVERNANCE_START..PROPOSAL_GOVERNANCE_END]
        .try_into()
        .map_err(|_| error!(SafeTreasuryError::InvalidProposalProof))?;

    Ok(GovernanceProposalProof {
        governance: Pubkey::new_from_array(governance_bytes),
        state: proposal_data[PROPOSAL_STATE_INDEX],
    })
}

pub fn read_governance_proposal_proof(
    proposal_info: &AccountInfo,
) -> Result<GovernanceProposalProof> {
    let data = proposal_info
        .try_borrow_data()
        .map_err(|_| error!(SafeTreasuryError::InvalidProposalProof))?;

    parse_governance_proposal_proof(proposal_info.owner, &data)
}

pub fn expected_token_program_for_asset_type(asset_type: u8) -> Result<Pubkey> {
    match asset_type {
        x if x == u8::from(AssetType::Spl2022) => Ok(token_2022::ID),
        x if x == u8::from(AssetType::Spl) || x == u8::from(AssetType::Nft) => Ok(token::ID),
        _ => err!(SafeTreasuryError::InvalidAssetConfig),
    }
}

pub fn validate_token_program_for_asset_type(asset_type: u8, token_program: Pubkey) -> Result<()> {
    let expected_program = expected_token_program_for_asset_type(asset_type)?;
    require!(
        token_program == expected_program,
        SafeTreasuryError::InvalidTokenProgram
    );
    Ok(())
}

pub fn duration_to_i64(duration: u64) -> Result<i64> {
    i64::try_from(duration).map_err(|_| error!(SafeTreasuryError::DurationOutOfRange))
}

pub fn add_duration(unix_timestamp: i64, duration: u64) -> Result<i64> {
    let delta = duration_to_i64(duration)?;
    unix_timestamp
        .checked_add(delta)
        .ok_or(error!(SafeTreasuryError::ArithmeticOverflow))
}

pub fn compute_payout_id(args: &QueuePayoutArgs, safe: Pubkey) -> u64 {
    let mut payload = Vec::with_capacity(1 + 8 + 32 + 32 + 32);
    payload.extend_from_slice(safe.as_ref());
    payload.push(args.asset_type);
    payload.extend_from_slice(args.recipient.as_ref());
    payload.extend_from_slice(&args.amount.to_le_bytes());

    if let Some(mint) = args.mint {
        payload.extend_from_slice(mint.as_ref());
    }

    if let Some(metadata_hash) = args.metadata_hash {
        payload.extend_from_slice(&metadata_hash);
    }

    let digest = hash(&payload).to_bytes();
    u64::from_le_bytes([
        digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7],
    ])
}

pub fn compute_queue_payload_hash(args: &QueuePayoutArgs, safe_policy: Pubkey) -> [u8; 32] {
    let mut payload = Vec::with_capacity(1 + 8 + 32 + 32 + 32);
    payload.extend_from_slice(safe_policy.as_ref());
    payload.push(args.asset_type);
    payload.extend_from_slice(args.recipient.as_ref());
    payload.extend_from_slice(&args.amount.to_le_bytes());

    if let Some(mint) = args.mint {
        payload.extend_from_slice(mint.as_ref());
    }

    if let Some(metadata_hash) = args.metadata_hash {
        payload.extend_from_slice(&metadata_hash);
    }

    hash(&payload).to_bytes()
}

pub fn compute_ruling_payload_hash(
    payout_id: u64,
    round: u8,
    outcome: u8,
    is_final: bool,
) -> [u8; 32] {
    let mut payload = Vec::with_capacity(8 + 1 + 1 + 1);
    payload.extend_from_slice(&payout_id.to_le_bytes());
    payload.push(round);
    payload.push(outcome);
    payload.push(if is_final { 1 } else { 0 });

    hash(&payload).to_bytes()
}
