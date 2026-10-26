import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterHours, autoReplyTexts, inAway, sendAutoReplies } from './crm-auto-reply'

// Auto-replies, sent (2026-10-19, mig 20261019120000): the chat's person's welcome / after hours / keywords, on the
// office's clock, each claimed once in the database before it goes from the number the customer wrote to.
const set = {
  welcome: { on: true, text: 'Hi! Thanks for contacting The Conts 😊' },
  after: { on: true, from: '09:00', to: '18:00', text: 'We are closed now, we will reply at 9am.' },
  kws: [
    { id: 'p', on: true, words: '价钱, price, harga', text: 'Prices depend on the unit size.' },
    { id: 'x', on: false, words: 'where', text: 'Off' },
  ],
}
const kl = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00+08:00`).toISOString()

describe('which auto-replies a message triggers', () => {
  it('reads the hours on the office clock, an overnight window too', () => {
    expect(afterHours(new Date(kl('08:59')), '09:00', '18:00')).toBe(true)
    expect(afterHours(new Date(kl('09:00')), '09:00', '18:00')).toBe(false)
    expect(afterHours(new Date(kl('18:00')), '09:00', '18:00')).toBe(true)
    expect(afterHours(new Date(kl('23:00')), '20:00', '08:00')).toBe(false)
    expect(afterHours(new Date(kl('12:00')), '20:00', '08:00')).toBe(true)
  })

  it('welcome on the first message only, after hours outside the hours, keywords that appear, in that order', () => {
    expect(autoReplyTexts(set, { body: 'Hi, 价钱多少?', sentAt: kl('20:30'), first: true }))
      .toEqual([set.welcome.text, set.after.text, set.kws[0].text])
    expect(autoReplyTexts(set, { body: 'ok', sentAt: kl('10:00'), first: false })).toEqual([])
    expect(autoReplyTexts(set, { body: 'where are you', sentAt: kl('10:00'), first: false })).toEqual([])
  })

  it('nothing switched on, nothing written, no settings: nothing', () => {
    expect(autoReplyTexts({ welcome: { on: false, text: 'x' }, after: { on: false, text: 'y', from: '09:00', to: '18:00' }, kws: [] }, { body: 'price', sentAt: kl('22:00'), first: true })).toEqual([])
    expect(autoReplyTexts({ welcome: { on: true, text: '  ' } }, { body: '', sentAt: kl('10:00'), first: true })).toEqual([])
    expect(autoReplyTexts(null, { body: 'price', sentAt: kl('10:00'), first: true })).toEqual([])
  })
})

describe('sending them', () => {
  const due = [{ message_id: 'm1', contact_id: 'c1', account_id: '1438056256053876', customer: '60123456789', body: 'price?', sent_at: kl('10:00'), first: true, settings: set }]
  const db = (claim: (body: string) => string | null) => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args])
      if (fn === 'crm_auto_reply_due') return { data: due, error: null }
      if (fn === 'crm_auto_reply_claim') return { data: claim(args.p_body as string), error: null }
      return { data: null, error: null }
    })
    return { client: { rpc } as unknown as SupabaseClient, calls }
  }
  const wa = (ok: boolean) => vi.fn(async () => ok
    ? new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 })
    : new Response(JSON.stringify({ error: { code: 131047 } }), { status: 400 })) as unknown as typeof fetch

  it('claims each reply, sends it from the number the customer wrote to, and keeps Meta’s id', async () => {
    const d = db(b => `out-${b.length}`), f = wa(true)
    expect(await sendAutoReplies(d.client, 'whatsapp', ['wamid.in'], 'T', f)).toBe(2)
    const urls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]))
    expect(urls.every(u => u.includes('/1438056256053876/messages'))).toBe(true)
    expect(d.calls.filter(c => c[0] === 'crm_auto_reply_done').map(c => c[1].p_external_id)).toEqual(['wamid.X', 'wamid.X'])
  })

  it('a reply the database will not claim (sent within the hour) is not sent', async () => {
    const d = db(() => null), f = wa(true)
    expect(await sendAutoReplies(d.client, 'whatsapp', ['wamid.in'], 'T', f)).toBe(0)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('a refused send is recorded as failed, with why', async () => {
    const d = db(() => 'out-1'), f = wa(false)
    expect(await sendAutoReplies(d.client, 'whatsapp', ['wamid.in'], 'T', f)).toBe(0)
    const done = d.calls.filter(c => c[0] === 'crm_auto_reply_done')
    expect(done[0][1]).toMatchObject({ p_id: 'out-1', p_external_id: null })
    expect(String(done[0][1].p_error)).toMatch(/24 hours/)
  })

  it('no token or no messages: nothing asked', async () => {
    const d = db(() => 'x')
    expect(await sendAutoReplies(d.client, 'whatsapp', ['wamid.in'], undefined)).toBe(0)
    expect(await sendAutoReplies(d.client, 'whatsapp', [], 'T')).toBe(0)
    expect(d.calls).toHaveLength(0)
  })
})

describe("away / holiday (2026-10-24)", () => {
  const set = { welcome: { on: false, text: "" }, after: { on: true, text: "After hours", from: "08:00", to: "20:00" },
    away: { on: true, text: "On holiday", from: "2026-12-24T18:00", to: "2027-01-02T09:00" }, kws: [] };
  it("inside the period: the away reply, in place of after hours", () => {
    expect(autoReplyTexts(set, { body: "hi", sentAt: "2026-12-25T15:00:00Z", first: false })).toEqual(["On holiday"]);
  });
  it("outside it: as before", () => {
    expect(autoReplyTexts(set, { body: "hi", sentAt: "2026-12-20T15:00:00Z", first: false })).toEqual(["After hours"]);
    expect(autoReplyTexts({ ...set, away: { ...set.away, on: false } }, { body: "hi", sentAt: "2026-12-25T15:00:00Z", first: false })).toEqual(["After hours"]);
  });
  it("the times are the office's (UTC+8)", () => {
    expect(inAway(new Date("2026-12-24T09:59:00Z"), "2026-12-24T18:00", "2026-12-25T00:00")).toBe(false);
    expect(inAway(new Date("2026-12-24T10:00:00Z"), "2026-12-24T18:00", "2026-12-25T00:00")).toBe(true);
    expect(inAway(new Date("2026-12-24T10:00:00Z"), "", "")).toBe(false);
  });
});
