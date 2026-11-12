import { describe, expect, it } from 'vitest'
import { crmDataFromRows, type CrmDataRows } from './crm-data'

// View as reaches the CRM's cross-team viewers (2026-11-12, mig 20261112010000 — the owner: "不能view as" Josiah and
// Wei Jie, Marketing's managers given CRM · View): crm_people() hands them apart from `people`, with their own cells.
const rows = (viewers?: unknown) => ({
  people: { me: 's1', role: 'boss', people: [{ id: 's1', name: 'BOSS', role: 'boss', uplineId: null, fullTime: false }], ...(viewers === undefined ? {} : { viewers }) },
  can: { viewAll: true, editOwn: true, editAll: true, manage: true },
  contacts: [], messages: [], visits: [], rooms: [], prefs: [], hides: [], labels: [], contactLabels: [], quickReplies: [],
  autoReplies: [], invites: [], shares: [], events: [], staffPrefs: [], adRules: [], ftRules: [],
}) as unknown as CrmDataRows

describe('the CRM’s cross-team viewers', () => {
  it('reads each with their own cells, never in people', () => {
    const d = crmDataFromRows(rows([
      { id: 'j', name: 'SIA JOSIAH', title: 'MARKETING MANAGER', reach: 'all', editOwn: false, editAll: false, manage: false },
      { id: 'w', name: 'KHO WEI JIE', title: null, reach: 'own', editOwn: true },
    ]))
    expect(d.viewers?.map(v => v.id)).toEqual(['j', 'w'])
    expect(d.viewers?.[0]).toMatchObject({ title: 'MARKETING MANAGER', can: { viewAll: true, editOwn: false, editAll: false, manage: false } })
    expect(d.viewers?.[1]).toMatchObject({ title: '', can: { viewAll: false, editOwn: true, editAll: false, manage: false } })
    expect(d.people.map(p => p.id)).toEqual(['s1'])
  })

  it('is none from a database before the migration', () => {
    expect(crmDataFromRows(rows()).viewers).toEqual([])
  })
})

describe('who reads the ads’ figures', () => {
  it('is CRM · Manage, or View at All read-only', async () => {
    const { readsAds } = await import('./crm-data')
    expect(readsAds({ viewAll: true, editOwn: false, editAll: false, manage: false })).toBe(true)
    expect(readsAds({ viewAll: false, editOwn: true, editAll: false, manage: true })).toBe(true)
    expect(readsAds({ viewAll: false, editOwn: true, editAll: false, manage: false })).toBe(false)
  })
})
