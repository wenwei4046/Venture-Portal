import { describe, expect, it } from 'vitest'
import { followUp, lastUpdate, leadsCsv, rangeDays, readSaleValue, stageDays, stageOf } from './stage'
import type { LeadContact } from './types'

const lead = (over: Partial<LeadContact> = {}): LeadContact => ({
  id: 'c', brandId: 'b1', channel: 'instagram', isTest: false, name: 'Nurul', sourceAd: '', phone: null, phoneState: 'none', phoneAt: null,
  interest: 'King 床褥', budget: '', showroom: '', preferredTime: '', note: '', handedSalesId: null, handedSalesName: null, handedAt: null,
  handedByName: null, appt: 'unknown', shown: 'unknown', lastAt: '2026-10-18T03:00:00Z', lastDir: 'in', lastText: '', createdAt: '2026-10-18T03:00:00Z', ...over,
})
const handed = { phone: '0175520193', phoneState: 'confirmed' as const, phoneAt: '2026-10-18T04:10:00Z', handedAt: '2026-10-18T04:28:00Z', handedSalesName: 'Alvin Goh' }

describe('where a lead stands', () => {
  it('walks the pipeline', () => {
    expect(stageOf(lead())).toBe('nophone')
    expect(stageOf(lead({ phone: '0175520193', phoneState: 'detected' }))).toBe('new')
    expect(stageOf(lead(handed))).toBe('handed')
    expect(stageOf(lead({ ...handed, contactedAt: '2026-10-18T05:00:00Z' }))).toBe('contacted')
    expect(stageOf(lead({ ...handed, closedAt: '2026-10-19T05:00:00Z' }))).toBe('closed')
  })
  it('counts the Inbox’s Appointment and Came, and a loss over all', () => {
    expect(stageOf(lead({ ...handed, appt: 'booked' }))).toBe('appt')
    expect(stageOf(lead({ ...handed, appt: 'booked', shown: 'came' }))).toBe('came')
    expect(stageOf(lead({ ...handed, contactedAt: '2026-10-18T05:00:00Z', lostAt: '2026-10-19T00:00:00Z' }))).toBe('lost')
  })
  it('dates the steps it knows', () => {
    expect(stageDays(lead({ ...handed, contactedAt: '2026-10-18T05:05:00Z' }))).toEqual({
      nophone: '2026-10-18T03:00:00Z', new: '2026-10-18T04:10:00Z', handed: '2026-10-18T04:28:00Z', contacted: '2026-10-18T05:05:00Z',
    })
  })
  it('updates with a message or a change to the card, whichever is later', () => {
    expect(lastUpdate(lead({ updatedAt: '2026-10-19T00:00:00Z' }))).toBe('2026-10-19T00:00:00Z')
    expect(lastUpdate(lead({ updatedAt: '2026-10-01T00:00:00Z' }))).toBe('2026-10-18T03:00:00Z')
  })
})

describe('needs follow-up', () => {
  const at = (h: number) => Date.parse(handed.handedAt) + h * 3_600_000
  it('says so a day after the hand-over, only while nobody called', () => {
    expect(followUp(lead(handed), at(23))).toBeNull()
    expect(followUp(lead(handed), at(26))).toBe('Not contacted · 26 h')
    expect(followUp(lead(handed), at(50))).toBe('Not contacted · 2 days')
    expect(followUp(lead({ ...handed, contactedAt: '2026-10-18T05:00:00Z' }), at(50))).toBeNull()
  })
})

describe('the time ranges', () => {
  const today = '2026-10-22' // a Thursday
  it('reads the office days of each', () => {
    expect(rangeDays('today', today)).toEqual({ from: '2026-10-22', to: '2026-10-23' })
    expect(rangeDays('yest', today)).toEqual({ from: '2026-10-21', to: '2026-10-22' })
    expect(rangeDays('week', today)).toEqual({ from: '2026-10-19', to: '2026-10-23' })
    expect(rangeDays('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-23' })
    expect(rangeDays('last', today)).toEqual({ from: '2026-09-01', to: '2026-10-01' })
    expect(rangeDays('last', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2026-01-01' })
    expect(rangeDays('all', today)).toBeNull()
  })
  it('keeps a custom range inclusive, never past today, a year at most', () => {
    expect(rangeDays('custom', today, '2026-10-05', '2026-10-10')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeDays('custom', today, '2026-10-05', '2026-12-31')).toEqual({ from: '2026-10-05', to: '2026-10-23' })
    expect(rangeDays('custom', today, '2020-01-01', '2026-10-22')).toEqual({ from: '2025-09-18', to: '2026-10-23' })
    expect(rangeDays('custom', today, 'nope', '')).toEqual({ from: '2026-10-01', to: '2026-10-23' })
  })
})

describe('a sale value and the CSV', () => {
  it('reads ringgit as typed', () => {
    expect(readSaleValue('RM 2,690')).toBe(2690)
    expect(readSaleValue('2690.50')).toBe(2690.5)
    expect(readSaleValue(' ')).toBeNull()
    expect(readSaleValue('lots')).toBe('bad')
  })
  it('exports every filtered row, quoted, Excel-ready', () => {
    const csv = leadsCsv([lead({ ...handed, name: 'Nurul "N" Huda', saleValue: 2690 })], () => 'Carress', () => '18 Oct 12:28')
    expect(csv.startsWith('﻿"Name","Phone","Brand"')).toBe(true)
    expect(csv.split('\n')[1]).toBe('"Nurul ""N"" Huda","017-552 0193","Carress","Instagram","Organic","King 床褥","","","Alvin Goh","Handed","2690","18 Oct 12:28"')
  })
})
