import { describe, expect, it } from 'vitest'
import { crmDataFromRows, type CrmDataRows } from './crm-data'

// An ad's name (2026-10-16, mig 20261016120000; the owner: the chat showed Meta's headline "Chat with us" — "顯示廣告的
// 名稱，不然業務也看不懂"): a customer's `ad` reads the name the ad was given, Meta's headline stays in `adHeadline`, and an
// ad with no name keeps its headline.
const contact = (id: string, ad: string | null, headline: string | null) => ({
  id, channel: 'whatsapp', account_id: 'a', external_id: id, name: `C ${id}`, phone: null, ad_source_id: ad, ad_headline: headline,
  ad_source_url: null, ad_media: null, status: 'new', lost_reason: null, lost_note: null, previous_status: null, won_amount: null,
  assigned_to: null, assigned_at: null, assigned_by: null, team_id: null, held_reason: null, unread: 0, last_customer_at: null,
  created_at: '2026-10-16T00:00:00Z', last_message_at: null,
})
const rows = (adNames?: CrmDataRows['adNames']) => ({
  people: { me: 's1', role: 'boss', people: [{ id: 's1', name: 'Boss', role: 'boss', uplineId: null, fullTime: false }] },
  contacts: [contact('k1', '1201', 'Chat with us'), contact('k2', '1202', 'Chat with us'), contact('k3', null, null)],
  messages: [], visits: [], rooms: [], prefs: [], hides: [], labels: [], contactLabels: [], quickReplies: [],
  autoReplies: [], invites: [], shares: [], events: [], staffPrefs: [], adRules: [], ftRules: [], adNames,
}) as unknown as CrmDataRows

describe('ad names', () => {
  it('a named ad shows its name; the headline is kept', () => {
    const d = crmDataFromRows(rows([{ ad_source_id: '1201', name: 'Oct Fair · Mattress video', source: 'manual' }]))
    const [k1, k2, k3] = d.customers
    expect(k1.ad).toBe('Oct Fair · Mattress video')
    expect(k1.adHeadline).toBe('Chat with us')
    expect(k2.ad).toBe('Chat with us')
    expect(k3.ad).toBe('WhatsApp · no ad')
    expect(d.adNames).toEqual({ '1201': { name: 'Oct Fair · Mattress video', source: 'manual' } })
  })
  it('before the table exists, every ad keeps its headline', () => {
    const d = crmDataFromRows(rows())
    expect(d.customers.map(c => c.ad)).toEqual(['Chat with us', 'Chat with us', 'WhatsApp · no ad'])
    expect(d.adNames).toEqual({})
  })
})
