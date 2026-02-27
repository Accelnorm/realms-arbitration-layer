import { useCallback, useEffect, useRef, useState } from 'react'
import { pipe } from 'fp-ts/function'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import BN from 'bn.js'
import PreviousRouteBtn from '@components/PreviousRouteBtn'
import TotalValueTitle from '@components/treasuryV2/TotalValueTitle'
import WalletList from '@components/treasuryV2/WalletList'
import Details from '@components/treasuryV2/Details'
import { map, Status } from '@utils/uiTypes/Result'
import useTreasuryInfo from '@hooks/useTreasuryInfo'
import { AuxiliaryWallet, Wallet } from '@models/treasury/Wallet'
import { Asset } from '@models/treasury/Asset'
import { useTreasurySelectState } from '@components/treasuryV2/Details/treasurySelectStore'
import useGovernanceAssetsStore from 'stores/useGovernanceAssetsStore'
import { AccountType } from '@utils/uiTypes/assets'
import { SecondaryButton } from '@components/Button'
import { Instructions } from '@utils/uiTypes/proposalCreationTypes'
import useRealm from '@hooks/useRealm'
import useQueryContext from '@hooks/useQueryContext'
import { useRouter } from 'next/router'
import {
  disputeSafeQueryKeys,
  fetchDisputeSafePayoutQueueQuery,
} from '@hooks/queries/disputeSafe'
import queryClient from '@hooks/queries/queryClient'
import { notify } from '@utils/notifications'
import { sendTransaction } from '@utils/send'
import useWalletOnePointOh from '@hooks/useWalletOnePointOh'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token-new'
import {
  DisputeAssetType,
  DisputeSafeClient,
} from '@utils/instructions/DisputeSafe/client'

type DisputeSafePayoutRow = {
  payoutAccount: string
  safePolicy: string
  payoutId: bigint
  payoutIndex: bigint
  safe: string
  recipient: string
  amount: bigint
  assetType: number
  mint?: string
  status: number
  disputeDeadline: number
  policyAuthority: string
  challengeBond: bigint
  eligibilityMint: string
  minTokenBalance: bigint
}

const getTokenAccountMint = (accountData: Buffer): PublicKey => {
  return new PublicKey(accountData.slice(0, 32))
}

const getTokenAccountAmount = (accountData: Buffer): bigint => {
  const view = new DataView(
    accountData.buffer,
    accountData.byteOffset,
    accountData.byteLength,
  )
  return view.getBigUint64(64, true)
}

const isLikelyStalePayoutStateError = (message: string) => {
  const normalized = message.toLowerCase()

  return (
    normalized.includes('invalidstatetransition') ||
    normalized.includes('payoutnotchallengeable') ||
    normalized.includes('recipientmismatch') ||
    normalized.includes('alreadyfinalized')
  )
}

const readU64 = (buffer: Buffer, offset: number): [bigint, number] => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return [view.getBigUint64(offset, true), offset + 8]
}

const readI64 = (buffer: Buffer, offset: number): [number, number] => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  return [Number(view.getBigInt64(offset, true)), offset + 8]
}

const readPubkey = (buffer: Buffer, offset: number): [PublicKey, number] => {
  return [new PublicKey(buffer.slice(offset, offset + 32)), offset + 32]
}

const readOptionPubkey = (
  buffer: Buffer,
  offset: number,
): [PublicKey | undefined, number] => {
  const tag = buffer[offset]
  const nextOffset = offset + 1
  if (tag === 0) {
    return [undefined, nextOffset]
  }
  return [new PublicKey(buffer.slice(nextOffset, nextOffset + 32)), nextOffset + 32]
}

const readOptionBytes32 = (
  buffer: Buffer,
  offset: number,
): [Uint8Array | undefined, number] => {
  const tag = buffer[offset]
  const nextOffset = offset + 1
  if (tag === 0) {
    return [undefined, nextOffset]
  }
  return [Uint8Array.from(buffer.slice(nextOffset, nextOffset + 32)), nextOffset + 32]
}

const toAssetTypeLabel = (assetType: number) => {
  switch (assetType) {
    case 0:
      return 'Native'
    case 1:
      return 'SPL'
    case 2:
      return 'SPL2022'
    case 3:
      return 'NFT'
    default:
      return `Unknown (${assetType})`
  }
}

