import { PublicKey } from '@solana/web3.js'
import { useSelectedDelegatorStore } from 'stores/useSelectedDelegatorStore'

describe('useSelectedDelegatorStore', () => {
  beforeEach(() => {
    useSelectedDelegatorStore.setState({
      communityDelegator: undefined,
      councilDelegator: undefined,
    })
  })

  test('sets community delegator', () => {
    const pk = new PublicKey('11111111111111111111111111111111')

    useSelectedDelegatorStore.getState().setCommunityDelegator(pk)

    expect(useSelectedDelegatorStore.getState().communityDelegator?.toBase58()).toBe(
      pk.toBase58(),
    )
  })

  test('sets council delegator independently of community', () => {
    const communityPk = new PublicKey('11111111111111111111111111111111')
    const councilPk = new PublicKey('So11111111111111111111111111111111111111112')

    useSelectedDelegatorStore.getState().setCommunityDelegator(communityPk)
    useSelectedDelegatorStore.getState().setCouncilDelegator(councilPk)

    const state = useSelectedDelegatorStore.getState()
    expect(state.communityDelegator?.toBase58()).toBe(communityPk.toBase58())
    expect(state.councilDelegator?.toBase58()).toBe(councilPk.toBase58())
  })

  test('clears delegator when undefined is passed', () => {
    const pk = new PublicKey('11111111111111111111111111111111')
    useSelectedDelegatorStore.getState().setCommunityDelegator(pk)

    useSelectedDelegatorStore.getState().setCommunityDelegator(undefined)

    expect(useSelectedDelegatorStore.getState().communityDelegator).toBeUndefined()
  })
})
