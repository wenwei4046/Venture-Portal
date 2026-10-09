import { describe, expect, it } from 'vitest'
import { canFrom, canFromRole, crmDataFromRows, type CrmDataRows } from './crm-data'
import { navVM } from '@/components/member/crm/panel/vm/nav'
import type { PanelCtx } from '@/components/member/crm/panel/vm/common'

// The CRM asks the permission matrix (2026-10-10, mig 20261010030000): the
// screens follow crm_my_can(); the database refuses the rest anyway.
describe('what the CRM lets the signed-in person do', () => {
  it('takes the database’s four answers as they are', () => {
    expect(canFrom({ viewAll: true, editOwn: true, editAll: false, manage: false }, 'rs'))
      .toEqual({ viewAll: true, editOwn: true, editAll: false, manage: false })
    // Anything but true is no.
    expect(canFrom({ viewAll: 'yes', editOwn: 1, manage: null }, 'hod')).toEqual({ viewAll: false, editOwn: false, editAll: false, manage: false })
  })

  it('without an answer (a page open across the release), reads it off the CRM role as before', () => {
    expect(canFrom(null, 'boss')).toEqual({ viewAll: true, editOwn: true, editAll: true, manage: true })
    expect(canFrom(undefined, 'hod')).toEqual({ viewAll: true, editOwn: true, editAll: true, manage: true })
    expect(canFromRole('rs')).toEqual({ viewAll: false, editOwn: true, editAll: false, manage: false })
    expect(canFromRole(null)).toEqual({ viewAll: false, editOwn: false, editAll: false, manage: false })
  })

  it('rides on the CRM’s data', () => {
    const rows = {
      people: { me: 's1', role: 'tl', people: [{ id: 's1', name: 'Tan', role: 'tl', uplineId: null, fullTime: false }] },
      can: { viewAll: true, editOwn: true, editAll: false, manage: false },
      contacts: [], messages: [], visits: [], rooms: [], prefs: [], hides: [], labels: [], contactLabels: [], quickReplies: [],
      autoReplies: [], invites: [], shares: [], events: [], staffPrefs: [], adRules: [], ftRules: [],
    } as unknown as CrmDataRows
    expect(crmDataFromRows(rows).can).toEqual({ viewAll: true, editOwn: true, editAll: false, manage: false })
  })
})

describe('the Control panel’s bottom bar', () => {
  const ctx = (manage: boolean) => ({
    ui: { tab: 'overview' }, set: () => undefined, now: new Date('2026-10-10T10:00:00+08:00'),
    data: { can: { viewAll: true, editOwn: true, editAll: true, manage }, customers: [], visits: [] },
  }) as unknown as PanelCtx

  it('offers Assignment only with CRM · Manage', () => {
    expect(navVM(ctx(true)).nav.map(n => n.label)).toEqual(['Insight', 'Inbox', 'Assignment', 'Calendar', 'Profile'])
    expect(navVM(ctx(false)).nav.map(n => n.label)).toEqual(['Insight', 'Inbox', 'Calendar', 'Profile'])
  })
})
