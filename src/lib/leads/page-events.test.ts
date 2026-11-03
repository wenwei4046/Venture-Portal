import { describe, expect, it } from 'vitest'
import { leadPageEvents, templateText } from './page-events'

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

  it('keeps Meta’s receipts for the brand Pages: delivered ids and read watermarks', () => {
    const r = leadPageEvents({ object: 'page', entry: [{ id: P2990, time: 1, messaging: [
      { sender: { id: '7700002' }, recipient: { id: P2990 }, timestamp: 1, delivery: { mids: ['e.1'], watermark: 1761530001000 } },
      { sender: { id: '7700002' }, recipient: { id: P2990 }, timestamp: 1, read: { watermark: 1761530002000 } },
    ] }] }, crm, OURS)
    expect(r.receipts.delivered).toEqual([{ externalId: 'e.1' }])
    expect(r.receipts.reads.map(x => [x.pageId, x.psid])).toEqual([[P2990, '7700002']])
    expect(r.messages).toEqual([])
  })

  it('leaves the CRM’s Pages and anything that is not a Page delivery alone', () => {
    expect(leadPageEvents({ object: 'page', entry: [{ id: CRM, time: 1, messaging: [customer('7700009', 'm.9')], standby: [echo('7700009', 'e.9', 'x')] }] }, crm, OURS))
      .toEqual({ messages: [], replies: [], receipts: { delivered: [], reads: [] }, returns: [] })
    expect(leadPageEvents({ object: 'instagram', entry: [] }, crm, OURS)).toEqual({ messages: [], replies: [], receipts: { delivered: [], reads: [] }, returns: [] })
  })
})

describe('a card the Page sent (2026-10-28)', () => {
  const card = {
    type: 'template', title: 'Hi！你好我是 Alex，Carress的线上顾问',
    payload: { template_type: 'button', buttons: [{ type: 'postback', title: '了解RM49的优惠🎉' }, { type: 'postback', title: '了解【Rent To Own】' }] },
  }
  it('reads a button card as its words and its buttons', () => {
    expect(templateText(card)).toBe('Hi！你好我是 Alex，Carress的线上顾问\n▸ 了解RM49的优惠🎉\n▸ 了解【Rent To Own】')
    expect(templateText({ type: 'template', payload: { elements: [{ title: 'King', subtitle: 'RM2k', buttons: [{ title: 'Book' }] }] } })).toBe('King\nRM2k\n▸ Book')
    expect(templateText({ type: 'image', payload: { url: 'x' } } as never)).toBeNull()
  })
  it('keeps the card’s words on the Page’s reply', () => {
    const out = leadPageEvents({ object: 'page', entry: [{ id: P2990, messaging: [{ sender: { id: P2990 }, recipient: { id: '296' }, timestamp: 1793155203631, message: { mid: 'm.card', is_echo: true, app_id: 532160876956612, attachments: [card] } }] }] }, crm, OURS)
    expect(out.replies[0]).toMatchObject({ externalId: 'm.card', kind: 'text', body: expect.stringContaining('▸ 了解RM49的优惠🎉') })
  })
})

describe('a tapped template button reads as its whole option (2026-10-29)', () => {
  it('takes the option from the payload, not the button’s 20 characters', () => {
    const ev = (mid: string, text: string, payload?: string) => ({ sender: { id: '777' }, recipient: { id: P2990 }, timestamp: 1793155203631, message: { mid, text, ...(payload ? { quick_reply: { payload } } : {}) } })
    const out = leadPageEvents({ object: 'page', entry: [{ id: P2990, messaging: [
      ev('m.1', '2. Talk to a salesp…', 'LV:Talk to a salesperson about delivery'),
      ev('m.2', 'Hello'),
      ev('m.3', 'Yes', 'SOMETHING_ELSE'),
    ] }] }, crm, OURS)
    expect(out.messages.map(m => m.body)).toEqual(['Talk to a salesperson about delivery', 'Hello', 'Yes'])
  })
})

describe('a customer back from an ad (2026-10-29, mig 20261029170010)', () => {
  it('reads a referral on its own as a return, with the ad', () => {
    const out = leadPageEvents({ object: 'page', entry: [{ id: P2990, messaging: [
      { sender: { id: '28148126538195565' }, recipient: { id: P2990 }, timestamp: 1793053595,
        referral: { type: 'OPEN_THREAD', ad_id: '120248982273430254', source: 'ADS', ads_context_data: { post_id: '122141456535199078', ad_title: '[Promotion] Skip the markup' } } },
      { sender: { id: P2990 }, recipient: { id: '777' }, referral: { ad_id: '1', source: 'ADS' } },
      { sender: { id: '888' }, recipient: { id: P2990 }, referral: { type: 'OPEN_THREAD', source: 'SHORTLINK', ref: 'x' } },
    ] }] }, crm, OURS)
    expect(out.returns).toEqual([{ pageId: P2990, psid: '28148126538195565', ad: expect.objectContaining({ sourceId: '120248982273430254', headline: '[Promotion] Skip the markup' }) }])
    expect(out.messages).toEqual([])
  })
})
