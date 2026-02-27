import { PublicKey } from '@solana/web3.js'

export const DISPUTE_SAFE_PROGRAM_ID = new PublicKey(
  '9yMpZraAc4pFvg4DXTT3rhvUvdh2xGQUdiNLQ1bwEhCD',
)

export const DISPUTE_SAFE_IDL_METADATA = {
  name: 'safe_treasury',
  version: '0.1.0',
  spec: '0.1.0',
} as const

export const DISPUTE_SAFE_ACCOUNT_DISCRIMINATORS = {
  safePolicy: Uint8Array.from([24, 6, 116, 10, 196, 40, 74, 112]),
  payout: Uint8Array.from([69, 45, 245, 131, 218, 101, 158, 228]),
} as const

export type DisputeSafeAccountName = keyof typeof DISPUTE_SAFE_ACCOUNT_DISCRIMINATORS
