import { describe, expect, it } from 'vitest'
import { clampWidth, isVisitDate, LIST_W, phoneStage, phoneSteps, readLayout, brandCounts, isMediaPlaceholder, mediaKind, receiptOf, readPanels, replyingNow, RIGHT_W, unreadLabel } from './inbox'

describe('the Inbox columns the browser keeps', () => {
  it('starts at the handoff widths', () => {
    expect(readLayout(null)).toEqual({ listW: 304, rightW: 352 })
    expect(readLayout('not json')).toEqual({ listW: 304, rightW: 352 })
  })
  it('keeps a width inside its column’s range', () => {
    expect(readLayout(JSON.stringify({ listW: 100, rightW: 9000, navOpen: false }))).toEqual({ listW: LIST_W.min, rightW: RIGHT_W.max })
    expect(readLayout(JSON.stringify({ listW: 'wide' }))).toEqual({ listW: 304, rightW: 352 })
    expect(clampWidth(333.6, LIST_W)).toBe(334)
    expect(clampWidth(Number.NaN, RIGHT_W)).toBe(352)
  })
})

describe('who replies now', () => {
  it('is a template while a flow waits on the customer, else Customer Service', () => {
    expect(replyingNow({ flowState: 'running', flowName: 'Sofa enquiry' }, 'Mei Ling')).toEqual({ kind: 'template', label: 'Template · Sofa enquiry' })
    expect(replyingNow({ flowState: 'done', flowName: 'Sofa enquiry' }, 'Mei Ling')).toEqual({ kind: 'cs', label: 'CS · Mei Ling' })
    expect(replyingNow({}, 'Mei Ling').kind).toBe('cs')
  })
})

describe('the phone card', () => {
  it('stands where the phone does, and handed over beats it', () => {
    expect(phoneStage({ handedAt: null, phone: null, phoneState: 'none' })).toBe('none')
    expect(phoneStage({ handedAt: null, phone: '0123384721', phoneState: 'detected' })).toBe('detected')
    expect(phoneStage({ handedAt: null, phone: '0123384721', phoneState: 'confirmed' })).toBe('confirmed')
    expect(phoneStage({ handedAt: '2026-10-18T04:28:00Z', phone: '0123384721', phoneState: 'confirmed' })).toBe('handed')
  })
  it('lights its steps up to there', () => {
    expect(phoneSteps('none').map(s => s.reached)).toEqual([false, false, false])
    expect(phoneSteps('confirmed').map(s => s.reached)).toEqual([true, true, false])
    expect(phoneSteps('handed').map(s => s.reached)).toEqual([true, true, true])
  })
  it('shows a picked day in the date box and keeps older words as words', () => {
    expect(isVisitDate('2026-10-24')).toBe(true)
    expect(isVisitDate('Sunday afternoon')).toBe(false)
  })
})

describe('the right-hand panels', () => {
  it('opens the customer and folds the timeline until the browser kept otherwise', () => {
    expect(readPanels(null)).toEqual({ card: true, log: false })
    expect(readPanels('oops')).toEqual({ card: true, log: false })
    expect(readPanels(JSON.stringify({ card: false, log: true }))).toEqual({ card: false, log: true })
    expect(readPanels(JSON.stringify({ card: 'no', log: 1 }))).toEqual({ card: true, log: false })
  })
})

describe('unreadLabel', () => {
  it('writes the number, 99+ past 99, as WhatsApp does', () => {
    expect(unreadLabel(1)).toBe('1')
    expect(unreadLabel(99)).toBe('99')
    expect(unreadLabel(100)).toBe('99+')
  })
})

describe('a message’s photo or file, as Messenger shows it', () => {
  it('knows the kind by the type Lead View sent, else by Meta’s label', () => {
    expect(mediaKind('image/jpeg', 'look')).toBe('image')
    expect(mediaKind('application/pdf', '[File] plan.pdf')).toBe('file')
    expect(mediaKind(null, '[Photo]')).toBe('image')
    expect(mediaKind(null, '[Video]')).toBe('video')
    expect(mediaKind(null, '[Voice message]')).toBe('audio')
    expect(mediaKind(undefined, '[File]')).toBe('file')
  })
  it('hides only a label standing for the file, never words written with it', () => {
    expect(isMediaPlaceholder('[Photo]')).toBe(true)
    expect(isMediaPlaceholder('[File] floor plan.pdf')).toBe(true)
    expect(isMediaPlaceholder('Here is the bed [Photo]')).toBe(false)
    expect(isMediaPlaceholder('Our showroom')).toBe(false)
  })
})

describe('read ticks, as WhatsApp', () => {
  const out = (at: string, delivery: 'sent' | 'recorded' | 'failed' = 'sent') => ({ direction: 'out' as const, delivery, at })
  it('one tick sent, two delivered, two blue read — by Meta’s receipts', () => {
    const c = { deliveredAt: '2026-10-27T05:00:00Z', readAt: '2026-10-27T04:00:00Z' }
    expect(receiptOf(out('2026-10-27T03:00:00Z'), c)).toBe('read')
    expect(receiptOf(out('2026-10-27T04:30:00Z'), c)).toBe('delivered')
    expect(receiptOf(out('2026-10-27T06:00:00Z'), c)).toBe('sent')
    expect(receiptOf(out('2026-10-27T03:00:00Z'), { deliveredAt: null, readAt: null })).toBe('sent')
  })
  it('a message recorded or refused says so; a customer’s has no tick', () => {
    expect(receiptOf(out('2026-10-27T03:00:00Z', 'failed'), null)).toBe('failed')
    expect(receiptOf(out('2026-10-27T03:00:00Z', 'recorded'), null)).toBe('recorded')
    expect(receiptOf({ direction: 'in', delivery: 'recorded', at: '2026-10-27T03:00:00Z' }, null)).toBe(null)
  })
})

describe('brandCounts', () => {
  it('counts each brand and all', () => {
    expect(brandCounts([{ brandId: 'a' }, { brandId: 'b' }, { brandId: 'a' }])).toEqual({ all: 3, a: 2, b: 1 })
  })
})
