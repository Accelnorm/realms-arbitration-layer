import remarkGfm from 'remark-gfm'
import { ExternalLinkIcon, FolderDownloadIcon } from '@heroicons/react/outline'
import { useProposalGovernanceQuery } from 'hooks/useProposal'
import ProposalStateBadge from '@components/ProposalStateBadge'
import { TransactionPanel } from '@components/instructions/TransactionPanel'
import DiscussionPanel from 'components/chat/DiscussionPanel'
import VotePanel from '@components/VotePanel'
import { ApprovalProgress, VetoProgress } from '@components/QuorumProgress'
import useRealm from 'hooks/useRealm'
import useProposalVotes from 'hooks/useProposalVotes'
import ProposalTimeStatus from 'components/ProposalTimeStatus'
import { useEffect, useMemo, useState } from 'react'
import ProposalActionsPanel from '@components/ProposalActions'
import { getRealmExplorerHost } from 'tools/routing'
import {
  GovernanceAccountType,
  ProposalState,
  VoteType,
} from '@solana/spl-governance'
import VoteResultStatus from '@components/VoteResultStatus'
import VoteResults from '@components/VoteResults'
import MultiChoiceVotes from '@components/MultiChoiceVotes'
import { resolveProposalDescription } from '@utils/helpers'
import PreviousRouteBtn from '@components/PreviousRouteBtn'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useQueryContext from '@hooks/useQueryContext'
import { ChevronRightIcon } from '@heroicons/react/solid'
import ProposalExecutionCard from '@components/ProposalExecutionCard'
import ProposalVotingPower from '@components/ProposalVotingPower'
import { useMediaQuery } from 'react-responsive'
import NftProposalVoteState from 'NftVotePlugin/NftProposalVoteState'
import ProposalWarnings from './ProposalWarnings'
import useWalletOnePointOh from '@hooks/useWalletOnePointOh'
import VotingRules from '@components/VotingRules'
import { useRouteProposalQuery } from '@hooks/queries/proposal'
import { AddToCalendarButton } from 'add-to-calendar-button-react'
import { CalendarAdd } from '@carbon/icons-react'
import Modal from '@components/Modal'
import dayjs from 'dayjs'
import { useConnection } from '@solana/wallet-adapter-react'
import { useTokenOwnerRecordByPubkeyQuery } from '@hooks/queries/tokenOwnerRecord'
import { useSelectedProposalTransactions } from '@hooks/queries/proposalTransaction'
import { fetchDisputeSafePayoutStateQuery } from '@hooks/queries/disputeSafe'
import useVoteRecords from '@hooks/useVoteRecords'
import { BigNumber } from 'bignumber.js'
import {
  VoteType as ProposalVoteType,
  VoterDisplayData,
} from '@models/proposal'
import { stringify } from 'csv-stringify/sync'
import ReactMarkdown from 'react-markdown'
import { formatPercentage } from '@utils/formatPercentage'
import type { BN } from '@coral-xyz/anchor'
import saveAs from 'file-saver'
import { PublicKey } from '@solana/web3.js'
import { SAFE_TREASURY_PROGRAM_ID } from '@utils/instructions/DisputeSafe/pdas'
import { SecondaryButton } from '@components/Button'
import { Instructions } from '@utils/uiTypes/proposalCreationTypes'

