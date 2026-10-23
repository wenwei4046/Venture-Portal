import { describe, expect, it } from 'vitest'
import type { MktSub } from './board'
import { clientEditOf, clientPatch, clientProblems, picNames } from './clients'

// 2026-10-24 — a client's details edited on its page (②b-2d-2a, the user's answer 29): only what changed goes to
// mkt_sub_edit, never a group company's name; what it would refuse is said before Save. The database's side is
// tests/member-sql/validate-marketing-two-pics.mjs.

const ACME: MktSub = { id: 's1', code: 'ACME', name: 'Acme Holdings', dot: 'x', emoji: '🏢', client: true, pic: 'Kelvin', whatsapp: '+60 12-345 6789', pic2: null, whatsapp2: null }
const CARRES: MktSub = { id: 's2', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Wong' }

describe('a client’s details, edited', () => {
  it('starts from what the board says — a field it does not carry is empty', () => {
    expect(clientEditOf(ACME)).toEqual({ name: 'Acme Holdings', pic: 'Kelvin', whatsapp: '+60 12-345 6789', pic2: '', whatsapp2: '' })
    expect(clientEditOf(CARRES)).toEqual({ name: 'Carres', pic: 'Wong', whatsapp: '', pic2: '', whatsapp2: '' })
  })

  it('sends only what changed — a name as the database keeps it, a field emptied as nothing', () => {
    const saved = clientEditOf(ACME)
    expect(clientPatch(saved, saved, true)).toBeNull()
    expect(clientPatch(saved, { ...saved, name: '  Acme   Holdings ' }, true)).toBeNull()
    expect(clientPatch(saved, { ...saved, pic2: 'Hana Lee', whatsapp2: ' +60 13 ' }, true)).toEqual({ pic2: 'Hana Lee', whatsapp2: '+60 13' })
    expect(clientPatch(saved, { ...saved, whatsapp: '' }, true)).toEqual({ whatsapp: null })
  })

  it('never a group company’s name — it keeps its own', () => {
    const saved = clientEditOf(CARRES)
    expect(clientPatch(saved, { ...saved, name: 'Carres Home', pic: 'Wong Li' }, false)).toEqual({ pic: 'Wong Li' })
  })

  it('says what the database would refuse', () => {
    const saved = clientEditOf(ACME)
    expect(clientProblems(saved, true)).toEqual([])
    expect(clientProblems({ ...saved, name: ' ' }, true)).toEqual(['Name the client'])
    expect(clientProblems({ ...saved, name: ' ' }, false)).toEqual([])
    expect(clientProblems({ ...saved, pic: '', pic2: 'Hana' }, true)).toEqual(['Name the first PIC before a second'])
    expect(clientProblems({ ...saved, pic2: 'kelvin' }, true)).toEqual(['The second PIC is somebody else'])
    expect(clientProblems({ ...saved, whatsapp2: 'call me' }, true)).toEqual(['A WhatsApp number, digits only'])
  })

  it('names one PIC or both', () => {
    expect([picNames('Kelvin', 'Hana'), picNames('Kelvin', null), picNames(' ', ''), picNames(null)]).toEqual(['Kelvin and Hana', 'Kelvin', '', ''])
  })
})
