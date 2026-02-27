import {
  PackageEnum,
  Instructions,
} from '@utils/uiTypes/proposalCreationTypes'

describe('DisputeSafe enum registration', () => {
  it('PackageEnum contains DisputeSafe', () => {
    expect(PackageEnum.DisputeSafe).toBeDefined()
    expect(typeof PackageEnum.DisputeSafe).toBe('number')
  })

  const disputeSafeInstructions = [
    'DisputeSafeMigrateToSafe',
    'DisputeSafeQueuePayout',
    'DisputeSafeChallengePayout',
    'DisputeSafeRecordRuling',
    'DisputeSafeReleasePayout',
    'DisputeSafeExitFromCustody',
  ] as const

  it.each(disputeSafeInstructions)(
    'Instructions contains %s',
    (name) => {
      expect(Instructions[name]).toBeDefined()
      expect(typeof Instructions[name]).toBe('number')
    },
  )

  it('all 6 DisputeSafe instruction IDs are unique integers', () => {
    const ids = disputeSafeInstructions.map((name) => Instructions[name])
    const unique = new Set(ids)
    expect(unique.size).toBe(6)
    ids.forEach((id) => expect(Number.isInteger(id)).toBe(true))
  })
})
