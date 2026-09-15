import { describe, expect, it } from 'vitest'
import { suggestStaffByName } from './suggest-staff'

const ROSTER = [
  { id: 'chea', name: 'CHEA HUAN' },
  { id: 'yau-wei', name: 'LIM YAU WEI' },
  { id: 'wei-siang', name: 'LIM WEI SIANG' },
  { id: 'sheldon', name: 'SHELDON TAN' },
  { id: 'mei-1', name: 'MEI TING' },
]

describe('suggestStaffByName', () => {
  it('matches the same name through case and spacing', () => {
    expect(suggestStaffByName('Chea Huan', ROSTER)).toBe('chea')
    expect(suggestStaffByName('  sheldon   tan ', ROSTER)).toBe('sheldon')
    expect(suggestStaffByName('LIM YAU WEI', ROSTER)).toBe('yau-wei')
  })

  it('refuses a name that is only part of somebody', () => {
    // The real case: the ERP sent "Lim", and two people on the roster are
    // Lims. Even one would not be enough — a surname is not an identity.
    expect(suggestStaffByName('Lim', ROSTER)).toBeNull()
    expect(suggestStaffByName('Tan', ROSTER)).toBeNull()
    expect(suggestStaffByName('Chea Huan Ng', ROSTER)).toBeNull()
  })

  it('refuses a name two people share', () => {
    const twins = [...ROSTER, { id: 'mei-2', name: 'Mei Ting' }]
    expect(suggestStaffByName('MEI TING', twins)).toBeNull()
  })

  it('refuses what the ERP sends instead of a salesperson', () => {
    expect(suggestStaffByName('(no salesperson)', ROSTER)).toBeNull()
    expect(suggestStaffByName('OTHERS', ROSTER)).toBeNull()
    expect(suggestStaffByName('', ROSTER)).toBeNull()
    expect(suggestStaffByName('Kingsley', ROSTER)).toBeNull()
  })

  it('never names somebody the dropdown does not offer', () => {
    expect(suggestStaffByName('Chea Huan', [])).toBeNull()
  })
})
