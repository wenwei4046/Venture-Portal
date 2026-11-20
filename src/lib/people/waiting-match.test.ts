import { describe, expect, it } from 'vitest'
import { nameKey, phoneKey, waitingMatches, type WaitingApplicant } from './waiting-match'

const shuHui: WaitingApplicant = {
  id: 'rq-4', requestNo: 'RQ-2610-004', name: 'CHEAH SHU HUI', contact: '018-460-2375', subName: 'Fair', position: 1,
}
const jinYang: WaitingApplicant = {
  id: 'rq-6', requestNo: 'RQ-2610-006', name: 'TAN JIN YANG', contact: '012-312-9338', subName: 'Fair', position: 2,
}
const list = [shuHui, jinYang]

describe('phoneKey / nameKey', () => {
  it('reads a phone as digits, +60 as the leading 0', () => {
    expect(phoneKey('018-460-2375')).toBe('0184602375')
    expect(phoneKey('+60 18 460 2375')).toBe('0184602375')
    expect(phoneKey(null)).toBe('')
  })
  it('reads a name in capitals with single spaces', () => {
    expect(nameKey('  Cheah   shu hui ')).toBe('CHEAH SHU HUI')
  })
})

describe('waitingMatches — the regression: CHEAH SHU HUI filed on Add Staff while still waiting', () => {
  it('finds her by the phone People writes without dashes', () => {
    expect(waitingMatches('', '0184602375', list)).toEqual([shuHui])
  })
  it('finds her by her name, however it is typed', () => {
    expect(waitingMatches('cheah  Shu Hui', '', list)).toEqual([shuHui])
  })
  it('says nothing while the phone is still being typed', () => {
    expect(waitingMatches('', '018460', list)).toEqual([])
  })
  it('says nothing for a part of a name or somebody not on the list', () => {
    expect(waitingMatches('CHEAH', '', list)).toEqual([])
    expect(waitingMatches('LOO WEN WEI', '0123456789', list)).toEqual([])
  })
  it('lists each applicant once when the name and the phone both point at them', () => {
    expect(waitingMatches('TAN JIN YANG', '0123129338', list)).toEqual([jinYang])
  })
})
