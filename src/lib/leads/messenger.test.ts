import { describe, expect, it, vi } from 'vitest'
import { attachmentKind, deliver, deliverFile, FILE_LIMIT, messageOf, NO_PAGE, NOT_CONNECTED, NO_PAGE_TOKEN, sendReaction, TOO_BIG, WINDOW_SHUT } from './messenger'

const now = new Date('2026-10-28T03:00:00Z')
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('Lead View › Messenger out', () => {
  it('turns a template’s buttons into quick replies, 13 at most, 20 characters each', () => {
    expect(messageOf('Hi')).toEqual({ text: 'Hi' })
    expect(messageOf('Which?', ['3-seater', ' L-shape ', ''])).toEqual({
      text: 'Which?',
      quick_replies: [{ content_type: 'text', title: '3-seater', payload: 'LV:3-seater' }, { content_type: 'text', title: 'L-shape', payload: 'LV:L-shape' }],
    })
    expect(messageOf('x', Array.from({ length: 15 }, (_, i) => `Option number ${i} and more`)).quick_replies).toHaveLength(13)
    // A long option (2026-10-29): every option written in full under the message, the buttons numbered and clipped,
    // the payload the whole option.
    const long = messageOf('Which one?', ['Sofa', 'Talk to a salesperson about delivery'])
    expect(long.text).toBe('Which one?\n\n1. Sofa\n2. Talk to a salesperson about delivery')
    expect(long.quick_replies?.map(q => [q.title, q.payload])).toEqual([['1. Sofa', 'LV:Sofa'], ['2. Talk to a salesp…', 'LV:Talk to a salesperson about delivery']])
    expect([...long.quick_replies![1].title].length).toBe(20)
  })

  it('refuses before asking Meta: no Page, the window shut, no token', async () => {
    const f = vi.fn()
    expect(await deliver({ pageId: null, psid: '123456', body: 'Hi', lastInAt: now.toISOString() }, 't', now, f)).toEqual({ error: NO_PAGE })
    expect(await deliver({ pageId: '946946021838962', psid: '123456', body: 'Hi', lastInAt: '2026-10-27T01:00:00Z' }, 't', now, f)).toEqual({ error: WINDOW_SHUT })
    expect(await deliver({ pageId: '946946021838962', psid: '123456', body: 'Hi', lastInAt: null }, 't', now, f)).toEqual({ error: WINDOW_SHUT })
    expect(await deliver({ pageId: '946946021838962', psid: '123456', body: 'Hi', lastInAt: '2026-10-28T02:00:00Z' }, undefined, now, f)).toEqual({ error: NOT_CONNECTED })
    expect(f).not.toHaveBeenCalled()
  })

  it('sends inside the window as a response, with the template’s quick replies, and keeps Meta’s id', async () => {
    const calls: Array<{ url: string; body?: string }> = []
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as string | undefined })
      return String(url).includes('fields=access_token') ? json(200, { access_token: 'PAGE' }) : json(200, { message_id: 'm_1' })
    }) as unknown as typeof fetch
    const r = await deliver({ pageId: '504171022789980', psid: '7654321', body: 'Which?', buttons: ['Yes', 'No'], lastInAt: '2026-10-28T02:30:00Z' }, 'SYS-a', now, f)
    expect(r).toEqual({ mid: 'm_1' })
    const sent = JSON.parse(calls.find(c => c.url.endsWith('/messages'))!.body!)
    expect(sent).toMatchObject({ recipient: { id: '7654321' }, messaging_type: 'RESPONSE', message: { text: 'Which?', quick_replies: [{ title: 'Yes' }, { title: 'No' }] } })
  })

  it('says why when Meta gives no Page token or refuses', async () => {
    const noToken = vi.fn(async () => json(400, { error: { code: 100 } })) as unknown as typeof fetch
    expect(await deliver({ pageId: '111111', psid: '123456', body: 'Hi', lastInAt: '2026-10-28T02:30:00Z' }, 'SYS-b', now, noToken)).toEqual({ error: NO_PAGE_TOKEN })
    const refused = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('fields=access_token') ? json(200, { access_token: 'PAGE' }) : json(400, { error: { code: 10, error_subcode: 2018278 } })) as unknown as typeof fetch
    const r = await deliver({ pageId: '222222', psid: '123456', body: 'Hi', lastInAt: '2026-10-28T02:30:00Z' }, 'SYS-c', now, refused)
    expect(r).toEqual({ error: 'Outside Messenger’s reply window for this customer.'.replace('’', "'") })
  })
})

