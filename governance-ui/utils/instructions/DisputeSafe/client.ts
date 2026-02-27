import BN from 'bn.js'
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import {
  SAFE_TREASURY_PROGRAM_ID,
  findChallengeBondVaultPda,
  findChallengePda,
  findNativeVaultPda,
  findPayoutPda,
  findSafePolicyPda,
  findSplVaultPda,
  findTreasuryInfoPda,
  findTreasuryRegistryPda,
} from './pdas'

const DISCRIMINATORS = {
  initializeSafePolicy: Uint8Array.from([224, 246, 214, 53, 134, 77, 214, 125]),
  registerTreasury: Uint8Array.from([92, 138, 83, 179, 120, 40, 252, 157]),
  queuePayout: Uint8Array.from([10, 91, 65, 13, 252, 117, 130, 76]),
  challengePayout: Uint8Array.from([128, 122, 229, 7, 139, 210, 241, 49]),
  recordRuling: Uint8Array.from([176, 44, 173, 34, 129, 227, 28, 153]),
  releaseNativePayout: Uint8Array.from([66, 117, 20, 254, 69, 51, 158, 87]),
  releaseSplPayout: Uint8Array.from([203, 147, 38, 39, 247, 105, 86, 226]),
  exitCustody: Uint8Array.from([234, 163, 1, 157, 45, 41, 60, 173]),
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  return Uint8Array.from(chunks.flatMap((chunk) => Array.from(chunk)))
}

function u64ToLeBytes(value: BN): Uint8Array {
  return Uint8Array.from(value.toArray('le', 8))
}

export type DisputeAssetType = 'Native' | 'Spl' | 'Spl2022' | 'Nft'

export interface InitializeSafeArgs {
  authority: PublicKey
  resolver: PublicKey
  disputeWindow: BN
  challengeBond: BN
  eligibilityMint: PublicKey
  minTokenBalance: BN
  maxAppealRounds: number
  appealWindowDuration: BN
  ipfsPolicyHash: Uint8Array
  treasuryModeEnabled: boolean
  payoutCancellationAllowed: boolean
}

export interface MigrateTreasuryArgs {
  authority: PublicKey
  safe: PublicKey
  mode: number
}

export interface QueuePayoutArgs {
  safe: PublicKey
  safePolicyAuthority: PublicKey
  payoutIndex: BN
  payer: PublicKey
  authority: PublicKey
  assetType: DisputeAssetType
  mint?: PublicKey
  recipient: PublicKey
  amount: BN
  metadataHash?: Uint8Array
  authorizationMode?: number
  payloadHash?: Uint8Array
  proposalOwner?: PublicKey
  proposalSignatory?: PublicKey
  proposal?: PublicKey
}

export interface ChallengePayoutArgs {
  safe: PublicKey
  payoutIndex: BN
  safePolicyAuthority: PublicKey
  challengerTokenAccount: PublicKey
  challenger: PublicKey
  bondAmount: BN
}

export interface RecordRulingArgs {
  safe: PublicKey
  payoutIndex: BN
  safePolicyAuthority: PublicKey
  challenger: PublicKey
  resolver: PublicKey
  round: number
  outcome: number
  isFinal: boolean
  authorizationMode: number
  payloadHash?: Uint8Array
  proposalOwner?: PublicKey
  proposalSignatory?: PublicKey
  proposalState?: number
  proposal?: PublicKey
}

export interface ReleasePayoutArgs {
  safe: PublicKey
  payoutIndex: BN
  recipient: PublicKey
  assetType: DisputeAssetType
  mint?: PublicKey
  safePolicyAuthority?: PublicKey
  recipientTokenAccount?: PublicKey
  tokenProgram?: PublicKey
}

export interface ExitCustodyArgs {
  safePolicyAuthority: PublicKey
  authority: PublicKey
  vault: PublicKey
  recipient: PublicKey
  assetType: DisputeAssetType
  vaultTokenAccount?: PublicKey
  recipientTokenAccount?: PublicKey
  mint?: PublicKey
  tokenProgram?: PublicKey
}

function serializeOptionBytes(value?: Uint8Array): Uint8Array {
  if (!value) {
    return Uint8Array.from([0])
  }
  return Uint8Array.from([1, ...Array.from(value)])
}

function serializeOptionPubkey(value?: PublicKey): Uint8Array {
  return serializeOptionBytes(value ? value.toBytes() : undefined)
}

function serializeOptionU8(value?: number): Uint8Array {
  return serializeOptionBytes(
    typeof value === 'number' ? Uint8Array.from([value]) : undefined,
  )
}