type ProposalPayoutStateRow = {
  payoutAddress: string
  payoutId: bigint
  payoutIndex: bigint
  status: number
  disputeDeadline: number
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

const getProposalPayoutStatusLabel = (status: number, disputeDeadline: number) => {
  const isReleaseReady =
    status === 0 && disputeDeadline <= Math.floor(Date.now() / 1000)

  if (isReleaseReady) return 'ReleaseReady'

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

const getProposalPayoutStatusBadgeClass = (
  status: number,
  disputeDeadline: number,
) => {
  const label = getProposalPayoutStatusLabel(status, disputeDeadline)

  if (label === 'ReleaseReady') {
    return 'bg-green/20 text-green'
  }

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

const parseProposalPayoutState = (
  payoutAddress: PublicKey,
  data: Buffer,
): ProposalPayoutStateRow | null => {
  try {
    let offset = 8

    const [payoutId, payoutIdOffset] = readU64(data, offset)
    offset = payoutIdOffset

    const [payoutIndex, payoutIndexOffset] = readU64(data, offset)
    offset = payoutIndexOffset

    const [, safeOffset] = readPubkey(data, offset)
    offset = safeOffset

    offset += 1 // asset_type

    const [, mintOffset] = readOptionPubkey(data, offset)
    offset = mintOffset

    const [, recipientOffset] = readPubkey(data, offset)
    offset = recipientOffset

    const [, amountOffset] = readU64(data, offset)
    offset = amountOffset

    const [, metadataOffset] = readOptionBytes32(data, offset)
    offset = metadataOffset

    const status = data[offset]
    offset += 1

    const [disputeDeadline] = readI64(data, offset)

    return {
      payoutAddress: payoutAddress.toBase58(),
      payoutId,
      payoutIndex,
      status,
      disputeDeadline,
    }
  } catch {
    return null
  }
}

const Proposal = () => {
  const { realmInfo, symbol } = useRealm()
  const router = useRouter()
  const proposal = useRouteProposalQuery().data?.result
  const { data: proposalTransactions } = useSelectedProposalTransactions()
  const governance = useProposalGovernanceQuery().data?.result
  const tor = useTokenOwnerRecordByPubkeyQuery(
    proposal?.account.tokenOwnerRecord,
  ).data?.result
  const voteRecords = useVoteRecords(proposal)
  const { connection } = useConnection()
  const descriptionLink = proposal?.account.descriptionLink
  const allowDiscussion = realmInfo?.allowDiscussion ?? true
  const isMulti =
    proposal?.account.voteType !== VoteType.SINGLE_CHOICE &&
    proposal?.account.accountType === GovernanceAccountType.ProposalV2

  const [openCalendarModal, setOpenCalendarModal] = useState(false)
  const [description, setDescription] = useState('')
  const [disputePayoutStates, setDisputePayoutStates] = useState<
    ProposalPayoutStateRow[]
  >([])
  const [isLoadingDisputePayoutStates, setIsLoadingDisputePayoutStates] =
    useState(false)
  const voteData = useProposalVotes(proposal?.account)
  const currentWallet = useWalletOnePointOh()
  const showResults =
    proposal &&
    proposal.account.state !== ProposalState.Cancelled &&
    proposal.account.state !== ProposalState.Draft

  const votingEnded =
    !!governance &&
    !!proposal &&
    proposal.account.getTimeToVoteEnd(governance.account) < 0

  const isTwoCol = useMediaQuery({ query: '(min-width: 768px)' })

  useEffect(() => {
    const handleResolveDescription = async () => {
      const description = await resolveProposalDescription(descriptionLink!)
      setDescription(description)
    }
    if (descriptionLink) {
      handleResolveDescription()
    } else {
      setDescription('')
    }
  }, [descriptionLink])

  const proposedBy = proposal && tor?.account.governingTokenOwner.toBase58()

  const { fmtUrlWithCluster } = useQueryContext()
  const showTokenBalance = proposal
    ? proposal.account.state === ProposalState.Draft ||
      proposal.account.state === ProposalState.SigningOff ||
      (proposal.account.state === ProposalState.Voting && !votingEnded)
    : true
  const showProposalExecution =
    proposal &&
    (proposal.account.state === ProposalState.Succeeded ||
      proposal.account.state === ProposalState.Executing ||
      proposal.account.state === ProposalState.ExecutingWithErrors)

  const votingTimeEnds =
    proposal?.account.signingOffAt &&
    governance &&
    proposal.account.signingOffAt.toNumber() +
      governance.account.config.baseVotingTime

  const coolOffTimeEnds =
    proposal?.account.signingOffAt &&
    governance &&
    proposal.account.signingOffAt.toNumber() +
      governance.account.config.baseVotingTime +
      governance.account.config.votingCoolOffTime

  function filterOutUndecidedVotes(voteRecords: VoterDisplayData[]) {
    return voteRecords.filter(
      (records) => records.voteType !== ProposalVoteType.Undecided,
    )
  }

  async function handleExportCsv() {
    try {
      const voters = filterOutUndecidedVotes(voteRecords)

      const voteTypeText = (type: ProposalVoteType, isMulti: boolean) => {
        switch (type) {
          case ProposalVoteType.No:
            return 'No'
          case ProposalVoteType.Yes:
            if (isMulti) {
              return 'Voted'
            } else {
              return 'Yes'
            }
        }
      }

      const formatNumber = (value: BN, decimals: number) => {
        const num = new BigNumber(value.toString()).shiftedBy(-decimals)

        if (typeof Intl === 'undefined' || typeof navigator === 'undefined') {
          return num.toFormat()
        }

        const formatter = new Intl.NumberFormat(navigator.language, {
          minimumFractionDigits: decimals,
        })
        return formatter.format(num.toNumber())
      }

      // Prepare data for CSV
      const csvData = [
        ['Proposal Name', proposal?.account.name],
        ['Proposal Address', proposal?.pubkey.toString()],
        ['Total Voters', voters.length],
        [], // Empty row for separation
        ['Voter Address', 'Vote Type', 'Governance Power (in %)', 'Votes Cast'],
        ...voters.map((record) => [
          record.key,
          voteTypeText(record.voteType, isMulti),
          formatPercentage(record.votePercentage),
          formatNumber(record.votesCast, record.decimals),
        ]),
      ]

      // Convert to CSV string
      const csvString = stringify(csvData)

      // Create and download file
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8' })
      saveAs(
        blob,
        `proposal-voters-${proposal?.account.name.replace(/\s+/g, '_')}.csv`,
      )
    } catch (error) {
      console.error('Error exporting CSV:', error)
    }
  }

  const showExportCsvButton = useMemo(() => {
    return (
      proposal?.account.state !== ProposalState.Voting &&
      filterOutUndecidedVotes(voteRecords)?.length > 0
    )
  }, [proposal, voteRecords])

  const referencedDisputePayoutAddresses = useMemo(() => {
    if (!proposalTransactions) {
      return []
    }

    const payoutAddressSet = new Set<string>()

    proposalTransactions
      .flatMap((transaction) => transaction.account.getAllInstructions())
      .filter((ix) => ix.programId.equals(SAFE_TREASURY_PROGRAM_ID))
      .forEach((ix) => {
        const payoutAddress = ix.accounts[0]?.pubkey
        if (payoutAddress) {
          payoutAddressSet.add(payoutAddress.toBase58())
        }
      })

    return Array.from(payoutAddressSet).map((address) => new PublicKey(address))
  }, [proposalTransactions])

  useEffect(() => {
    let disposed = false

    const loadDisputePayoutStates = async () => {
      if (!referencedDisputePayoutAddresses.length) {
        setDisputePayoutStates([])
        return
      }

      setIsLoadingDisputePayoutStates(true)

      try {
        const payoutStateResults = await Promise.all(
          referencedDisputePayoutAddresses.map((payoutAddress) =>
            fetchDisputeSafePayoutStateQuery(connection, payoutAddress),
          ),
        )

        const payoutRows = payoutStateResults.flatMap((result, index) => {
          if (!result.found || !result.result) {
            return []
          }

          const parsed = parseProposalPayoutState(
            referencedDisputePayoutAddresses[index],
            result.result.data,
          )

          return parsed ? [parsed] : []
        })

        if (!disposed) {
          setDisputePayoutStates(
            payoutRows.sort((a, b) => (a.payoutId > b.payoutId ? -1 : 1)),
          )
        }
      } finally {
        if (!disposed) {
          setIsLoadingDisputePayoutStates(false)
        }
      }
    }

    loadDisputePayoutStates()

    return () => {
      disposed = true
    }
  }, [
    connection,
    referencedDisputePayoutAddresses
      .map((address) => address.toBase58())
      .join('|'),
  ])

  const goToDisputeSafeInstruction = (instruction: Instructions) => {
    if (typeof symbol !== 'string') {
      return
    }

    router.push(fmtUrlWithCluster(`/dao/${symbol}/proposal/new?i=${instruction}`))
  }

  const goToTreasuryQueue = () => {
    if (typeof symbol !== 'string') {
      return
    }

    router.push(fmtUrlWithCluster(`/dao/${symbol}/treasury/v2`))
  }

  return (
    <div className="grid grid-cols-12 gap-4 overflow-y-auto">
      <div className="bg-bkg-2 rounded-lg p-4 md:p-6 col-span-12 md:col-span-7 lg:col-span-8 space-y-3">
        {proposal ? (
          <>
            <div className="flex flex-items justify-between">
              <PreviousRouteBtn />
              <div className="flex items-center">
                {showExportCsvButton && (
                  <button onClick={handleExportCsv}>
                    <FolderDownloadIcon className="flex-shrink-0 h-4 ml-2 mt-0.5 text-primary-light w-4" />
                  </button>
                )}
                <a
                  href={`https://${getRealmExplorerHost(
                    realmInfo,
                  )}/account/${proposal.pubkey.toBase58()}${
                    connection.rpcEndpoint.includes('devnet')
                      ? '?cluster=devnet'
                      : ''
                  }`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLinkIcon className="flex-shrink-0 h-4 ml-2 mt-0.5 text-primary-light w-4" />
                </a>
              </div>
            </div>

            <div className="py-4">
              <div className="flex items-center justify-between mb-1">
                <h1 className="mr-2 overflow-wrap-anywhere">
                  {proposal?.account.name}
                </h1>
                <ProposalStateBadge proposal={proposal.account} />
              </div>
              {proposedBy && (
                <p className="text-[10px]">
                  Proposed by: {tor?.account.governingTokenOwner.toBase58()}
                </p>
              )}
            </div>

            {description && (
              <div className="pb-2">
                <ReactMarkdown
                  className="markdown"
                  linkTarget="_blank"
                  remarkPlugins={[remarkGfm]}
                >
                  {description}
                </ReactMarkdown>
              </div>
            )}
            {proposal.account && (
              <ProposalWarnings proposal={proposal.account} />
            )}
            {(isLoadingDisputePayoutStates || disputePayoutStates.length > 0) && (
              <div className="rounded-lg border border-white/10 bg-bkg-1 p-4">
                <h3 className="mb-3">Dispute Payout States</h3>
                {isLoadingDisputePayoutStates ? (
                  <div className="text-xs text-fgd-3">Loading payout states...</div>
                ) : (
                  <div className="space-y-2">
                    {disputePayoutStates.map((payout) => {
                      const statusLabel = getProposalPayoutStatusLabel(
                        payout.status,
                        payout.disputeDeadline,
                      )
                      const isChallenged = payout.status === 1
                      const isReleaseReady = statusLabel === 'ReleaseReady'

                      return (
                        <div
                          key={payout.payoutAddress}
                          className="rounded border border-white/10 bg-bkg-2 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-mono text-xs text-fgd-1">
                              Payout {payout.payoutId.toString()}
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getProposalPayoutStatusBadgeClass(
                                payout.status,
                                payout.disputeDeadline,
                              )}`}
                            >
                              {statusLabel}
                            </span>
                          </div>

                          <div className="mt-2 text-[11px] text-fgd-3 font-mono break-all">
                            {payout.payoutAddress}
                          </div>

                          <div className="mt-3 flex gap-2">
                            {isChallenged && (
                              <SecondaryButton
                                small
                                onClick={() =>
                                  goToDisputeSafeInstruction(
                                    Instructions.DisputeSafeRecordRuling,
                                  )
                                }
                              >
                                Record Ruling
                              </SecondaryButton>
                            )}

                            {isReleaseReady && (
                              <SecondaryButton small onClick={goToTreasuryQueue}>
                                Release from Queue
                              </SecondaryButton>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
            <TransactionPanel />
            {isTwoCol && allowDiscussion && <DiscussionPanel />}
          </>
        ) : (
          <>
            <div className="animate-pulse bg-bkg-3 h-12 rounded-lg" />
            <div className="animate-pulse bg-bkg-3 h-64 rounded-lg" />
            <div className="animate-pulse bg-bkg-3 h-64 rounded-lg" />
          </>
        )}
      </div>

      <div className="col-span-12 md:col-span-5 lg:col-span-4 space-y-4">
        <VotePanel />
        {showTokenBalance && <ProposalVotingPower />}
        {showResults ? (
          <div className="bg-bkg-2 rounded-lg">
            <div className="p-4 md:p-6">
              {proposal?.account.state === ProposalState.Voting ? (
                <div className="flex items-end justify-between mb-4">
                  <h3 className="mb-0 flex-row">
                    Voting Now
                    <CalendarAdd
                      onClick={() => setOpenCalendarModal(true)}
                      className="w-5"
                    ></CalendarAdd>
                    {openCalendarModal && (
                      <Modal
                        sizeClassName="sm:max-w-sm"
                        onClose={() => setOpenCalendarModal(false)}
                        isOpen={openCalendarModal}
                      >
                        <div>
                          <p>Remind me about voting time end</p>
                          {votingTimeEnds && (
                            <AddToCalendarButton
                              hideCheckmark
                              size="6|4|2"
                              name={`${realmInfo?.displayName} voting time for proposal: ${proposal.account.name} soon ends`}
                              location={`${window.location.pathname}`}
                              description={''}
                              startDate={dayjs
                                .unix(votingTimeEnds)
                                .format('YYYY-MM-DD')}
                              startTime={dayjs
                                .unix(votingTimeEnds)
                                .subtract(30, 'minute')
                                .format('HH:mm')}
                              endTime={dayjs
                                .unix(votingTimeEnds)
                                .format('HH:mm')}
                              options="Google"
                            />
                          )}
                        </div>
                        {governance?.account.config.votingCoolOffTime && (
                          <div>
                            <p>Remind me about cool off time end</p>
                            {coolOffTimeEnds && (
                              <AddToCalendarButton
                                hideCheckmark
                                size="6|4|2"
                                name={`${realmInfo?.displayName} cool off time for proposal: ${proposal.account.name} soon ends`}
                                location={`${window.location.pathname}`}
                                description={''}
                                startDate={dayjs
                                  .unix(coolOffTimeEnds)
                                  .format('YYYY-MM-DD')}
                                startTime={dayjs
                                  .unix(coolOffTimeEnds)
                                  .subtract(30, 'minute')
                                  .format('HH:mm')}
                                endTime={dayjs
                                  .unix(coolOffTimeEnds)
                                  .format('HH:mm')}
                                options="Google"
                              />
                            )}
                          </div>
                        )}
                      </Modal>
                    )}
                  </h3>
                  <ProposalTimeStatus proposal={proposal?.account} />
                </div>
              ) : (
                <h3 className="mb-4">Results</h3>
              )}
              {proposal?.account.state === ProposalState.Voting && !isMulti ? (
                <>
                  <div className="pb-3">
                    <ApprovalProgress
                      votesRequired={voteData.yesVotesRequired}
                      progress={voteData.yesVoteProgress}
                      showBg
                    />
                  </div>
                  {voteData._programVersion !== undefined &&
                  // @asktree: here is some typescript gore because typescript doesn't know that a number being > 3 means it isn't 1 or 2
                  voteData._programVersion !== 1 &&
                  voteData._programVersion !== 2 &&
                  voteData.veto !== undefined &&
                  (voteData.veto.voteProgress ?? 0) > 0 ? (
                    <div className="pb-3">
                      <VetoProgress
                        votesRequired={voteData.veto.votesRequired}
                        progress={voteData.veto.voteProgress}
                        showBg
                      />
                    </div>
                  ) : undefined}
                </>
              ) : (
                <div className="pb-3">
                  <VoteResultStatus />
                </div>
              )}

              {isMulti ? (
                <MultiChoiceVotes
                  proposal={proposal.account}
                  limit={proposal.account.options.length}
                />
              ) : (
                <VoteResults proposal={proposal.account} />
              )}
              {proposal && (
                <div className="flex justify-end mt-4">
                  <Link
                    href={fmtUrlWithCluster(
                      `/dao/${symbol}/proposal/${proposal.pubkey}/explore`,
                    )}
                    passHref
                  >
                    <a className="text-sm flex items-center default-transition text-fgd-2 transition-all hover:text-fgd-3">
                      Explore
                      <ChevronRightIcon className="flex-shrink-0 h-6 w-6" />
                    </a>
                  </Link>
                </div>
              )}
            </div>
          </div>
        ) : null}
        <VotingRules />
        <NftProposalVoteState proposal={proposal}></NftProposalVoteState>
        {proposal && currentWallet && showProposalExecution && (
          <ProposalExecutionCard />
        )}
        <ProposalActionsPanel />
        {!isTwoCol && proposal && allowDiscussion && (
          <div className="bg-bkg-2 rounded-lg p-4 md:p-6 ">
            <DiscussionPanel />
          </div>
        )}
      </div>
    </div>
  )
}

export default Proposal
