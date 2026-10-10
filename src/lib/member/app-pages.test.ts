import { describe, expect, it } from 'vitest'
import { closedBoxes } from '@/lib/page-tabs'
import { APP_PAGE_TABS, NOTHING_CLOSED, appClosed, requestPageOf } from './app-pages'
import { TAB_BY_ID } from '@/lib/permission-tabs'

// The Revenue app follows its holder's ticks (2026-10-11, the user: "勾掉 Arena，手机 app 就不显示").
describe('the Revenue app’s pages and their tabs', () => {
  it('every page is a Revenue app tab of People › Permissions', () => {
    for (const tab of Object.values(APP_PAGE_TABS)) expect(TAB_BY_ID.get(tab)?.view).toBe('rev')
  })

  it('nothing closes for an account whose ticks are worked out from its cells', () => {
    expect(appClosed(closedBoxes(null))).toBe(NOTHING_CLOSED)
    expect(appClosed(undefined)).toBe(NOTHING_CLOSED)
  })

  it('a template saved on tabs closes the pages it leaves unticked, and the sends whose Create it does', () => {
    // A Revenue Specialist as the handoff's sample has it, without the Arena: every View, the Quote's and Requests' Create.
    const ticks = ['rev.today.view', 'rev.insight.view', 'rev.quote.view', 'rev.quote.create', 'rev.income.view',
      'rev.requests.view', 'rev.requests.create', 'rev.track.view', 'rev.team.view']
    expect(appClosed(closedBoxes({ ticks, boxes: [], cells: false }))).toEqual({ pages: ['arena'], sends: ['track'] })
  })

  it('a View held back closes its page and its sends with it', () => {
    const closed = appClosed(closedBoxes({ ticks: null, boxes: [{ tab: 'rev.requests', action: 'view', granted: false }], cells: true }))
    expect(closed).toEqual({ pages: ['requests'], sends: ['requests'] })
  })

  it('a claim is sent under Requests’ Create, a waiting list or replacement under its own page’s', () => {
    expect(requestPageOf('claim')).toBe('requests')
    expect(requestPageOf('waiting')).toBe('track')
    expect(requestPageOf('replacement')).toBe('track')
  })
})
