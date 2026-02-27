/**
 * @jest-environment jsdom
 */

import { useLocalStorage } from 'hooks/useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test('setItem and getItem roundtrip values', () => {
    const storage = useLocalStorage()

    const didSet = storage.setItem('k', 'v')

    expect(didSet).toBe(true)
    expect(storage.getItem('k')).toBe('v')
  })

  test('removeItem removes value', () => {
    const storage = useLocalStorage()
    storage.setItem('k', 'v')

    storage.removeItem('k')

    expect(storage.getItem('k')).toBeUndefined()
  })
})
