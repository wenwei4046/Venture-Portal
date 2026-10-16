import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
// The server's public key, as a pair with the test's private key below (RFC 8291's example pair).
vi.mock('./config', () => ({
  VAPID_PUBLIC_KEY: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  VAPID_SUBJECT: 'https://venture.example',
}))
import { flushPush, outboxSecret, pushMessageOf } from './outbox'
import { crmPushFromRow, noticeTag, noticeUrl, noticesFromRow, openTarget } from './notices'

// RFC 8291's example keys stand in for the server's (any valid P-256 pair will do).
const PRIVATE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'
const DEVICE = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' }

afterEach(() => {
  delete process.env.VAPID_PRIVATE_KEY
})

describe('the outbox’s secret', () => {
  it('is the HMAC of the private key the key generator wrote the hash of', async () => {
    expect(await outboxSecret(PRIVATE)).toBe(createHmac('sha256', Buffer.from(PRIVATE, 'base64url')).update('push-outbox').digest('base64url'))
  })
})

function fakeDb(due: unknown[]) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  let served = false
  return {
    calls,
    client: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        if (fn === 'push_outbox_take') {
          const data = served ? [] : due
          served = true
          return { data, error: null }
        }
        return { data: null, error: null }
      },
    },
  }
}

describe('pushing what is due', () => {
  it('does nothing without the private key', async () => {
    const db = fakeDb([])
    expect(await flushPush({ client: db.client as never })).toBeNull()
    expect(db.calls).toEqual([])
  })

  it('sends each notice to each device, opens it in that device’s app, and says what happened', async () => {
    process.env.VAPID_PRIVATE_KEY = PRIVATE
    const db = fakeDb([
      { id: 'n1', title: 'Grace Lim booked a room for you', body: 'Interview · Meeting Room 1', refKind: 'booking', refId: 'b1',
        subs: [{ endpoint: 'https://fcm.googleapis.com/a', ...DEVICE, app: 'revenue' }, { endpoint: 'https://web.push.apple.com/b', ...DEVICE, app: 'hr' }] },
      { id: 'n2', title: 'New claim · Kar Jun', body: 'Travel', refKind: 'member_request', refId: 'r9',
        subs: [{ endpoint: 'https://fcm.googleapis.com/gone', ...DEVICE, app: 'hr' }] },
      { id: 'n3', title: 'Later', body: '', refKind: 'hiring_request', refId: 'HR-301',
        subs: [{ endpoint: 'https://fcm.googleapis.com/busy', ...DEVICE, app: 'hr' }] },
    ])
    const sentTo: string[] = []
    const fetcher = vi.fn(async (url: string) => {
      sentTo.push(url)
      return new Response(null, { status: url.endsWith('/gone') ? 410 : url.endsWith('/busy') ? 429 : 201 })
    })
    expect(await flushPush({ client: db.client as never, fetcher: fetcher as never })).toEqual({ sent: 2, gone: 1 })
    expect(sentTo.sort()).toEqual(['https://fcm.googleapis.com/a', 'https://fcm.googleapis.com/busy', 'https://fcm.googleapis.com/gone', 'https://web.push.apple.com/b'])
    const done = db.calls.find(c => c.fn === 'push_outbox_done')!
    expect(done.args.p_secret).toBe(await outboxSecret(PRIVATE))
    expect((done.args.p_sent as string[]).sort()).toEqual(['n1', 'n2'])
    expect(done.args.p_gone).toEqual(['https://fcm.googleapis.com/gone'])
  })

  // 2026-10-16: the user's iPhone got nothing, and nothing said what Apple answered — the notice counted as sent
  // because the Android took it. A push service's refusal is said in the server's log, by host and its own words.
  it('says what a push service refused, even when another device took the notice', async () => {
    process.env.VAPID_PRIVATE_KEY = PRIVATE
    const db = fakeDb([
      { id: 'n1', title: 'Principal added you to a meeting', body: '', refKind: 'booking', refId: 'b1',
        subs: [{ endpoint: 'https://fcm.googleapis.com/a', ...DEVICE, app: 'hr' }, { endpoint: 'https://web.push.apple.com/secret-token', ...DEVICE, app: 'hr' }] },
    ])
    const fetcher = vi.fn(async (url: string) => url.includes('apple')
      ? new Response('{"reason":"BadJwtToken"}', { status: 403 })
      : new Response(null, { status: 201 }))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await flushPush({ client: db.client as never, fetcher: fetcher as never })).toEqual({ sent: 1, gone: 0 })
    expect(log).toHaveBeenCalledWith('[push] refused', JSON.stringify({ host: 'web.push.apple.com', status: 403, reason: '{"reason":"BadJwtToken"}' }))
    // The host only — never the device's own address.
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token')
    log.mockRestore()
  })

  it('never throws into the work that called it', async () => {
    process.env.VAPID_PRIVATE_KEY = PRIVATE
    const client = { rpc: async () => { throw new Error('network') } }
    expect(await flushPush({ client: client as never })).toBeNull()
  })
})

