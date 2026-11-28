import { describe, expect, it } from 'vitest'
import type { LeadContact, LeadMessage } from '@/lib/leads/types'
import {
  brandPills, chatSub, dayPill, firstContact, firstName, inboxBadge, inboxChips, infoRows, initials, leadRowOf, matchesLead, matchesQuery,
  previewText, rowOf, rowWhen, sentBy, stageChips, stateOf, stripOf, unreadOf, waitText, wallOf, type SeenState,
} from './vm'

// The Lead View phone app's view models, held to the prototype's own cases (LeadPhone.dc.html › seed / renderVals).

const NOW = new Date('2026-11-27T01:05:00Z') // Fri 27 Nov 09:05 in the office
const none: SeenState = { readAt: {}, marks: new Set() }

function contact(o: Partial<LeadContact> = {}): LeadContact {
  return {
    id: 'c1', brandId: 'b1', channel: 'messenger', isTest: false, name: 'Nurul Huda', sourceAd: 'Raya sofa promo', phone: null, phoneState: 'none',
    phoneAt: null, interest: '', budget: '', showroom: '', preferredTime: '', note: '', handedSalesId: null, handedSalesName: null, handedAt: null,
    handedByName: null, appt: 'unknown', shown: 'unknown', lastAt: '2026-11-27T00:48:00Z', lastDir: 'in', lastText: 'Sabtu ni boleh datang tengok?',
    createdAt: '2026-11-27T00:31:00Z', unread: 2, ...o,
  }
}

describe('names and days', () => {
  it('takes two letters, from two words or one', () => {
    expect(initials('Nurul Huda')).toBe('NH')
    expect(initials('Low Tze Yen')).toBe('LT')
    expect(initials('kaiyee')).toBe('KA')
    expect(initials('桂红陈')).toBe('桂红')
    expect(initials('  ')).toBe('?')
    expect(firstName('Nurul Huda')).toBe('Nurul')
  })
  it('says when as a chat list does: the time today, Yesterday, a weekday, else the date', () => {
    expect(rowWhen('2026-11-27T00:48:00Z', NOW)).toBe('08:48')
    expect(rowWhen('2026-11-26T09:00:00Z', NOW)).toBe('Yesterday')
    expect(rowWhen('2026-11-25T03:00:00Z', NOW)).toBe('Wed')
    expect(rowWhen('2026-11-10T03:00:00Z', NOW)).toBe('10 Nov')
    expect(rowWhen('2025-12-10T03:00:00Z', NOW)).toBe('10 Dec 2025')
    // 23:30 on the 26th in the office is still "Yesterday", though it is the 26th in UTC too.
    expect(rowWhen('2026-11-26T15:30:00Z', NOW)).toBe('Yesterday')
    expect(dayPill('2026-11-27T00:48:00Z', NOW)).toBe('Today')
    expect(dayPill('2026-11-26T09:00:00Z', NOW)).toBe('Yesterday')
    expect(firstContact('2026-11-27T00:31:00Z', NOW)).toBe('First contact today')
    expect(firstContact('2026-11-24T00:31:00Z', NOW)).toBe('First contact 24 Nov')
  })
  it('writes a wait as the prototype: minutes, hours and minutes, days and hours', () => {
    expect(waitText(17)).toBe('17 m')
    expect(waitText(65)).toBe('1 h 05 m')
    expect(waitText(1620)).toBe('1 d 3 h')
  })
  it('names a file by its kind, never its placeholder', () => {
    expect(previewText('[Photo]')).toBe('Photo')
    expect(previewText('[File] plan.pdf')).toBe('plan.pdf')
    expect(previewText('Hi,\n  is it  still on?')).toBe('Hi, is it still on?')
  })
})

