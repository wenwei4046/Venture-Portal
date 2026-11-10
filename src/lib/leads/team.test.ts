import { describe, expect, it } from 'vitest'
import { defaultsFor, pickRows, shortDay, stopped, subLine, type TeamMember } from './team'

const outlets = [{ id: 'kj', brandId: 'b1', name: '2990s Kelana Jaya' }, { id: 'tm', brandId: 'b3', name: 'Carress Taman Maluri' }]
const m = (p: Partial<TeamMember>): TeamMember => ({ staffId: 's', code: '', name: 'Daniel Chew', email: '', title: '', erpCode: '', erpJob: '', branch: '', hasLogin: true,
  role: 'outlet', reply: true, reports: false, outlets: [], from: null, to: null, why: '', leftOn: null, ...p })

// Lead View v3 § 4: who somebody starts as, what their row says, and the Add from ERP list.
describe('Team', () => {
  it('a Lead Executive starts as Customer service; anybody else as Outlet staff on their branch', () => {
    expect(defaultsFor({ erpJob: 'Lead Executive', title: '', branch: 'HQ' }, outlets)).toEqual({ role: 'cs', outlets: [] })
    expect(defaultsFor({ erpJob: '', title: 'LEAD EXECUTIVE', branch: '' }, outlets)).toEqual({ role: 'cs', outlets: [] })
    expect(defaultsFor({ erpJob: 'Outlet manager', title: '', branch: 'Kelana Jaya' }, outlets)).toEqual({ role: 'outlet', outlets: ['kj'] })
    expect(defaultsFor({ erpJob: 'Sales', title: '', branch: 'Penang' }, outlets)).toEqual({ role: 'outlet', outlets: [] })
  })
  it('a row says why it stopped, else the outlets, else the role', () => {
    expect(subLine(m({ why: 'erp' }), outlets)).toBe('Inactive in ERP · access stopped')
    expect(subLine(m({ outlets: ['tm', 'kj'] }), outlets)).toBe('Carress Taman Maluri, 2990s Kelana Jaya')
    expect(subLine(m({}), outlets)).toBe('No outlet yet')
    expect(subLine(m({ role: 'cs' }), outlets)).toBe('Customer service')
    expect(subLine(m({ why: 'ended', to: '2026-11-16' }), outlets)).toBe('Access ended 16 Nov')
    expect([stopped(m({ why: 'not_yet' })), stopped(m({ why: 'people' }))]).toEqual([false, true])
    expect(shortDay('2026-01-05')).toBe('5 Jan')
  })
  it('the pick list puts who may be added first, and says why the rest may not', () => {
    const rows = pickRows({
      people: [
        { staffId: 'a', code: 'HV1', name: 'Added One', email: '', title: 'Sales', erpCode: '', erpJob: '', branch: '', active: true, erpInactive: false, hasLogin: true, added: true },
        { staffId: 'b', code: 'HV2', name: 'Free Two', email: '', title: '', erpCode: 'S-1', erpJob: 'Sales', branch: 'Johor', active: true, erpInactive: false, hasLogin: true, added: false },
      ],
      erpOnly: [{ code: 'S-9', name: 'Only Erp', email: '', job: 'Sales', branch: 'Johor', active: true }], erpAt: null,
    }, '')
    expect(rows.map(r => [r.name, r.tag])).toEqual([['Free Two', ''], ['Added One', 'Added'], ['Only Erp', 'Not in People']])
    expect(rows[0].sub).toBe('S-1 · Sales · Johor')
    expect(pickRows({ people: [], erpOnly: [{ code: 'S-9', name: 'Only Erp', email: '', job: '', branch: 'Johor', active: true }], erpAt: null }, 'johor')).toHaveLength(1)
  })
})
