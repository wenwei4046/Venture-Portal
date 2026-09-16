import { describe, it, expect } from 'vitest'
import {
  findOrganiserByName,
  organiserKey,
  organiserName,
  organiserOptions,
  sortOrganisers,
  withFairs,
  type Organiser,
} from './organisers'

function org(partial: Partial<Organiser> & { id: string; name: string }): Organiser {
  return { notes: null, isActive: true, ...partial }
}

describe('organiserKey', () => {
  it('matches SQL organiser_key(): upper case, single spaces', () => {
    expect(organiserKey('  home   dec ')).toBe('HOME DEC')
    expect(organiserKey('HOMEDEC')).toBe('HOMEDEC')
    expect(organiserKey('Homedec')).toBe('HOMEDEC')
  })

  it('is nothing for nothing', () => {
    expect(organiserKey(null)).toBeNull()
    expect(organiserKey(undefined)).toBeNull()
    expect(organiserKey('   ')).toBeNull()
  })
})

describe('organiserName', () => {
  it('keeps the typed spelling but tidies the spaces', () => {
    expect(organiserName(' Star  Property Fair ')).toBe('Star Property Fair')
    expect(organiserName('')).toBeNull()
  })
})

describe('organiserOptions', () => {
  const all = [
    org({ id: 'b', name: 'Star Property Fair' }),
    org({ id: 'a', name: 'HOMEDEC' }),
    org({ id: 'z', name: 'Old Fairs Sdn Bhd', isActive: false }),
  ]

  it('offers the live organisers, by name', () => {
    expect(organiserOptions(all, null).map(o => o.name)).toEqual([
      'HOMEDEC',
      'Star Property Fair',
    ])
  })

  it('keeps a retired organiser when it is the one this fair already holds', () => {
    // Otherwise the cell renders as the first option instead, and saving the
    // row would quietly reassign the fair to somebody else.
    expect(organiserOptions(all, 'z').map(o => o.name)).toEqual([
      'HOMEDEC',
      'Old Fairs Sdn Bhd',
      'Star Property Fair',
    ])
  })

  it('sorts without caring about case', () => {
    const rows = organiserOptions(
      [org({ id: '1', name: 'zeta' }), org({ id: '2', name: 'Alpha' })],
      null,
    )
    expect(rows.map(o => o.name)).toEqual(['Alpha', 'zeta'])
  })
})

describe('sortOrganisers', () => {
  it('puts the live ones first and keeps the retired ones visible below', () => {
    const rows = sortOrganisers([
      org({ id: 'z', name: 'Andromeda', isActive: false }),
      org({ id: 'b', name: 'Star Property Fair' }),
      org({ id: 'a', name: 'HOMEDEC' }),
    ])
    expect(rows.map(o => o.name)).toEqual(['HOMEDEC', 'Star Property Fair', 'Andromeda'])
  })
})

describe('withFairs', () => {
  const all = [org({ id: 'a', name: 'HOMEDEC' }), org({ id: 'b', name: 'Star Property Fair' })]

  it('attaches what each organiser ran, and zero for one that has run nothing', () => {
    const rows = withFairs(all, new Map([['a', { fairs: 2, bills: 64, total: 449_243 }]]))
    expect(rows[0]).toMatchObject({ name: 'HOMEDEC', fairs: 2, bills: 64, total: 449_243 })
    expect(rows[1]).toMatchObject({ name: 'Star Property Fair', fairs: 0, bills: 0, total: 0 })
  })

  it('comes back in the order the register lists, retired last', () => {
    const rows = withFairs([org({ id: 'z', name: 'Andromeda', isActive: false }), ...all], new Map())
    expect(rows.map(o => o.name)).toEqual(['HOMEDEC', 'Star Property Fair', 'Andromeda'])
  })
})

describe('findOrganiserByName', () => {
  const all = [org({ id: 'a', name: 'HOMEDEC' })]

  it('matches the way the database matches — on the key, not the spelling', () => {
    expect(findOrganiserByName(all, 'homedec')?.id).toBe('a')
    expect(findOrganiserByName(all, '  HOMEDEC  ')?.id).toBe('a')
  })

  it('does not guess at a name nobody has registered', () => {
    expect(findOrganiserByName(all, 'HOME DEC')).toBeNull()
    expect(findOrganiserByName(all, null)).toBeNull()
  })
})