describe('the Inbox', () => {
  it('reads a mark as at least 1, and a chat read here since its last message as 0', () => {
    const c = contact({ unread: 0 })
    expect(unreadOf(c, { readAt: {}, marks: new Set(['c1']) })).toBe(1)
    expect(unreadOf(contact(), { readAt: { c1: '2026-11-27T00:48:00Z' }, marks: new Set() })).toBe(0)
    expect(stateOf(contact(), none)).toBe('waiting')
    expect(stateOf(contact({ unread: 0 }), none)).toBe('answered')
    expect(stateOf(contact({ handedAt: '2026-11-26T00:00:00Z' }), none)).toBe('handed')
  })
  it('draws a waiting row with its wait, its ad and the phone on file', () => {
    const r = rowOf(contact({ phone: '0123384721', phoneState: 'detected', labels: [{ id: 'l1', name: 'Hot lead', tone: 'red' }] }), '2990s', none, NOW)
    expect(r).toMatchObject({ ini: 'NH', nameW: 600, wait: { text: '17 m', long: false }, ad: '2990s · Raya sofa promo', phone: '012-338 4721', unread: '2', whenHot: true, tag: { name: 'Hot lead', tone: 'red' } })
    expect(rowOf(contact({ lastAt: '2026-11-26T23:58:00Z' }), '2990s', none, NOW).wait).toEqual({ text: '1 h 07 m', long: true })
  })
  it('shows the time, not a wait, once answered — "You:" before our own last words', () => {
    const r = rowOf(contact({ unread: 0, lastDir: 'out', lastText: '[Photo]', sourceAd: '', adName: '' }), 'Carress', none, NOW)
    expect(r).toMatchObject({ wait: null, when: '08:48', whenHot: false, nameW: 500, ad: 'Carress · Organic', preview: 'You: Photo', unread: null, phone: null })
  })
  it('counts the chips over the brand picked, the labels in Customer Service’s order, Waiting first', () => {
    const pool = [
      contact(),
      contact({ id: 'c2', unread: 0, labels: [{ id: 'vip', name: 'VIP', tone: 'clay' }] }),
      contact({ id: 'c3', handedAt: '2026-11-26T00:00:00Z', labels: [{ id: 'hot', name: 'Hot lead', tone: 'red' }] }),
    ]
    const labels = [{ id: 'hot', name: 'Hot lead', tone: 'red' as const, used: 1 }, { id: 'vip', name: 'VIP', tone: 'clay' as const, used: 1 }, { id: 'x', name: 'Lost', tone: 'grey' as const, used: 0 }]
    const chips = inboxChips(pool, labels, 'waiting', none)
    expect(chips.map(c => `${c.label} ${c.n}`)).toEqual(['Waiting 1', 'Answered 1', 'Handed 1', 'All 3', 'Hot lead 1', 'VIP 1'])
    expect(chips[0]).toMatchObject({ on: true, hot: true })
  })
  it('finds a chat by name, phone (with or without its dash), words or ad', () => {
    const c = contact({ phone: '0123384721' })
    expect(matchesQuery(c, 'nurul')).toBe(true)
    expect(matchesQuery(c, '012-338')).toBe(true)
    expect(matchesQuery(c, '3384721')).toBe(true)
    expect(matchesQuery(c, 'sabtu')).toBe(true)
    expect(matchesQuery(c, 'raya')).toBe(true)
    expect(matchesQuery(c, 'zzz')).toBe(false)
  })
  it('badges the Inbox tab with every unread message, blocked chats aside; brands count every chat', () => {
    const cs = [contact(), contact({ id: 'c2', unread: 3, brandId: 'b2' }), contact({ id: 'c3', unread: 9, blockedAt: '2026-11-20T00:00:00Z' })]
    expect(inboxBadge(cs, none)).toBe('5')
    expect(inboxBadge([contact({ unread: 0 })], none)).toBeNull()
    const brands = [{ id: 'b1', name: '2990s' }, { id: 'b2', name: 'Carress' }] as unknown as Parameters<typeof brandPills>[1]
    expect(brandPills(cs, brands)).toEqual([{ id: 'all', label: 'All brands', n: 2 }, { id: 'b1', label: '2990s', n: 1 }, { id: 'b2', label: 'Carress', n: 1 }])
  })
})

