import { describe, expect, it } from 'vitest'
import { crmDataFromRows, type CrmDataRows } from './crm-data'

// Whoever sees everybody's CRM reads everybody's auto-replies (mig 20261025010000), for View as — read only. One's own stays
// one's own, whatever order the rows come in.
const rows = (autoReplies: CrmDataRows['autoReplies']) => ({
  people: { me: 's1', role: 'boss', people: [{ id: 's1', name: 'Boss', role: 'boss', uplineId: null, fullTime: false }] },
  contacts: [], messages: [], visits: [], rooms: [], prefs: [], hides: [], labels: [], contactLabels: [], quickReplies: [],
  autoReplies, invites: [], shares: [], events: [], staffPrefs: [], adRules: [], ftRules: [],
}) as unknown as CrmDataRows
const set = (text: string) => ({ welcome: { on: true, text } })

describe('auto-replies of others', () => {
  it("keeps one's own as one's own and the others for View as", () => {
    const d = crmDataFromRows(rows([{ staff_id: 's2', settings: set('Anthony hi') }, { staff_id: 's1', settings: set('Mine') }]))
    expect(d.autoReplies.welcome.text).toBe('Mine')
    expect(d.autoRepliesOf?.s2.welcome.text).toBe('Anthony hi')
    expect(d.autoRepliesOf?.s1).toBeUndefined()
  })
  it("with no row of one's own, starts empty — never somebody else's", () => {
    const d = crmDataFromRows(rows([{ staff_id: 's2', settings: set('Anthony hi') }]))
    expect(d.autoReplies.welcome.text).toBe('')
  })
})
