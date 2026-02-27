import useRouterHistoryStore from 'stores/useRouterHistoryStore'

describe('useRouterHistoryStore', () => {
  beforeEach(() => {
    useRouterHistoryStore.setState({ history: [] })
  })

  test('starts with empty history', () => {
    expect(useRouterHistoryStore.getState().history).toEqual([])
  })

  test('replaces history via setHistory', () => {
    const history = ['/realms', '/dao/MNGO']

    useRouterHistoryStore.getState().setHistory(history)

    expect(useRouterHistoryStore.getState().history).toEqual(history)
  })
})
