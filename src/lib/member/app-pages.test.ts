import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { closedBoxes } from '@/lib/page-tabs'
import { APP_PAGE_TABS, NOTHING_CLOSED, SEND_REFUSED, appClosed, requestPageOf } from './app-pages'
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
    // A Revenue Specialist as the handoff's sample has it, without the Arena: every View, the Quote's and Requests' Create
    // (and, round 2, booking a room; 2026-10-11, the rest of Profile).
    const ticks = ['rev.today.view', 'rev.insight.view', 'rev.quote.view', 'rev.quote.create', 'rev.income.view',
      'rev.requests.view', 'rev.requests.create', 'rev.track.view', 'rev.team.view', 'rev.rooms.view', 'rev.rooms.create',
      'rev.documentation.view', 'rev.honours.view', 'rev.brand_weeks.view', 'rev.scheme.view']
    expect(appClosed(closedBoxes({ ticks, boxes: [], cells: false }))).toEqual({ pages: ['arena'], sends: ['track'] })
    // A template saved before those three were boxes leaves them unticked — so they close with it.
    expect(appClosed(closedBoxes({ ticks: ticks.slice(0, 12), boxes: [], cells: false })).pages).toEqual(['arena', 'honours', 'brandWeeks', 'scheme'])
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

  it('the database asks the same box, and says the same words (mig 20261011220200 › member_send_guard)', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261011220200_member_sends_ask_their_tab.sql'), 'utf8')
    const guard = /CREATE OR REPLACE FUNCTION public\.member_send_guard[\s\S]*?\$fn\$;/.exec(sql)?.[0] ?? ''
    expect(guard).toContain(`CASE WHEN p_kind = 'claim' THEN '${APP_PAGE_TABS[requestPageOf('claim')]}' ELSE '${APP_PAGE_TABS[requestPageOf('waiting')]}' END, 'create'`)
    expect(APP_PAGE_TABS[requestPageOf('replacement')]).toBe(APP_PAGE_TABS[requestPageOf('waiting')])
    expect(guard).toContain(`THEN '${SEND_REFUSED.requests}'`)
    expect(guard).toContain(`ELSE '${SEND_REFUSED.track}' END`)
  })
})
