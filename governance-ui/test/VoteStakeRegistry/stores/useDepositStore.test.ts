import { BN } from '@coral-xyz/anchor'
import useDepositStore from 'VoteStakeRegistry/stores/useDepositStore'
import { getDeposits } from 'VoteStakeRegistry/tools/deposits'

jest.mock('VoteStakeRegistry/tools/deposits', () => ({
  getDeposits: jest.fn(),
}))

const mockedGetDeposits = getDeposits as jest.MockedFunction<typeof getDeposits>

describe('useDepositStore', () => {
  beforeEach(() => {
    useDepositStore.getState().resetDepositState()
    mockedGetDeposits.mockReset()
  })

  test('resetDepositState returns default values', () => {
    useDepositStore.setState((s) => {
      s.state.isLoading = true
      s.state.deposits = [{} as any]
      s.state.votingPowerFromDeposits = new BN(9)
    })

    useDepositStore.getState().resetDepositState()

    const state = useDepositStore.getState().state
    expect(state.isLoading).toBe(false)
    expect(state.deposits).toEqual([])
    expect(state.votingPowerFromDeposits.eq(new BN(0))).toBe(true)
  })

  test('getOwnedDeposits toggles loading and stores fetched deposits', async () => {
    const votingPower = new BN(42)
    const deposits = [{ id: 'dep-1' }] as any
    mockedGetDeposits.mockResolvedValue({
      deposits,
      votingPowerFromDeposits: votingPower,
    } as any)

    const promise = useDepositStore.getState().getOwnedDeposits({
      realmPk: {} as any,
      walletPk: {} as any,
      communityMintPk: {} as any,
      client: {} as any,
      connection: {} as any,
    })

    expect(useDepositStore.getState().state.isLoading).toBe(true)

    await promise

    const state = useDepositStore.getState().state
    expect(state.isLoading).toBe(false)
    expect(state.deposits).toBe(deposits)
    expect(state.votingPowerFromDeposits).toBe(votingPower)
    expect(mockedGetDeposits).toHaveBeenCalledWith(
      expect.objectContaining({
        isUsed: true,
      }),
    )
  })
})