describe('a notice', () => {
  it('opens where the phone’s app shows it', () => {
    expect(noticeUrl({ refKind: 'booking', refId: 'b1' }, 'hr')).toBe('/hr-app?open=booking:b1')
    expect(noticeUrl({ refKind: 'hiring_request', refId: 'HR-301' }, 'hr')).toBe('/hr-app?open=hire:HR-301')
    expect(noticeUrl({ refKind: 'member_request', refId: 'r9' }, 'hr')).toBe('/hr-app?open=req:r9')
    expect(noticeUrl({ refKind: 'booking', refId: 'b1' }, 'revenue')).toBe('/member?page=account&view=rooms')
    expect(noticeUrl({ refKind: 'hiring_request', refId: 'HR-301' }, 'revenue')).toBe('/member?bell=1')
    // A memo names its page as well (2026-10-17): the app's first drawing is Profile › Memos with the memo, not Today.
    expect(noticeUrl({ refKind: 'memo', refId: 'm 1' }, 'revenue')).toBe('/member?page=account&view=memos&memo=m%201')
    expect(noticeUrl({ refKind: 'memo', refId: 'm1' }, 'hr')).toBe('/hr-app?open=memo:m1')
    // Today › Remind all (2026-10-15): the app's front page, either app.
    expect(noticeUrl({ refKind: 'att_today', refId: '2026-11-02' }, 'hr')).toBe('/hr-app')
    expect(noticeUrl({ refKind: 'att_today', refId: '2026-11-02' }, 'revenue')).toBe('/member')
    expect(openTarget('hire:HR-301')).toEqual({ k: 'hire', id: 'HR-301' })
    expect(openTarget('nope:1')).toBeNull()
  })

  it('reads the database’s answer, keeping only well-formed notices', () => {
    expect(noticesFromRow({ unread: 2, items: [
      { id: 'n1', kind: 'rooms', title: 'T', body: 'B', refKind: 'booking', refId: 'b1', at: '2026-10-11T03:00:00Z', read: false },
      { id: 'n2', kind: 'nonsense', title: 'T', refKind: 'booking', refId: 'b1' },
    ] })).toEqual({ unread: 2, items: [{ id: 'n1', kind: 'rooms', title: 'T', body: 'B', refKind: 'booking', refId: 'b1', at: '2026-10-11T03:00:00Z', read: false }] })
    expect(noticesFromRow(null)).toEqual({ unread: 0, items: [] })
  })
})

// The CRM tells a person's phone about their own chats (2026-10-14, mig 20261014030000): a customer's message, a new
// lead, a visit, a reminder, an invitation.
describe('a CRM notice', () => {
  const LEAD = {
    id: 'n9', kind: 'crm', title: 'New lead · Chrisss', body: '帅哥', refKind: 'crm_contact', refId: 'c1',
    data: { ch: 'whatsapp', name: 'Chrisss', line: 'New lead · 帅哥', at: '2026-10-14T00:08:00Z' },
  }

  it('goes at once — high urgency reaches a phone asleep — while the rest go as before', async () => {
    process.env.VAPID_PRIVATE_KEY = PRIVATE
    const db = fakeDb([
      { ...LEAD, subs: [{ endpoint: 'https://fcm.googleapis.com/crm', ...DEVICE, app: 'hr' }] },
      { id: 'n1', kind: 'rooms', title: 'Booked', body: '', refKind: 'booking', refId: 'b1', subs: [{ endpoint: 'https://fcm.googleapis.com/room', ...DEVICE, app: 'hr' }] },
    ])
    const urgency: Record<string, string> = {}
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      urgency[url] = (init.headers as Record<string, string>).Urgency
      return new Response(null, { status: 201 })
    })
    expect(await flushPush({ client: db.client as never, fetcher: fetcher as never })).toEqual({ sent: 2, gone: 0 })
    expect(urgency).toEqual({ 'https://fcm.googleapis.com/crm': 'high', 'https://fcm.googleapis.com/room': 'normal' })
  })

  it('opens the chat in the Revenue app whichever app the phone signed up in, gathered under the chat’s tag', () => {
    const due = { ...LEAD, refKind: 'crm_contact' as const, crm: crmPushFromRow(LEAD.data) }
    const message = { title: 'New lead · Chrisss', body: '帅哥', url: '/member?page=account&view=crm&chat=c1', tag: 'crm:c1', id: 'n9',
      crm: { ch: 'whatsapp', name: 'Chrisss', line: 'New lead · 帅哥', at: '2026-10-14T00:08:00Z' } }
    expect(pushMessageOf(due, 'hr')).toEqual(message)
    expect(pushMessageOf(due, 'revenue')).toEqual(message)
  })

  it('an invitation opens the CRM’s notifications, each under its own tag', () => {
    expect(noticeUrl({ refKind: 'crm_invite', refId: 'i1' }, 'revenue')).toBe('/member?page=account&view=crm&crm=notifs')
    expect(noticeUrl({ refKind: 'crm_invite', refId: 'i1' }, 'hr')).toBe('/member?page=account&view=crm&crm=notifs')
    expect(noticeTag({ id: 'n7', refKind: 'crm_invite', refId: 'i1' })).toBe('n7')
    expect(noticeTag({ id: 'n8', refKind: 'booking', refId: 'b1' })).toBe('n8')
  })

  it('keeps only a well-formed picture and line; the rest of the bells’ notices carry none', () => {
    expect(crmPushFromRow({ ch: 'telegram', name: 'Mei', line: 'Hi', at: 'x' })).toEqual({ ch: null, name: 'Mei', line: 'Hi', at: 'x' })
    expect(crmPushFromRow({ ch: 'messenger', line: 'no name' })).toBeNull()
    expect(crmPushFromRow(null)).toBeNull()
    expect(pushMessageOf({ id: 'n1', title: 'T', body: 'B', refKind: 'booking', refId: 'b1', crm: null }, 'hr')).toEqual({ title: 'T', body: 'B', url: '/hr-app?open=booking:b1', tag: 'n1', id: 'n1' })
  })
})