const toAssetTypeValue = (assetType: number): DisputeAssetType => {
  switch (assetType) {
    case 0:
      return 'Native'
    case 1:
      return 'Spl'
    case 2:
      return 'Spl2022'
    case 3:
      return 'Nft'
    default:
      return 'Native'
  }
}

const toPayoutStatusLabel = (status: number) => {
  switch (status) {
    case 0:
      return 'Queued'
    case 1:
      return 'Challenged'
    case 2:
      return 'Released'
    case 3:
      return 'Cancelled'
    case 4:
      return 'Denied'
    default:
      return `Unknown (${status})`
  }
}

const payoutStatusBadgeClass = (status: number) => {
  switch (status) {
    case 0:
      return 'bg-blue/20 text-blue'
    case 1:
      return 'bg-orange/20 text-orange'
    case 2:
      return 'bg-green/20 text-green'
    case 3:
    case 4:
      return 'bg-red/20 text-red-1'
    default:
      return 'bg-bkg-3 text-fgd-1'
  }
}

const payoutStatusBadgeClassWithReleaseReady = (
  status: number,
  isReleaseReady: boolean,
) => {
  if (isReleaseReady) {
    return 'bg-green/20 text-green'
  }

  return payoutStatusBadgeClass(status)
}

const getDisplayPayoutStatusLabel = (status: number, disputeDeadline: number) => {
  const isReleaseReady =
    status === 0 && disputeDeadline <= Math.floor(Date.now() / 1000)

  return isReleaseReady ? 'ReleaseReady' : toPayoutStatusLabel(status)
}

