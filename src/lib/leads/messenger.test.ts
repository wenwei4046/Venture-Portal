import { describe, expect, it, vi } from 'vitest'
import { deliver, messageOf, NO_PAGE, NOT_CONNECTED, NO_PAGE_TOKEN, WINDOW_SHUT } from './messenger'

const now = new Date('2026-10-28T03:00:00Z')
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('Lead View › Messenger out', () => {
  it('turns a template’s buttons into quick replies, 13 at most, 20 characters each', () => {
    expect(messageOf('Hi')).toEqual({ text: 'Hi' })
    expect(messageOf('Which?', ['3-seater', ' L-shape ', ''])).toEqual({
      text: 'Which?',
      quick_replies: [{ content_type: 'text', title: '3-seater', payload: '3-seater' }, { content_type: 'text', title: 'L-shape', payload: 'L-shape' }],
    })
    expect(messageOf('x', Array.from({ length: 15 }, (_, i) => `Option number ${i} and more`)).quick_replies).toHaveLength(13)
    expect(messageOf('x', ['A very long button label indeed']).quick_replies?.[0].title).toBe('A very long button l')
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