describe('a chat', () => {
  it('draws the phone strip in its four states, the actions only for whoever may edit', () => {
    expect(stripOf(contact({ phone: '0123384721', phoneState: 'detected' }), '2990s', true)).toEqual({ tone: 'rust', text: 'Phone found · 012-338 4721', confirm: true, hand: false })
    expect(stripOf(contact({ phone: '0123384721', phoneState: 'detected' }), '2990s', false).confirm).toBe(false)
    expect(stripOf(contact({ phone: '0167742210', phoneState: 'confirmed' }), '2990s', true)).toEqual({ tone: 'green', text: 'Phone confirmed · 016-774 2210', confirm: false, hand: true })
    expect(stripOf(contact(), '2990s', true)).toEqual({ tone: 'grey', text: 'No phone yet · ask for the number', confirm: false, hand: false })
    expect(stripOf(contact({ phone: '0172210000', phoneState: 'confirmed', handedAt: '2026-11-25T00:00:00Z', apptAt: '2026-11-26T00:00:00Z' }), '2990s', true).text)
      .toBe('Handed to 2990s sales · Appointment')
  })
  it('names the brand, the ad and the channel under the name', () => {
    expect(chatSub(contact({ channel: 'instagram', sourceAd: '' }), 'Carress')).toBe('Carress · Organic · Instagram')
  })
  it('says who sent an automatic reply, never Customer Service', () => {
    expect(sentBy({ sender: 'flow', byName: 'Welcome' })).toBe('Sent by Welcome ·')
    expect(sentBy({ sender: 'ai', byName: 'Aira' })).toBe('Sent by AI Agent ·')
    expect(sentBy({ sender: 'page', byName: '' })).toBe('Sent by Business Suite ·')
    expect(sentBy({ sender: 'cs', byName: 'Kai Yee' })).toBe('')
  })
  it('lays the wall out by day, Meta’s notes as lines, a file without its label, the quote it answers', () => {
    const m = (o: Partial<LeadMessage>): LeadMessage => ({ id: 1, direction: 'in', sender: 'customer', byName: '', body: '', phoneFound: null, delivery: 'sent', at: '2026-11-26T09:00:00Z', ...o })
    const wall = wallOf([
      m({ id: 1, body: 'Hi', mid: 'm1' }),
      m({ id: 2, direction: 'out', sender: 'page', body: 'Nurul replied to an ad.', at: '2026-11-27T00:30:00Z' }),
      m({ id: 3, direction: 'out', sender: 'cs', byName: 'KY', body: '[Photo]', mediaPath: 'chat/x/a.jpg', mediaMime: 'image/jpeg', at: '2026-11-27T00:31:00Z', replyToMid: 'm1' }),
    ], contact({ readAt: '2026-11-27T00:40:00Z' }), NOW, [{ id: -1, body: 'On my way', at: '2026-11-27T01:00:00Z' }])
    expect(wall.map(w => w.type)).toEqual(['day', 'bubble', 'day', 'note', 'bubble', 'bubble'])
    expect(wall[0]).toMatchObject({ label: 'Yesterday' })
    expect(wall[3]).toMatchObject({ text: 'Nurul replied to an ad', at: '08:30' })
    expect(wall[4]).toMatchObject({ mine: true, text: '', media: { kind: 'image', path: 'chat/x/a.jpg' }, quote: { who: 'Customer', text: 'Hi' }, receipt: 'read', by: '' })
    expect(wall[5]).toMatchObject({ pending: true, text: 'On my way', at: '09:00' })
  })
})

describe('customer info', () => {
  it('lists the prototype’s fields with Budget and Special request kept, empty ones as a dash', () => {
    const rows = infoRows(contact({ phone: '0123384721', phoneState: 'detected', interest: '3 seater sofa', outletId: 'o1', outletBy: 'ad', preferredTime: '2026-11-28', language: 'Malay' }), [{ id: 'o1', brandId: 'b1', name: '2990s Kelana Jaya' }])
    expect(rows.map(r => r.k)).toEqual(['Phone', 'Outlet', 'Interest', 'Budget', 'Showroom', 'Visit', 'Language', 'Special request', 'Note'])
    expect(rows[0]).toEqual({ k: 'Phone', v: '012-338 4721', empty: false, sub: 'found in the chat' })
    expect(rows[1]).toEqual({ k: 'Outlet', v: '2990s Kelana Jaya', empty: false, sub: 'from the ad' })
    expect(rows[3]).toEqual({ k: 'Budget', v: '—', empty: true, sub: '' })
    expect(rows[5].v).toBe('Sat 28 Nov')
  })
})

describe('Leads', () => {
  it('names a lead’s stage, its phone or "No phone yet", and where it came from', () => {
    const r = leadRowOf(contact({ phone: '0167742210', phoneState: 'confirmed', handedAt: '2026-11-25T00:00:00Z', apptAt: '2026-11-26T00:00:00Z', outletId: 'o1' }), '2990s', [{ id: 'o1', brandId: 'b1', name: 'PWCC Penang' }])
    expect(r).toMatchObject({ stage: 'appt', stageLabel: 'Appointment', phone: '016-774 2210', noPhone: false, src: '2990s · PWCC Penang · Raya sofa promo' })
    expect(leadRowOf(contact(), 'Carress', [])).toMatchObject({ stage: 'nophone', stageLabel: 'No phone yet', phone: 'No phone yet', noPhone: true })
  })
  it('counts every stage, Not handed yet in rust', () => {
    const chips = stageChips([contact(), contact({ id: 'c2', phone: '0123384721', phoneState: 'detected' })], 'all')
    expect(chips.map(c => `${c.label} ${c.n}`)).toEqual(['All 2', 'No phone yet 1', 'Not handed yet 1', 'Handed 0', 'Contacted 0', 'Appointment 0', 'Came 0', 'Closed 0', 'Lost 0'])
    expect(chips.find(c => c.id === 'new')?.hot).toBe(true)
  })
  it('finds a lead by name or phone', () => {
    expect(matchesLead(contact({ phone: '0123384721' }), 'huda')).toBe(true)
    expect(matchesLead(contact({ phone: '0123384721' }), '338 4721')).toBe(true)
    expect(matchesLead(contact({ phone: '0123384721' }), 'sofa')).toBe(false)
  })
})
