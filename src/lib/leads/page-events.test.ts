import { describe, expect, it } from 'vitest'
import { leadPageEvents } from './page-events'

const P2990 = '946946021838962', CRM = '102351059576534', OURS = '1848411446523305'
const crm = new Set([CRM])
const customer = (psid: string, mid: string, text = 'hi') => ({ sender: { id: psid }, recipient: { id: P2990 }, timestamp: 1761530000000, message: { mid, text } })
const echo = (psid: string, mid: string, text: string, appId?: string | number) =>
  ({ sender: { id: P2990 }, recipient: { id: psid }, timestamp: 1761530001000, message: { mid, text, is_echo: true, ...(appId ? { app_id: appId } : {}) } })

describe('Lead View › a Page delivery: standby customers and the Page’s own replies', () => {
  it('reads customers from messaging AND standby (Meta’s AI holding the conversation)', () => {
    const r = leadPageEvents({ object: 'page', entry: [{ id: P2990, time: 1, messaging: [customer('7700001', 'm.1')], standby: [customer('7700002', 'm.2', 'Location please?')] }] }, crm, OURS)
    expect(r.messages.map(m => [m.psid, m.body])).toEqual([['7700001', 'hi'], ['7700002', 'Location please?']])
  })

  it('keeps the Page’s replies sent elsewhere, never this app’s own, with the customer it went to', () => {
    const r = leadPageEvents({ object: 'page', entry: [{ id: P2990, time: 1, standby: [
      echo('7700002', 'e.1', "We're in PJ New Town!", 263902037430900),
      echo('7700002', 'e.2', 'sent from Lead View', Number(OURS)),
      { sender: { id: P2990 }, recipient: { id: '7700002' }, timestamp: 1, message: { mid: 'e.3', is_echo: true, attachments: [{ type: 'image' }] } },
    ] }] }, crm, OURS)
    expect(r.messages).toEqual([])
    expect(r.replies.map(x => [x.externalId, x.pageId, x.psid, x.kind, x.body])).toEqual([
      ['e.1', P2990, '7700002', 'text', "We're in PJ New Town!"],
      ['e.3', P2990, '7700002', 'image', null],
    ])
  })

  it('keeps the address of a photo the Page sent, so the chat shows it (Meta’s CDN only)', () => {
    const pic = (mid: string, url: string) => ({ sender: { id: P2990 }, recipient: { id: '7700002' }, timestamp: 1, message: { mid, is_echo: true, attachments: [{ type: 'image', payload: { url } }] } })
    const r = leadPageEvents({ object: 'page', entry: [{ id: P2990, time: 1, messaging: [
      pic('e.4', 'https://scontent.xx.fbcdn.net/v/t1.15752/bed.jpg'),
      pic('e.5', 'https://evil.example.com/bed.jpg'),
    ] }] }, crm, OURS)
    expect(r.replies.map(x => [x.externalId, x.kind, x.mediaUrl ?? null])).toEqual([
      ['e.4', 'image', 'https://scontent.xx.fbcdn.net/v/t1.15752/bed.jpg'],
      ['e.5', 'image', null],
    ])
  })

  it('leaves the CRM’s Pages and anything that is not a Page delivery alone', () => {
    expect(leadPageEvents({ object: 'page', entry: [{ id: CRM, time: 1, messaging: [customer('7700009', 'm.9')], standby: [echo('7700009', 'e.9', 'x')] }] }, crm, OURS))
      .toEqual({ messages: [], replies: [] })
    expect(leadPageEvents({ object: 'instagram', entry: [] }, crm, OURS)).toEqual({ messages: [], replies: [] })
  })
})