const formatCountdown = (seconds: number) => {
  if (seconds <= 0) {
    return 'Ready'
  }

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${Math.max(minutes, 1)}m`
}

const toTimeRemainingLabel = (status: number, disputeDeadline: number) => {
  if (status === 0) {
    const remainingSeconds = disputeDeadline - Math.floor(Date.now() / 1000)
    return formatCountdown(remainingSeconds)
  }

  if (status === 1) {
    return 'Under challenge'
  }

  return '—'
}

const parseDisputeSafePayoutAccount = (
  payoutAccount: PublicKey,
  safePolicy: string,
  data: Buffer,
): DisputeSafePayoutRow | null => {
  try {
    let offset = 8 // account discriminator

    const [payoutId, payoutIdOffset] = readU64(data, offset)
    offset = payoutIdOffset

    const [payoutIndex, payoutIndexOffset] = readU64(data, offset)
    offset = payoutIndexOffset

    const [safe, safeOffset] = readPubkey(data, offset)
    offset = safeOffset

    const assetType = data[offset]
    offset += 1

    const [mint, mintOffset] = readOptionPubkey(data, offset)
    offset = mintOffset

    const [recipient, recipientOffset] = readPubkey(data, offset)
    offset = recipientOffset

    const [amount, amountOffset] = readU64(data, offset)
    offset = amountOffset

    const [, metadataOffset] = readOptionBytes32(data, offset)
    offset = metadataOffset

    const status = data[offset]
    offset += 1

    const [disputeDeadline, disputeDeadlineOffset] = readI64(data, offset)
    offset = disputeDeadlineOffset

    const [policyAuthority, policyAuthorityOffset] = readPubkey(data, offset)
    offset = policyAuthorityOffset

    const [, resolverOffset] = readPubkey(data, offset)
    offset = resolverOffset

    const [, disputeWindowOffset] = readU64(data, offset)
    offset = disputeWindowOffset

    const [challengeBond, challengeBondOffset] = readU64(data, offset)
    offset = challengeBondOffset

    const [eligibilityMint, eligibilityMintOffset] = readPubkey(data, offset)
    offset = eligibilityMintOffset

    const [minTokenBalance, minTokenBalanceOffset] = readU64(data, offset)
    offset = minTokenBalanceOffset

    // Skip remaining policy snapshot fields we do not currently surface.
    offset += 1 + 8 + 1 + 32 + 3 + 8 + 1

    return {
      payoutAccount: payoutAccount.toBase58(),
      safePolicy,
      payoutId,
      payoutIndex,
      safe: safe.toBase58(),
      recipient: recipient.toBase58(),
      amount,
      assetType,
      mint: mint?.toBase58(),
      status,
      disputeDeadline,
      policyAuthority: policyAuthority.toBase58(),
      challengeBond,
      eligibilityMint: eligibilityMint.toBase58(),
      minTokenBalance,
    }
  } catch {
    return null
  }
}

const shortenAddress = (address: string) =>
  `${address.slice(0, 4)}...${address.slice(address.length - 4)}`

export default function Treasury() {
  const data = useTreasuryInfo()
  const { connection } = useConnection()
  const wallet = useWalletOnePointOh()
  const assetAccounts = useGovernanceAssetsStore((s) => s.assetAccounts)
  const { symbol } = useRealm()
  const router = useRouter()
  const { fmtUrlWithCluster } = useQueryContext()
  const [isStickied, setIsStickied] = useState(false)
  const [isLoadingPayoutQueue, setIsLoadingPayoutQueue] = useState(false)
  const [payoutRows, setPayoutRows] = useState<DisputeSafePayoutRow[]>([])
  const [activePayoutAction, setActivePayoutAction] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<
    AuxiliaryWallet | Wallet | null
  >(null)
  const stickyTracker = useRef<HTMLDivElement>(null)
  const observer = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (data._tag === Status.Ok && !selectedWallet) {
      setSelectedWallet(data.data.wallets[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO please fix, it can cause difficult bugs. You might wanna check out https://bobbyhadz.com/blog/react-hooks-exhaustive-deps for info. -@asktree
  }, [data._tag])

  useEffect(() => {
    if (stickyTracker.current) {
      observer.current = new IntersectionObserver(
        (entries) => {
          const item = entries[0]
          setIsStickied(item.intersectionRatio < 1)
        },
        { threshold: [1] },
      )

      observer.current.observe(stickyTracker.current)
    }

    return () => observer.current?.disconnect()
  }, [stickyTracker, observer, setIsStickied])

  const [treasurySelect, setTreasurySelect] = useTreasurySelectState()

  // @asktree: We are migrating away from prop-drilling data as state towards, a hook that manages state (and no data)
  // But for now views can use either

  // If the new system is used, then the legacy prop-drilled data and state should just be a special value.
  const legacySelectedWallet =
    treasurySelect?._kind === 'Legacy'
      ? selectedWallet
      : ('USE NON-LEGACY STATE' as const)
  const legacySelectedAsset =
    treasurySelect?._kind === 'Legacy'
      ? selectedAsset
      : ('USE NON-LEGACY STATE' as const)

  const disputeSafeAccounts = assetAccounts.filter(
    (account) => account.type === AccountType.DISPUTE_SAFE,
  )
  const totalQueuedPayouts = disputeSafeAccounts.reduce(
    (acc, account) =>
      acc + BigInt(account.extensions.disputeSafe?.payoutCount.toString() ?? '0'),
    BigInt(0),
  )

  const goToDisputeSafeProposal = (instruction: Instructions) => {
    if (typeof symbol !== 'string') {
      return
    }

    const url = fmtUrlWithCluster(`/dao/${symbol}/proposal/new?i=${instruction}`)
    router.push(url)
  }

  const loadPayoutQueue = useCallback(async () => {
    if (!disputeSafeAccounts.length) {
      setPayoutRows([])
      return
    }

    setIsLoadingPayoutQueue(true)

    try {
      const queueResults = await Promise.all(
        disputeSafeAccounts.map((safeAccount) =>
          fetchDisputeSafePayoutQueueQuery(
            connection,
            safeAccount.governance.nativeTreasuryAddress,
          ),
        ),
      )

      const rows = queueResults.flatMap((queue, index) => {
        const safePolicy = disputeSafeAccounts[index].pubkey.toBase58()

        return queue.flatMap((account) => {
          const parsed = parseDisputeSafePayoutAccount(
            account.pubkey,
            safePolicy,
            account.account.data,
          )
          return parsed ? [parsed] : []
        })
      })

      const uniqueRows = Array.from(
        new Map(rows.map((row) => [row.payoutAccount, row])).values(),
      ).sort((a, b) => (a.payoutId > b.payoutId ? -1 : 1))

      setPayoutRows(uniqueRows)
    } finally {
      setIsLoadingPayoutQueue(false)
    }
  }, [connection, disputeSafeAccounts])

  const refetchPayoutQueries = useCallback(
    async (row?: DisputeSafePayoutRow) => {
      await Promise.all(
        disputeSafeAccounts.map((safeAccount) =>
          queryClient.invalidateQueries({
            queryKey: disputeSafeQueryKeys.payoutQueue(
              connection.rpcEndpoint,
              safeAccount.governance.nativeTreasuryAddress,
            ),
          }),
        ),
      )

      if (row) {
        await queryClient.invalidateQueries({
          queryKey: disputeSafeQueryKeys.payoutState(
            connection.rpcEndpoint,
            new PublicKey(row.payoutAccount),
          ),
        })
      }

      await loadPayoutQueue()
    },
    [connection.rpcEndpoint, disputeSafeAccounts, loadPayoutQueue],
  )

  const findEligibilityTokenAccount = useCallback(
    async (row: DisputeSafePayoutRow, walletPk: PublicKey) => {
      const eligibilityMint = new PublicKey(row.eligibilityMint)

      const [tokenAccounts, token2022Accounts] = await Promise.all([
        connection.getTokenAccountsByOwner(walletPk, {
          programId: TOKEN_PROGRAM_ID,
        }),
        connection.getTokenAccountsByOwner(walletPk, {
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ])

      const candidate = [...tokenAccounts.value, ...token2022Accounts.value].find(
        ({ account }) => {
          const mint = getTokenAccountMint(account.data)
          const balance = getTokenAccountAmount(account.data)

          return mint.equals(eligibilityMint) && balance >= row.minTokenBalance
        },
      )

      return candidate?.pubkey
    },
    [connection],
  )

  const handleChallengePayout = useCallback(
    async (row: DisputeSafePayoutRow) => {
      if (!wallet?.publicKey) {
        notify({
          type: 'error',
          message: 'Connect a wallet to challenge payouts.',
        })
        return
      }

      const actionKey = `challenge:${row.payoutAccount}`
      setActivePayoutAction(actionKey)

      try {
        const challengerTokenAccount = await findEligibilityTokenAccount(
          row,
          wallet.publicKey,
        )

        if (!challengerTokenAccount) {
          notify({
            type: 'error',
            message:
              'Wallet is not eligible to challenge this payout (required token balance not met).',
          })
          return
        }

        const instruction = DisputeSafeClient.challengePayout({
          safe: new PublicKey(row.safe),
          payoutIndex: new BN(row.payoutIndex.toString()),
          safePolicyAuthority: new PublicKey(row.policyAuthority),
          challengerTokenAccount,
          challenger: wallet.publicKey,
          bondAmount: new BN(row.challengeBond.toString()),
        })

        const transaction = new Transaction({ feePayer: wallet.publicKey }).add(
          instruction,
        )

        await sendTransaction({
          transaction,
          wallet,
          connection,
          sendingMessage: 'Submitting payout challenge...',
          successMessage: 'Payout challenge submitted',
        })

        await refetchPayoutQueries(row)
      } catch (e) {
        const message = e instanceof Error ? e.message : `${e}`

        if (isLikelyStalePayoutStateError(message)) {
          notify({
            type: 'error',
            message:
              'Payout state changed before challenge execution. Refreshing queue...',
          })
          await refetchPayoutQueries(row)
          return
        }

        notify({ type: 'error', message })
      } finally {
        setActivePayoutAction((current) =>
          current === actionKey ? null : current,
        )
      }
    },
    [connection, findEligibilityTokenAccount, refetchPayoutQueries, wallet],
  )

  const handleReleasePayout = useCallback(
    async (row: DisputeSafePayoutRow) => {
      if (!wallet?.publicKey) {
        notify({
          type: 'error',
          message: 'Connect a wallet to release payouts.',
        })
        return
      }

      const actionKey = `release:${row.payoutAccount}`
      setActivePayoutAction(actionKey)

      try {
        const assetType = toAssetTypeValue(row.assetType)
        const safe = new PublicKey(row.safe)
        const payoutIndex = new BN(row.payoutIndex.toString())
        const recipient = new PublicKey(row.recipient)

        const instruction =
          assetType === 'Native'
            ? DisputeSafeClient.releasePayout({
                safe,
                payoutIndex,
                recipient,
                assetType,
              })
            : (() => {
                if (!row.mint) {
                  throw new Error('Missing mint for SPL payout release')
                }

                const mint = new PublicKey(row.mint)
                const tokenProgram =
                  assetType === 'Spl2022' ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
                const recipientTokenAccount = getAssociatedTokenAddressSync(
                  mint,
                  recipient,
                  false,
                  tokenProgram,
                )

                return DisputeSafeClient.releasePayout({
                  safe,
                  payoutIndex,
                  recipient,
                  assetType,
                  mint,
                  safePolicyAuthority: new PublicKey(row.policyAuthority),
                  recipientTokenAccount,
                  tokenProgram,
                })
              })()

        const transaction = new Transaction({ feePayer: wallet.publicKey }).add(
          instruction,
        )

        await sendTransaction({
          transaction,
          wallet,
          connection,
          sendingMessage: 'Submitting payout release...',
          successMessage: 'Payout released',
        })

        await refetchPayoutQueries(row)
      } catch (e) {
        const message = e instanceof Error ? e.message : `${e}`

        if (isLikelyStalePayoutStateError(message)) {
          notify({
            type: 'error',
            message:
              'Payout state changed before release execution. Refreshing queue...',
          })
          await refetchPayoutQueries(row)
          return
        }

        notify({ type: 'error', message })
      } finally {
        setActivePayoutAction((current) =>
          current === actionKey ? null : current,
        )
      }
    },
    [connection, refetchPayoutQueries, wallet],
  )

  useEffect(() => {
    loadPayoutQueue()
  }, [loadPayoutQueue])

  return (
    <div className="rounded-lg bg-bkg-2 p-6 min-h-full flex flex-col">
      <header className="space-y-6 border-b border-white/10 pb-4">
        <PreviousRouteBtn />
        <TotalValueTitle
          data={pipe(
            data,
            map((data) => ({
              realm: {
                icon: data.icon,
                name: data.name,
              },
              value: data.totalValue,
            })),
          )}
        />
      </header>
      <section className="mt-6 rounded-lg border border-white/10 bg-bkg-1/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-fgd-1">
              Dispute Safe Custody
            </h2>
            <p className="mt-1 text-xs text-fgd-3">
              Safe custody balances are tracked separately from treasury wallet balances.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton
              small
              onClick={() =>
                goToDisputeSafeProposal(Instructions.DisputeSafeQueuePayout)
              }
            >
              Queue Payout
            </SecondaryButton>
            <SecondaryButton
              small
              onClick={() =>
                goToDisputeSafeProposal(Instructions.DisputeSafeExitFromCustody)
              }
            >
              Exit Custody
            </SecondaryButton>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <div className="rounded bg-bkg-1 p-3 text-xs">
            <div className="text-fgd-3">Safe Policies</div>
            <div className="mt-1 text-lg font-semibold">{disputeSafeAccounts.length}</div>
          </div>
          <div className="rounded bg-bkg-1 p-3 text-xs">
            <div className="text-fgd-3">Queued/Tracked Payout Slots</div>
            <div className="mt-1 text-lg font-semibold">
              {totalQueuedPayouts.toString()}
            </div>
          </div>
        </div>

        {disputeSafeAccounts.length > 0 ? (
          <div className="mt-4 space-y-2">
            {disputeSafeAccounts.map((safe) => (
              <div
                key={safe.pubkey.toBase58()}
                className="rounded border border-white/10 bg-bkg-1 p-3 text-xs"
              >
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <div className="text-fgd-3">Safe Policy</div>
                    <div className="font-mono text-fgd-1 break-all">
                      {safe.pubkey.toBase58()}
                    </div>
                  </div>
                  <div>
                    <div className="text-fgd-3">Authority</div>
                    <div className="font-mono text-fgd-1 break-all">
                      {safe.extensions.disputeSafe?.authority.toBase58() ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-fgd-3">Resolver</div>
                    <div className="font-mono text-fgd-1 break-all">
                      {safe.extensions.disputeSafe?.resolver.toBase58() ?? '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded bg-bkg-1 p-3 text-xs text-fgd-3">
            No Dispute Safe custody accounts discovered for this DAO yet.
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fgd-2">
            Payout Queue
          </h3>
          {isLoadingPayoutQueue ? (
            <div className="mt-2 rounded bg-bkg-1 p-3 text-xs text-fgd-3">
              Loading payout queue...
            </div>
          ) : payoutRows.length === 0 ? (
            <div className="mt-2 rounded bg-bkg-1 p-3 text-xs text-fgd-3">
              No queued payouts found.
            </div>
          ) : (
            <div className="mt-2 overflow-x-auto rounded border border-white/10 bg-bkg-1">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-fgd-3">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Payout ID</th>
                    <th className="px-3 py-2 font-semibold">Recipient</th>
                    <th className="px-3 py-2 font-semibold">Amount</th>
                    <th className="px-3 py-2 font-semibold">Asset</th>
                    <th className="px-3 py-2 font-semibold">State</th>
                    <th className="px-3 py-2 font-semibold">Time Remaining</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRows.map((row) => {
                    const isReleaseReady =
                      row.status === 0 &&
                      row.disputeDeadline <= Math.floor(Date.now() / 1000)
                    const canChallenge = row.status === 0 && !isReleaseReady
                    const canRelease = isReleaseReady
                    const isActionInFlight =
                      activePayoutAction === `challenge:${row.payoutAccount}` ||
                      activePayoutAction === `release:${row.payoutAccount}`

                    return (
                      <tr key={row.payoutAccount} className="border-b border-white/5">
                        <td className="px-3 py-2 font-mono text-fgd-1">
                          {row.payoutId.toString()}
                        </td>
                        <td
                          className="px-3 py-2 font-mono text-fgd-1"
                          title={row.recipient}
                        >
                          {shortenAddress(row.recipient)}
                        </td>
                        <td className="px-3 py-2 font-mono text-fgd-1">
                          {row.amount.toString()}
                        </td>
                        <td className="px-3 py-2 text-fgd-1">
                          {toAssetTypeLabel(row.assetType)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${payoutStatusBadgeClassWithReleaseReady(
                              row.status,
                              isReleaseReady,
                            )}`}
                          >
                            {getDisplayPayoutStatusLabel(
                              row.status,
                              row.disputeDeadline,
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-fgd-1">
                          {toTimeRemainingLabel(row.status, row.disputeDeadline)}
                        </td>
                        <td className="px-3 py-2">
                          {canChallenge ? (
                            <SecondaryButton
                              small
                              disabled={isActionInFlight}
                              onClick={() => handleChallengePayout(row)}
                            >
                              {isActionInFlight ? 'Challenging...' : 'Challenge'}
                            </SecondaryButton>
                          ) : canRelease ? (
                            <SecondaryButton
                              small
                              disabled={isActionInFlight}
                              onClick={() => handleReleasePayout(row)}
                            >
                              {isActionInFlight ? 'Releasing...' : 'Release'}
                            </SecondaryButton>
                          ) : row.status === 1 ? (
                            <SecondaryButton
                              small
                              onClick={() =>
                                goToDisputeSafeProposal(
                                  Instructions.DisputeSafeRecordRuling,
                                )
                              }
                            >
                              Record Ruling
                            </SecondaryButton>
                          ) : (
                            <span className="text-fgd-3">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <article className="grid grid-cols-[458px_1fr] flex-grow gap-x-4">
        <WalletList
          className="w-full pt-9"
          data={pipe(
            data,
            map((data) => ({
              auxiliaryWallets: data.auxiliaryWallets,
              wallets: data.wallets,
            })),
          )}
          selectedAsset={legacySelectedAsset}
          selectedWallet={legacySelectedWallet}
          onSelectAsset={(asset, wallet) => {
            setSelectedWallet(wallet)
            setSelectedAsset(() => asset)
            setTreasurySelect({ _kind: 'Legacy' })
          }}
          onSelectWallet={(wallet) => {
            setSelectedWallet(() => wallet)
            setSelectedAsset(null)
            setTreasurySelect({ _kind: 'Legacy' })
          }}
        />
        <div>
          <div className="text-lg pb-10">&nbsp;</div>
          <div className="sticky top-0">
            <div
              className="h-[1px] top-[-1px] relative mb-[-1px]"
              ref={stickyTracker}
            />
            <Details
              className="pt-4"
              data={map(() => ({
                asset: legacySelectedAsset,
                wallet: legacySelectedWallet,
              }))(data)}
              isStickied={isStickied}
            />
          </div>
        </div>
      </article>
    </div>
  )
}
