import { useConnection } from '@solana/wallet-adapter-react'
import { Connection, PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import queryClient from './queryClient'
import asFindable from '@utils/queries/asFindable'
import {
  DISPUTE_SAFE_ACCOUNT_DISCRIMINATORS,
  DISPUTE_SAFE_PROGRAM_ID,
} from 'idls/dispute_safe'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'

export const disputeSafeQueryKeys = {
  all: (endpoint: string) => [endpoint, 'DisputeSafe'],
  safeAccount: (endpoint: string, safePolicyAddress: PublicKey) => [
    ...disputeSafeQueryKeys.all(endpoint),
    'safeAccount',
    safePolicyAddress.toBase58(),
  ],
  payoutState: (endpoint: string, payoutAddress: PublicKey) => [
    ...disputeSafeQueryKeys.all(endpoint),
    'payoutState',
    payoutAddress.toBase58(),
  ],
  payoutQueue: (endpoint: string, safeAddress: PublicKey) => [
    ...disputeSafeQueryKeys.all(endpoint),
    'payoutQueue',
    safeAddress.toBase58(),
  ],
}

const PAYOUT_ACCOUNT_DISCRIMINATOR_BASE58 = bs58.encode(
  DISPUTE_SAFE_ACCOUNT_DISCRIMINATORS.payout,
)

const PAYOUT_SAFE_OFFSET = 24

type ProgramAccount = Awaited<
  ReturnType<Connection['getProgramAccounts']>
>[number]

async function getSafeAccount(
  connection: Connection,
  safePolicyAddress: PublicKey,
) {
  return asFindable(() => connection.getAccountInfo(safePolicyAddress))()
}

async function getPayoutState(connection: Connection, payoutAddress: PublicKey) {
  return asFindable(() => connection.getAccountInfo(payoutAddress))()
}

async function getPayoutQueue(connection: Connection, safeAddress: PublicKey) {
  const queue = await connection.getProgramAccounts(DISPUTE_SAFE_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 0, bytes: PAYOUT_ACCOUNT_DISCRIMINATOR_BASE58 } },
      { memcmp: { offset: PAYOUT_SAFE_OFFSET, bytes: safeAddress.toBase58() } },
    ],
  })

  return [...queue]
}

export function useDisputeSafeAccountQuery(safePolicyAddress: PublicKey | undefined) {
  const { connection } = useConnection()
  const enabled = safePolicyAddress !== undefined

  return useQuery({
    enabled,
    queryKey: enabled
      ? disputeSafeQueryKeys.safeAccount(connection.rpcEndpoint, safePolicyAddress)
      : undefined,
    queryFn: async () => {
      if (!enabled) throw new Error()
      return getSafeAccount(connection, safePolicyAddress)
    },
  })
}

export function useDisputeSafePayoutStateQuery(payoutAddress: PublicKey | undefined) {
  const { connection } = useConnection()
  const enabled = payoutAddress !== undefined

  return useQuery({
    enabled,
    queryKey: enabled
      ? disputeSafeQueryKeys.payoutState(connection.rpcEndpoint, payoutAddress)
      : undefined,
    queryFn: async () => {
      if (!enabled) throw new Error()
      return getPayoutState(connection, payoutAddress)
    },
  })
}

export function useDisputeSafePayoutQueueQuery(safeAddress: PublicKey | undefined) {
  const { connection } = useConnection()
  const enabled = safeAddress !== undefined

  return useQuery({
    enabled,
    queryKey: enabled
      ? disputeSafeQueryKeys.payoutQueue(connection.rpcEndpoint, safeAddress)
      : undefined,
    queryFn: async () => {
      if (!enabled) throw new Error()
      return getPayoutQueue(connection, safeAddress)
    },
  })
}

export const fetchDisputeSafeAccountQuery = (
  connection: Connection,
  safePolicyAddress: PublicKey,
) => {
  return queryClient.fetchQuery({
    queryKey: disputeSafeQueryKeys.safeAccount(
      connection.rpcEndpoint,
      safePolicyAddress,
    ),
    queryFn: () => getSafeAccount(connection, safePolicyAddress),
  })
}

export const fetchDisputeSafePayoutStateQuery = (
  connection: Connection,
  payoutAddress: PublicKey,
) => {
  return queryClient.fetchQuery({
    queryKey: disputeSafeQueryKeys.payoutState(connection.rpcEndpoint, payoutAddress),
    queryFn: () => getPayoutState(connection, payoutAddress),
  })
}

export const fetchDisputeSafePayoutQueueQuery = (
  connection: Connection,
  safeAddress: PublicKey,
) => {
  return queryClient.fetchQuery({
    queryKey: disputeSafeQueryKeys.payoutQueue(connection.rpcEndpoint, safeAddress),
    queryFn: () => getPayoutQueue(connection, safeAddress),
  })
}