function serializeInitializeSafePolicyArgs(args: InitializeSafeArgs): Uint8Array {
  const hash32 = new Uint8Array(32)
  hash32.set(args.ipfsPolicyHash.slice(0, 32))

  return concatBytes(
    args.resolver.toBytes(),
    u64ToLeBytes(args.disputeWindow),
    u64ToLeBytes(args.challengeBond),
    args.eligibilityMint.toBytes(),
    u64ToLeBytes(args.minTokenBalance),
    Uint8Array.from([args.maxAppealRounds]),
    u64ToLeBytes(args.appealWindowDuration),
    hash32,
    Uint8Array.from([args.treasuryModeEnabled ? 1 : 0]),
    Uint8Array.from([args.payoutCancellationAllowed ? 1 : 0]),
  )
}

function serializeQueuePayoutArgs(args: QueuePayoutArgs): Uint8Array {
  // For native assets the on-chain handler requires mint === None.
  // Do NOT fall back to SystemProgram.programId — that would encode as Some(11111...)
  // and the program rejects it with InvalidAssetConfig.
  const mintOption = args.assetType === 'Native' ? undefined : args.mint
  const metadata = args.metadataHash

  const authMode = args.authorizationMode ?? 0

  return concatBytes(
    Uint8Array.from([
      args.assetType === 'Native'
        ? 0
        : args.assetType === 'Spl'
        ? 1
        : args.assetType === 'Spl2022'
        ? 2
        : 3,
    ]),
    serializeOptionPubkey(mintOption),
    args.recipient.toBytes(),
    u64ToLeBytes(args.amount),
    serializeOptionBytes(metadata),
    Uint8Array.from([authMode]),
    serializeOptionBytes(args.payloadHash),
    serializeOptionPubkey(args.proposalOwner),
    serializeOptionPubkey(args.proposalSignatory),
  )
}

function serializeRecordRulingArgs(args: RecordRulingArgs): Uint8Array {
  return Uint8Array.from([
    ...Uint8Array.from([args.round]),
    ...Uint8Array.from([args.outcome]),
    ...Uint8Array.from([args.isFinal ? 1 : 0]),
    ...Uint8Array.from([args.authorizationMode]),
    ...serializeOptionBytes(args.payloadHash),
    ...serializeOptionPubkey(args.proposalOwner),
    ...serializeOptionPubkey(args.proposalSignatory),
    ...serializeOptionU8(args.proposalState),
  ])
}

function serializeExitCustodyArgs(args: ExitCustodyArgs): Uint8Array {
  const assetTypeValue =
    args.assetType === 'Native'
      ? 0
      : args.assetType === 'Spl'
      ? 1
      : args.assetType === 'Spl2022'
      ? 2
      : 3
  return Uint8Array.from([assetTypeValue, ...args.recipient.toBytes()])
}