describe('Lead View › a photo or file out', () => {
  it('names the attachment by its type', () => {
    expect([attachmentKind('image/jpeg'), attachmentKind('video/mp4'), attachmentKind('audio/ogg'), attachmentKind('application/pdf')]).toEqual(['image', 'video', 'audio', 'file'])
  })

  it('refuses before asking Meta: shut window, too big', async () => {
    const f = vi.fn()
    const small = new Blob(['x'], { type: 'image/png' })
    expect(await deliverFile({ pageId: '946946021838962', psid: '7700001', lastInAt: '2026-10-27T01:00:00Z' }, small, 'a.png', 'image/png', 'SYS', now, f)).toEqual({ error: WINDOW_SHUT })
    const big = { size: FILE_LIMIT + 1, type: 'application/pdf' } as Blob
    expect(await deliverFile({ pageId: '946946021838962', psid: '7700001', lastInAt: '2026-10-28T02:30:00Z' }, big, 'a.pdf', 'application/pdf', 'SYS', now, f)).toEqual({ error: TOO_BIG })
    expect(f).not.toHaveBeenCalled()
  })

  it('uploads the file with the message to the Page and keeps Meta’s id', async () => {
    const bodies: unknown[] = []
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('fields=access_token')) return json(200, { access_token: 'PAGE' })
      bodies.push(init?.body)
      return json(200, { message_id: 'm_file' })
    }) as unknown as typeof fetch
    const r = await deliverFile({ pageId: '946946021838962', psid: '7700001', lastInAt: '2026-10-28T02:30:00Z' }, new Blob(['%PDF'], { type: 'application/pdf' }), 'floor plan.pdf', 'application/pdf', 'SYS-file', now, f)
    expect(r).toEqual({ mid: 'm_file' })
    const form = bodies[0] as FormData
    expect(JSON.parse(String(form.get('message')))).toEqual({ attachment: { type: 'file', payload: { is_reusable: false } } })
    // The file rides along (the test DOM drops a Blob's filename; Node's FormData keeps it).
    expect(form.get('filedata')).toBeInstanceOf(Blob)
  })
})

describe('Lead View › answering one message, and reacting (mig 20261027220000)', () => {
  const page = (calls: Array<{ url: string; body?: string }>, answer: unknown = { message_id: 'm_2' }) => vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as string | undefined })
    return String(url).includes('fields=access_token') ? json(200, { access_token: 'PAGE' }) : json(200, answer)
  }) as unknown as typeof fetch

  it('sends a reply with Meta’s reply_to beside the message', async () => {
    const calls: Array<{ url: string; body?: string }> = []
    const r = await deliver({ pageId: '946946021838962', psid: '7654321', body: 'Queen or King?', lastInAt: '2026-10-28T02:30:00Z', replyToMid: 'm_q' }, 'SYS-r', now, page(calls))
    expect(r).toEqual({ mid: 'm_2' })
    const sent = JSON.parse(calls.find(c => c.url.endsWith('/messages'))!.body!)
    expect(sent).toMatchObject({ recipient: { id: '7654321' }, message: { text: 'Queen or King?' }, reply_to: { mid: 'm_q' } })
  })

  it('reacts with one emoji, takes it away with unreact, and says why when it cannot', async () => {
    const calls: Array<{ url: string; body?: string }> = []
    expect(await sendReaction({ pageId: '946946021838962', psid: '7654321', mid: 'm_c' }, '❤️', 'SYS-x', page(calls, { recipient_id: '7654321' }))).toBe(null)
    expect(JSON.parse(calls.find(c => c.url.endsWith('/messages'))!.body!)).toEqual({ recipient: { id: '7654321' }, sender_action: 'react', payload: { message_id: 'm_c', reaction: '❤️' } })
    const off: Array<{ url: string; body?: string }> = []
    expect(await sendReaction({ pageId: '946946021838962', psid: '7654321', mid: 'm_c' }, null, 'SYS-y', page(off, {}))).toBe(null)
    expect(JSON.parse(off.find(c => c.url.endsWith('/messages'))!.body!)).toEqual({ recipient: { id: '7654321' }, sender_action: 'unreact', payload: { message_id: 'm_c' } })
    expect(await sendReaction({ pageId: null, psid: '1', mid: 'm' }, '👍', 'SYS-z')).toBe(NO_PAGE)
    expect(await sendReaction({ pageId: '1', psid: '1', mid: 'm' }, '👍', undefined)).toBe(NOT_CONNECTED)
  })
})
