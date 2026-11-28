import type { LeadOutlet } from '@/lib/leads/outlets'
import type { LeadBrand, LeadConfig, LeadContact, LeadLabel, LeadMessage, LeadThread } from '@/lib/leads/types'

/**
 * The handoff's own sample (LeadPhone.dc.html › seed(): eight customers, their messages) as Lead View's data, around a
 * day `today` (YYYY-MM-DD, the office's) — for the local preview and the tests. Times are the office's (UTC+8).
 */
export function leadSample(today: string): { config: LeadConfig; contacts: LeadContact[]; threads: Record<string, LeadThread>; outlets: LeadOutlet[]; labels: LeadLabel[] } {
  const day = (back: number) => new Date(Date.parse(today + 'T00:00:00Z') - back * 864e5).toISOString().slice(0, 10)
  const at = (back: number, hm: string) => new Date(`${day(back)}T${hm}:00+08:00`).toISOString()
  const brand = (id: string, name: string, sortOrder: number): LeadBrand => ({ id, name, tone: 'clay', fbPageId: null, igAccountId: null, handoffMode: 'pick', sortOrder, sales: [] })
  const brands = [brand('b-2990', '2990s', 1), brand('b-mini', '2990s mini', 2), brand('b-carress', 'Carress', 3)]
  const outlets: LeadOutlet[] = [
    { id: 'o-kj', brandId: 'b-2990', name: '2990s Kelana Jaya' }, { id: 'o-pj', brandId: 'b-2990', name: '2990s Petaling Jaya' },
    { id: 'o-pg', brandId: 'b-2990', name: 'PWCC Penang' }, { id: 'o-tm', brandId: 'b-carress', name: 'Carress Taman Maluri' },
    { id: 'o-jb', brandId: 'b-carress', name: 'Carress Johor' },
  ]
  const labels: LeadLabel[] = [{ id: 'l-hot', name: 'Hot lead', tone: 'red', used: 1 }, { id: 'l-vip', name: 'VIP', tone: 'clay', used: 1 }]
  let n = 0
  const msg = (inbound: boolean, body: string, when: string, by = ''): LeadMessage => ({
    id: ++n, direction: inbound ? 'in' : 'out', sender: inbound ? 'customer' : by ? 'flow' : 'cs', byName: by, body, phoneFound: null, delivery: 'sent', at: when,
  })
  type Seed = Partial<LeadContact> & { id: string; msgs: LeadMessage[] }
  const seed: Seed[] = [
    { id: 'nh', brandId: 'b-2990', name: 'Nurul Huda', sourceAd: 'Raya sofa promo', phone: '0123384721', phoneState: 'detected', unread: 2, outletId: 'o-kj', outletBy: 'ad',
      interest: '3 seater sofa', preferredTime: day(-1), language: 'Malay', note: 'Wants to visit Saturday morning', createdAt: at(0, '08:31'),
      msgs: [msg(true, 'Hi, sofa 3 seater ni masih ada promo?', at(0, '08:31')), msg(false, 'Hi Nurul! Yes, the Raya promo runs until 30 Nov. Which outlet is nearest to you?', at(0, '08:31'), 'Welcome template'),
        msg(true, 'Kelana Jaya. Boleh call saya 012-338 4721', at(0, '08:47')), msg(true, 'Sabtu ni boleh datang tengok?', at(0, '08:48'))] },
    { id: 'lt', brandId: 'b-mini', name: 'Low Tze Yen', sourceAd: 'Chat with us', unread: 1, labels: [{ id: 'l-hot', name: 'Hot lead', tone: 'red' }],
      interest: '3 seater pushback', language: 'English', createdAt: at(0, '08:38'),
      msgs: [msg(true, 'Hi', at(0, '08:38')), msg(false, 'Hi there! Thanks for writing to 2990s mini. What are you looking for today?', at(0, '08:38'), 'Welcome template'),
        msg(true, 'How much for the 3 seater pushback?', at(0, '08:40'))] },
    { id: 'ar', brandId: 'b-carress', channel: 'instagram', name: 'Aisyah Rahman', sourceAd: 'Mattress ad', unread: 1, outletId: 'o-tm', outletBy: 'ad',
      interest: 'Queen mattress', language: 'English', createdAt: at(0, '07:58'),
      msgs: [msg(true, 'Is the queen mattress still RM 2,390?', at(0, '07:58')), msg(false, 'Yes, until 30 Nov, with free delivery in the Klang Valley.', at(0, '08:05')),
        msg(true, 'Ok thanks, I will check with my husband', at(0, '08:12'))] },
    { id: 'jl', brandId: 'b-2990', name: 'Jason Lim', sourceAd: 'Year-end sale', phone: '0167742210', phoneState: 'confirmed', unread: 3, labels: [{ id: 'l-vip', name: 'VIP', tone: 'clay' }],
      outletId: 'o-pg', outletBy: 'ad', interest: 'L-shape sofa', language: 'English', note: 'Sent a photo of his living room', createdAt: at(1, '05:40'),
      msgs: [msg(true, 'Can this fit my living room?', at(1, '05:40')), msg(true, 'Photo', at(1, '05:41')), msg(true, 'My number 016-774 2210', at(1, '05:48'))] },
    { id: 'sk', brandId: 'b-carress', channel: 'instagram', name: 'Siti Khadijah', phone: '0198704416', phoneState: 'confirmed', unread: 0, outletId: 'o-tm', outletBy: 'ad',
      interest: 'King mattress', language: 'Malay', createdAt: at(1, '17:02'),
      msgs: [msg(true, 'Showroom buka sampai pukul berapa?', at(1, '17:02')), msg(false, 'Our showroom opens 10am–10pm daily', at(1, '17:05'))] },
    { id: 'mw', brandId: 'b-2990', name: 'Michelle Wong', phone: '0162219085', phoneState: 'confirmed', unread: 0, handedAt: at(2, '11:24'), outletId: 'o-pj', outletBy: 'ad',
      interest: '2 seater sofa', language: 'English', createdAt: at(2, '11:20'),
      msgs: [msg(true, 'Please ask sales to call me, 016-221 9085', at(2, '11:20')), msg(false, 'Passed your number to our sales team', at(2, '11:24'))] },
    { id: 'dt', brandId: 'b-2990', name: 'Daniel Tan', sourceAd: 'Year-end sale', phone: '0174550312', phoneState: 'confirmed', unread: 0, handedAt: at(2, '09:14'), apptAt: at(2, '09:20'),
      outletId: 'o-pg', outletBy: 'ad', interest: 'Recliner', preferredTime: day(-2), language: 'English', createdAt: at(2, '09:10'),
      msgs: [msg(true, 'Is delivery to Penang free?', at(2, '09:10')), msg(false, 'Yes, free delivery within Penang island.', at(2, '09:14'))] },
    { id: 'fa', brandId: 'b-carress', channel: 'instagram', name: 'Farah Aziz', phone: '01123456678', phoneState: 'confirmed', unread: 0, handedAt: at(3, '14:06'), closedAt: at(3, '14:10'),
      outletId: 'o-jb', outletBy: 'ad', interest: 'Queen mattress', language: 'Malay', createdAt: at(3, '14:02'),
      msgs: [msg(true, 'Terima kasih, dah beli semalam', at(3, '14:02')), msg(false, 'Thank you, see you then', at(3, '14:06'))] },
  ]
  const threads: Record<string, LeadThread> = {}
  const contacts = seed.map(({ msgs, ...o }) => {
    const last = msgs[msgs.length - 1]
    const c: LeadContact = {
      brandId: 'b-2990', channel: 'messenger', isTest: false, name: '', sourceAd: '', phone: null, phoneState: 'none', phoneAt: null, interest: '', budget: '', showroom: '',
      preferredTime: '', note: '', handedSalesId: null, handedSalesName: null, handedAt: null, handedByName: null, appt: 'unknown', shown: 'unknown',
      lastAt: last.at, lastDir: last.direction, lastText: last.body, createdAt: msgs[0].at, labels: [], ...o,
    }
    threads[c.id] = { contact: c, messages: msgs, events: [] }
    return c
  })
  return { config: { today, brands, waiting: 4, unhanded: 2 }, contacts, threads, outlets, labels }
}
