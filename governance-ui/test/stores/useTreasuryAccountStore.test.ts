import { PublicKey } from '@solana/web3.js'
import useTreasuryAccountStore from 'stores/useTreasuryAccountStore'
import tokenPriceService from '@utils/services/tokenPrice'
import { notify } from '@utils/notifications'
import { AccountType } from '@utils/uiTypes/assets'
import { WSOL_MINT } from '@components/instructions/tools'

jest.mock('@utils/services/tokenPrice', () => ({
  __esModule: true,
  default: {
    getTokenInfo: jest.fn(),
  },
}))

jest.mock('@utils/notifications', () => ({
  notify: jest.fn(),
}))

const mockedGetTokenInfo = jest.mocked(tokenPriceService.getTokenInfo)
const mockedNotify = jest.mocked(notify)

const transferAddress = new PublicKey('11111111111111111111111111111111')

const connection = {
  current: {
    getSignaturesForAddress: jest.fn(),
  },
}

const tokenAccount = {
  type: AccountType.TOKEN,
  extensions: {
    transferAddress,
    token: {
      account: {
        mint: new PublicKey('So11111111111111111111111111111111111111112'),
      },
    },
  },
} as any

const solAccount = {
  type: AccountType.SOL,
  extensions: {
    transferAddress,
    token: undefined,
  },
} as any

describe('useTreasuryAccountStore', () => {
  beforeEach(() => {
    useTreasuryAccountStore.setState({
      currentAccount: null,
      mintAddress: '',
      tokenInfo: undefined,
      recentActivity: [],
      isLoadingRecentActivity: false,
      isLoadingTokenAccounts: false,
    })
    connection.current.getSignaturesForAddress.mockReset()
    mockedGetTokenInfo.mockReset()
    mockedNotify.mockReset()
  })

  test('setCurrentAccount clears state when account is null', async () => {
    useTreasuryAccountStore.setState({
      currentAccount: tokenAccount,
      mintAddress: 'mint',
      tokenInfo: { symbol: 'ABC' } as any,
      recentActivity: [{} as any],
    })

    await useTreasuryAccountStore.getState().setCurrentAccount(null as any, connection)

    const state = useTreasuryAccountStore.getState()
    expect(state.currentAccount).toBeNull()
    expect(state.mintAddress).toBe('')
    expect(state.tokenInfo).toBeUndefined()
    expect(state.recentActivity).toEqual([])
  })

  test('setCurrentAccount maps SOL account to WSOL mint and loads activity', async () => {
    const recentActivity = [{ signature: 'sig-1' }]
    mockedGetTokenInfo.mockReturnValue({ symbol: 'SOL' } as any)
    connection.current.getSignaturesForAddress.mockResolvedValue(recentActivity)

    await useTreasuryAccountStore.getState().setCurrentAccount(solAccount, connection)

    const state = useTreasuryAccountStore.getState()
    expect(state.currentAccount).toBe(solAccount)
    expect(state.mintAddress).toBe(WSOL_MINT)
    expect(state.tokenInfo).toEqual({ symbol: 'SOL' })
    expect(state.recentActivity).toEqual(recentActivity)
    expect(connection.current.getSignaturesForAddress).toHaveBeenCalledWith(
      transferAddress,
      { limit: 5 },
      'confirmed',
    )
  })

  test('handleFetchRecentActivity notifies on RPC errors and stops loading', async () => {
    connection.current.getSignaturesForAddress.mockRejectedValue(new Error('rpc down'))

    await useTreasuryAccountStore
      .getState()
      .handleFetchRecentActivity(tokenAccount, connection)

    const state = useTreasuryAccountStore.getState()
    expect(state.isLoadingRecentActivity).toBe(false)
    expect(state.recentActivity).toEqual([])
    expect(mockedNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
      }),
    )
  })
})
