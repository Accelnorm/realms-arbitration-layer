import useTransactionsStore from 'stores/useTransactionStore'

describe('useTransactionStore', () => {
  beforeEach(() => {
    useTransactionsStore.getState().closeTransactionProcess()
  })

  test('startProcessing initializes processing state', () => {
    useTransactionsStore.getState().startProcessing(3)

    const state = useTransactionsStore.getState()
    expect(state.isProcessing).toBe(true)
    expect(state.transactionsCount).toBe(3)
    expect(state.processedTransactions).toBe(0)
    expect(state.hasErrors).toBe(false)
  })

  test('incrementProcessedTransactions increments count', () => {
    useTransactionsStore.getState().startProcessing(2)

    useTransactionsStore.getState().incrementProcessedTransactions()
    useTransactionsStore.getState().incrementProcessedTransactions()

    expect(useTransactionsStore.getState().processedTransactions).toBe(2)
  })

  test('showTransactionError stores retry callback and error details', () => {
    const retryCallback = jest.fn(async () => undefined)
    const error = new Error('boom')

    useTransactionsStore
      .getState()
      .showTransactionError(retryCallback, error, 'tx-123')

    const state = useTransactionsStore.getState()
    expect(state.hasErrors).toBe(true)
    expect(state.retryCallback).toBe(retryCallback)
    expect(state.error).toBe(error)
    expect(state.txid).toBe('tx-123')
  })

  test('closeTransactionProcess resets store to default state', () => {
    const retryCallback = jest.fn(async () => undefined)
    useTransactionsStore.getState().startProcessing(1)
    useTransactionsStore
      .getState()
      .showTransactionError(retryCallback, new Error('err'), 'tx-1')

    useTransactionsStore.getState().closeTransactionProcess()

    const state = useTransactionsStore.getState()
    expect(state.isProcessing).toBe(false)
    expect(state.transactionsCount).toBe(0)
    expect(state.processedTransactions).toBe(0)
    expect(state.hasErrors).toBe(false)
    expect(state.retryCallback).toBeNull()
    expect(state.txid).toBe('')
  })
})