export class DisputeSafeClient {
  static initializeSafe(args: InitializeSafeArgs): TransactionInstruction {
    const [safePolicy] = findSafePolicyPda(args.authority)

    return new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: safePolicy, isSigner: false, isWritable: true },
        { pubkey: args.authority, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        concatBytes(
        DISCRIMINATORS.initializeSafePolicy,
        serializeInitializeSafePolicyArgs(args),
        ),
      ),
    })
  }

  static migrateTreasury(args: MigrateTreasuryArgs): TransactionInstruction {
    const [treasuryInfo] = findTreasuryInfoPda(args.safe)
    const [registry] = findTreasuryRegistryPda()
    const [safePolicy] = findSafePolicyPda(args.authority)

    return new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: treasuryInfo, isSigner: false, isWritable: true },
        { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: args.safe, isSigner: false, isWritable: false },
        { pubkey: safePolicy, isSigner: false, isWritable: false },
        { pubkey: args.authority, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        concatBytes(
        DISCRIMINATORS.registerTreasury,
        Uint8Array.from([args.mode]),
        ),
      ),
    })
  }

  static queuePayout(args: QueuePayoutArgs): TransactionInstruction {
    const [safePolicy] = findSafePolicyPda(args.safePolicyAuthority)
    const [payout] = findPayoutPda(args.safe, args.payoutIndex)

    return new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: args.safe, isSigner: false, isWritable: true },
        { pubkey: safePolicy, isSigner: false, isWritable: true },
        { pubkey: args.payer, isSigner: true, isWritable: true },
        { pubkey: args.authority, isSigner: false, isWritable: false },
        {
          pubkey: args.proposal ?? SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        concatBytes(
        DISCRIMINATORS.queuePayout,
        serializeQueuePayoutArgs(args),
        ),
      ),
    })
  }

  static challengePayout(args: ChallengePayoutArgs): TransactionInstruction {
    const [payout] = findPayoutPda(args.safe, args.payoutIndex)
    const [challenge] = findChallengePda(payout)
    const [safePolicy] = findSafePolicyPda(args.safePolicyAuthority)
    const [bondVault] = findChallengeBondVaultPda()

    return new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: challenge, isSigner: false, isWritable: true },
        { pubkey: safePolicy, isSigner: false, isWritable: true },
        { pubkey: args.safe, isSigner: false, isWritable: true },
        { pubkey: bondVault, isSigner: false, isWritable: true },
        { pubkey: args.challengerTokenAccount, isSigner: false, isWritable: false },
        { pubkey: args.challenger, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        concatBytes(
        DISCRIMINATORS.challengePayout,
        u64ToLeBytes(args.bondAmount),
        ),
      ),
    })
  }

  static recordRuling(args: RecordRulingArgs): TransactionInstruction {
    const [payout] = findPayoutPda(args.safe, args.payoutIndex)
    const [challenge] = findChallengePda(payout)
    const [safePolicy] = findSafePolicyPda(args.safePolicyAuthority)
    const [bondVault] = findChallengeBondVaultPda()

    return new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: challenge, isSigner: false, isWritable: true },
        { pubkey: safePolicy, isSigner: false, isWritable: false },
        { pubkey: bondVault, isSigner: false, isWritable: true },
        { pubkey: args.challenger, isSigner: false, isWritable: true },
        { pubkey: args.safe, isSigner: false, isWritable: true },
        { pubkey: args.resolver, isSigner: false, isWritable: false },
        {
          pubkey: args.proposal ?? SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(
        concatBytes(
        DISCRIMINATORS.recordRuling,
        serializeRecordRulingArgs(args),
        ),
      ),
    })
  }

  static releasePayout(args: ReleasePayoutArgs): TransactionInstruction {
    const [payout] = findPayoutPda(args.safe, args.payoutIndex)

    if (args.assetType === 'Native') {
      const [vault] = findNativeVaultPda(args.safe)
      return new TransactionInstruction({
        programId: SAFE_TREASURY_PROGRAM_ID,
        keys: [
          { pubkey: payout, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: args.safe, isSigner: false, isWritable: true },
          { pubkey: args.recipient, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(DISCRIMINATORS.releaseNativePayout),
      })
    }

    if (!args.safePolicyAuthority || !args.mint || !args.recipientTokenAccount) {
      throw new Error('SPL release requires safePolicyAuthority, mint and recipientTokenAccount')
    }

    const [safePolicy] = findSafePolicyPda(args.safePolicyAuthority)
    const [vaultTokenAccount] = findSplVaultPda(safePolicy, args.mint)

    return new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys: [
        { pubkey: payout, isSigner: false, isWritable: true },
        { pubkey: args.mint, isSigner: false, isWritable: false },
        { pubkey: vaultTokenAccount, isSigner: false, isWritable: true },
        { pubkey: safePolicy, isSigner: false, isWritable: false },
        { pubkey: args.safe, isSigner: false, isWritable: true },
        { pubkey: args.recipientTokenAccount, isSigner: false, isWritable: true },
        {
          pubkey: args.tokenProgram ?? SystemProgram.programId,
          isSigner: false,
          isWritable: false,
        },
      ],
      data: Buffer.from(DISCRIMINATORS.releaseSplPayout),
    })
  }

  static exitCustody(args: ExitCustodyArgs): TransactionInstruction {
    const [safePolicy] = findSafePolicyPda(args.safePolicyAuthority)

    const keys = [
      { pubkey: safePolicy, isSigner: false, isWritable: false },
      { pubkey: args.vault, isSigner: false, isWritable: true },
      {
        pubkey: args.vaultTokenAccount ?? SystemProgram.programId,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: args.recipient, isSigner: false, isWritable: true },
      {
        pubkey: args.recipientTokenAccount ?? SystemProgram.programId,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: args.mint ?? SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: args.authority, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: args.tokenProgram ?? SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
    ]

    return new TransactionInstruction({
      programId: SAFE_TREASURY_PROGRAM_ID,
      keys,
      data: Buffer.from(
        concatBytes(
        DISCRIMINATORS.exitCustody,
        serializeExitCustodyArgs(args),
        ),
      ),
    })
  }
}
