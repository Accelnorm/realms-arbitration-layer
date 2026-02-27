import { PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

/**
 * Placeholder program ID matching the "address" field in
 * arbitration-layer/target/idl/safe_treasury.json.
 * Will be replaced once the program has a stable deployed address.
 */
export const SAFE_TREASURY_PROGRAM_ID = new PublicKey(
  '9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD',
)

/**
 * Byte offset of `payout_count` (u64 LE) inside a SafePolicy account's data
 * (including the 8-byte Anchor discriminator prefix).
 *
 * Layout (discriminator + Borsh fields, from seed-ui-fixtures.sh):
 *   [0..8]   discriminator
 *   [8..40]  authority (pubkey)
 *   [40..72] resolver (pubkey)
 *   [72..80] dispute_window (u64)
 *   [80..88] challenge_bond (u64)
 *   [88..120] eligibility_mint (pubkey)
 *   [120..128] min_token_balance (u64)
 *   [128]    max_appeal_rounds (u8)
 *   [129..137] appeal_window_duration (u64)
 *   [137]    appeal_bond_multiplier (u8)
 *   [138..170] ipfs_policy_hash ([u8;32])
 *   [170]    exit_custody_allowed (bool)
 *   [171]    payout_cancellation_allowed (bool)
 *   [172]    treasury_mode_enabled (bool)
 *   [173..181] payout_count (u64)  ← this constant
 *   [181]    bump (u8)
 */
export const SAFE_POLICY_PAYOUT_COUNT_OFFSET = 173

/**
 * Derive the SafePolicy PDA for a given authority (safe/DAO governance pubkey).
 * Seeds: [b"safe_policy", authority]
 */
export function findSafePolicyPda(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('safe_policy'), authority.toBuffer()],
    SAFE_TREASURY_PROGRAM_ID,
  )
}

/**
 * Derive the Challenge PDA.
 * Seeds: [b"challenge", payout]
 */
export function findChallengePda(payout: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenge'), payout.toBuffer()],
    SAFE_TREASURY_PROGRAM_ID,
  )
}

/**
 * Derive the native vault PDA.
 * Seeds: [b"native_vault", safe]
 */
export function findNativeVaultPda(safe: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('native_vault'), safe.toBuffer()],
    SAFE_TREASURY_PROGRAM_ID,
  )
}

/**
 * Derive the SPL vault token account PDA.
 * Seeds: [b"spl_vault", safe_policy, mint]
 */
export function findSplVaultPda(
  safePolicy: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('spl_vault'), safePolicy.toBuffer(), mint.toBuffer()],
    SAFE_TREASURY_PROGRAM_ID,
  )
}

/**
 * Derive the challenge bond vault PDA.
 * Seeds: [b"challenge_bond_vault"]
 */
export function findChallengeBondVaultPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('challenge_bond_vault')],
    SAFE_TREASURY_PROGRAM_ID,
  )
}

/**
 * Derive the treasury registry PDA.
 * Seeds: [b"treasury_registry"]
 */
export function findTreasuryRegistryPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury_registry')],
    SAFE_TREASURY_PROGRAM_ID,
  )
}

/**
 * Derive the treasury info PDA.
 * Seeds: [b"treasury_info", safe]
 */
export function findTreasuryInfoPda(safe: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('treasury_info'), safe.toBuffer()],
    SAFE_TREASURY_PROGRAM_ID,
  )
}

/**
 * Derive the Payout PDA.
 * Seeds: [b"payout", safe (= authority pubkey), payout_index as u64 LE]
 *
 * @param safe         - The safe/authority public key (same as used in findSafePolicyPda)
 * @param payoutIndex  - The sequential payout index (read from SafePolicy.payout_count)
 */
export function findPayoutPda(
  safe: PublicKey,
  payoutIndex: BN,
): [PublicKey, number] {
  const indexBytes = payoutIndex.toArrayLike(Buffer, 'le', 8)
  return PublicKey.findProgramAddressSync(
    [Buffer.from('payout'), safe.toBuffer(), indexBytes],
    SAFE_TREASURY_PROGRAM_ID,
  )
}
