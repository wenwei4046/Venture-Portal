import { describe, expect, it } from 'vitest'
import {
  billHref, parseWorkbenchReturn, readWorkbenchLocation, sameWorkbenchView, workbenchSearch,
  type WorkbenchLocation,
} from './workbench-nav'

const at = (search: string) => readWorkbenchLocation(new URLSearchParams(search))
const HOME: WorkbenchLocation = { tab: 'sales', personId: null, view: 'personal', query: '', brand: '', sort: 'date_asc' }

describe('readWorkbenchLocation', () => {
  it('opens the month on its first view when the URL says nothing', () => {
    expect(at('')).toEqual(HOME)
  })

  it("reads a salesperson's ledger, the table on it, and how it is searched", () => {
    expect(at('person=agent&orders=overriding&q=SO-1&brand=AKEMI&sort=commission_desc')).toEqual({
      tab: 'sales', personId: 'agent', view: 'overriding', query: 'SO-1', brand: 'AKEMI', sort: 'commission_desc',
    })
  })

  it('opens a ledger from Total Sales Orders whatever cut the URL also names', () => {
    expect(at('view=kpi&person=agent')).toMatchObject({ tab: 'sales', personId: 'agent' })
  })

  it('reads a cut of the month', () => {
    expect(at('view=deposit').tab).toBe('deposit')
    expect(at('view=venue').tab).toBe('venue')
  })

  it('falls back to the defaults for values it does not know', () => {
    expect(at('view=payroll&sort=random')).toEqual(HOME)
    expect(at('person=agent&orders=everything').view).toBe('personal')
    // A table of a person means nothing without the person.
    expect(at('orders=overriding').view).toBe('personal')
    expect(at('person=%20%20').personId).toBeNull()
  })
})

describe('workbenchSearch', () => {
  it('writes only what differs from the first view', () => {
    expect(workbenchSearch('', HOME)).toBe('')
    expect(workbenchSearch('', { ...HOME, tab: 'deposit' })).toBe('?view=deposit')
    expect(workbenchSearch('', { ...HOME, personId: 'agent' })).toBe('?person=agent')
    expect(workbenchSearch('', { ...HOME, personId: 'agent', view: 'deposit', sort: 'date_desc' }))
      .toBe('?person=agent&orders=deposit&sort=date_desc')
  })

  it('replaces its own keys and leaves the rest of the query alone', () => {
    expect(workbenchSearch('?tab=upsales&person=old&q=x', { ...HOME, personId: 'agent' })).toBe('?tab=upsales&person=agent')
    expect(workbenchSearch(new URLSearchParams('tab=open-bill&view=kpi'), HOME)).toBe('?tab=open-bill')
  })

  it('does not write a cut for a ledger — the ledger is the cut', () => {
    expect(workbenchSearch('', { ...HOME, tab: 'kpi', personId: 'agent' })).toBe('?person=agent')
  })

  it('round-trips through readWorkbenchLocation', () => {
    const where: WorkbenchLocation = { tab: 'sales', personId: 'a b&c', view: 'overriding', query: 'HC-SO 1&2', brand: 'AK', sort: 'commission_desc' }
    expect(at(workbenchSearch('', where).slice(1))).toEqual(where)
  })
})

describe('sameWorkbenchView', () => {
  it('is the same table whatever the search, brand or order', () => {
    expect(sameWorkbenchView(at('person=a&q=x'), at('person=a&sort=date_desc'))).toBe(true)
    expect(sameWorkbenchView(at('person=a'), at('person=a&orders=deposit'))).toBe(false)
    expect(sameWorkbenchView(at('person=a'), at('person=b'))).toBe(false)
  })
})

describe('billHref', () => {
  it("opens a bill in its own month, carrying where it was opened from", () => {
    expect(billHref('fair', '2026-08-01', 'o-1', '/revenue/fair/2026-09-01?person=agent'))
      .toBe('/revenue/fair/2026-08-01/orders/o-1?from=%2Frevenue%2Ffair%2F2026-09-01%3Fperson%3Dagent')
    expect(billHref('fair', '2026-09-01', 'o-1', null)).toBe('/revenue/fair/2026-09-01/orders/o-1')
  })
})

describe('parseWorkbenchReturn', () => {
  it('takes a month page of the same sub-department back, query and all', () => {
    expect(parseWorkbenchReturn('/revenue/fair/2026-09-01?person=agent&orders=overriding', 'fair')).toEqual({
      tab: 'sales', personId: 'agent', view: 'overriding', query: '', brand: '', sort: 'date_asc',
      href: '/revenue/fair/2026-09-01?person=agent&orders=overriding',
      period: '2026-09-01',
    })
    expect(parseWorkbenchReturn('/revenue/fair/2026-09-01', 'fair')?.href).toBe('/revenue/fair/2026-09-01')
  })

  it('keeps keys it does not own, as the page had them', () => {
    expect(parseWorkbenchReturn('/revenue/fair/2026-09-01?tab=upsales&view=deposit', 'fair')?.href)
      .toBe('/revenue/fair/2026-09-01?tab=upsales&view=deposit')
  })

  it('never leads anywhere else', () => {
    for (const from of [
      '//evil.example/revenue/fair/2026-09-01',
      '/\\evil.example/revenue/fair/2026-09-01',
      'https://evil.example/revenue/fair/2026-09-01',
      'javascript:alert(1)',
      'revenue/fair/2026-09-01',
      '/revenue/ir/2026-09-01', // another sub-department
      '/revenue/fair/2026-09-01/orders', // another page
      '/revenue/fair/2026-09-15',
      '/revenue/fair/2026-09-01/../../../dashboard',
      '',
    ]) {
      expect(parseWorkbenchReturn(from, 'fair')).toBeNull()
    }
    expect(parseWorkbenchReturn(null, 'fair')).toBeNull()
    expect(parseWorkbenchReturn(`/revenue/fair/2026-09-01?q=${'x'.repeat(3000)}`, 'fair')).toBeNull()
  })

  it('drops a fragment rather than carrying it along', () => {
    expect(parseWorkbenchReturn('/revenue/fair/2026-09-01?person=a#top', 'fair')?.href).toBe('/revenue/fair/2026-09-01?person=a')
  })
})
