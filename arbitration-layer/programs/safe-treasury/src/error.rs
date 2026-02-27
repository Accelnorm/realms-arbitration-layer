use anchor_lang::prelude::*;

#[error_code]
pub enum SafeTreasuryError {
    #[msg("Unauthorized: only the authority can perform this action")]
    Unauthorized,
    #[msg("Policy floor violation: value must meet minimum requirement")]
    PolicyFloorViolation,
    #[msg("Invalid state transition")]
    InvalidStateTransition,
    #[msg("Payout is not releasable yet")]
    PayoutNotReleasable,
    #[msg("Dispute window has expired")]
    DisputeWindowExpired,
    #[msg("Insufficient token balance for challenge eligibility")]
    InsufficientTokenBalance,
    #[msg("Token mint mismatch")]
    MintMismatch,
    #[msg("Challenge bond amount must exactly match policy requirement")]
    IncorrectBondAmount,
    #[msg("Challenge bond vault already exists")]
    ChallengeBondVaultAlreadyExists,
    #[msg("Challenge bond vault not found")]
    ChallengeBondVaultNotFound,
    #[msg("Challenge not found")]
    ChallengeNotFound,
    #[msg("Payout is not in a challengeable state")]
    PayoutNotChallengeable,
    #[msg("Unauthorized resolver address")]
    UnauthorizedResolver,
    #[msg("Round mismatch")]
    RoundMismatch,
    #[msg("Dispute is already finalized")]
    AlreadyFinalized,
    #[msg("Maximum appeals reached")]
    MaxAppealsReached,
    #[msg("Appeal window has expired")]
    AppealWindowExpired,
    #[msg("Cannot finalize ruling yet")]
    CannotFinalizeYet,
    #[msg("Asset type mismatch")]
    AssetTypeMismatch,
    #[msg("Exit custody not allowed by policy")]
    ExitCustodyNotAllowed,
    #[msg("Ruling already recorded for this round")]
    RulingAlreadyRecorded,
    #[msg("Invalid proposal proof provided")]
    InvalidProposalProof,
    #[msg("Payload hash mismatch")]
    PayloadHashMismatch,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Arithmetic underflow")]
    ArithmeticUnderflow,
    #[msg("Invalid authorization mode")]
    InvalidAuthorizationMode,
    #[msg("Invalid asset configuration")]
    InvalidAssetConfig,
    #[msg("Recipient account does not match queued recipient")]
    RecipientMismatch,
    #[msg("Invalid treasury mode value")]
    InvalidTreasuryMode,
    #[msg("Missing required token accounts for this asset type")]
    MissingTokenAccounts,
    #[msg("Invalid ruling outcome")]
    InvalidRulingOutcome,
    #[msg("Invalid token program for this asset type")]
    InvalidTokenProgram,
    #[msg("Treasury mode is enabled - legacy operations not allowed")]
    TreasuryModeEnabled,
    #[msg("Payout cancellation is not allowed by policy")]
    PayoutCancellationNotAllowed,
    #[msg("Duration value exceeds supported range")]
    DurationOutOfRange,
    #[msg("Invalid native vault account")]
    InvalidVaultAccount,
    #[msg("NFT payout amount must be exactly 1")]
    InvalidNftAmount,
    #[msg("Proposal has not passed - arbitration outcome not finalized")]
    ProposalNotPassed,
}
