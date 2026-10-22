import { describe, expect, it } from 'vitest'
import { mktNoticesFromRow, mktSearchFromRow, mktShellFromRow, noticeAge, subsForNav, subsTotal } from './shell'
import { DEFAULT_LOOK, densityOf, lookFromCookie, lookToCookie } from './look'
import { mktCrumb, mktNavActive, mktNavRows } from './nav'
import { isMarketingView } from '../marketing-view'

describe("Marketing's shell", () => {
  it('reads mkt_shell() and draws nothing for what it leaves out', () => {
    const s = mktShellFromRow({
      today: '2026-10-22',
      me: { id: 'a', full: 'Sia Josiah', title: 'MARKETING MANAGER', team: 'manager' },
      subs: [
        { id: '1', code: 'CAR', name: 'Carres', dot: 'oklch(0.70 0.12 235)', emoji: '🛋️', count: 0 },
        { id: '2', code: '2990', name: '2990', count: 2 },
        { id: '3', code: 'HK', name: 'Hookka', count: '1' },
        { code: 'BAD' },
      ],
      counts: { myspace: 3, calendar: 1, projects: -2 },
      notices: 4,
    })
    expect(s.me).toMatchObject({ first: 'Sia', team: 'manager', role: null })
    expect(s.subs.map(x => x.code)).toEqual(['CAR', '2990', 'HK'])
    expect(s.counts).toEqual({ myspace: 3, calendar: 1, projects: 0, tracking: 0 })
    // Those with something for the viewer first, most first — the rest as listed.
    expect(subsForNav(s.subs).map(x => x.code)).toEqual(['2990', 'HK', 'CAR'])
    expect(subsTotal(s.subs)).toBe(3)
    expect(mktShellFromRow(null).subs).toEqual([])
  })

  it('reads the bell and the search', () => {
    expect(mktNoticesFromRow([{ id: 'n1', title: 'On the plan', at: '2026-10-22T02:00:00Z', read: false, ref: 'p1' }, { title: 'no id' }]))
      .toEqual([{ id: 'n1', title: 'On the plan', body: '', ref: 'p1', at: '2026-10-22T02:00:00Z', read: false, type: null }])
    expect(mktSearchFromRow({ projects: [{ trackId: 'MKT-CAR-2610-001', title: 'Year-End' }], people: [{ id: 'u', first: 'Mei' }] }))
      .toEqual({ projects: [{ trackId: 'MKT-CAR-2610-001', title: 'Year-End', kind: '', status: '', sub: null }], people: [{ id: 'u', first: 'Mei', full: '', title: null, team: null }] })
    const now = new Date('2026-10-22T10:00:00Z')
    expect(noticeAge('2026-10-22T08:00:00Z', now)).toBe('2h ago')
    expect(noticeAge('2026-10-22T09:59:30Z', now)).toBe('now')
    expect(noticeAge('2026-10-20T10:00:00Z', now)).toBe('2d ago')
    expect(noticeAge('2026-09-01T10:00:00Z', now)).toBe('1 Sep')
  })

  it('keeps Appearance in a cookie, field by field', () => {
    expect(lookFromCookie(lookToCookie({ size: 'XL', font: 'IBM Plex', density: 'compact' }))).toEqual({ size: 'XL', font: 'IBM Plex', density: 'compact' })
    // As document.cookie holds it (encoded) and as the server reads it (decoded).
    expect(lookFromCookie(encodeURIComponent(lookToCookie({ size: 'S', font: 'Nunito', density: 'comfortable' })))).toMatchObject({ size: 'S', font: 'Nunito' })
    expect(lookFromCookie('{"size":"XXL","font":"Comic","density":"compact"}')).toEqual({ ...DEFAULT_LOOK, density: 'compact' })
    expect(lookFromCookie('not json')).toEqual(DEFAULT_LOOK)
    expect(densityOf('compact')).toEqual({ rowH: 30, subH: 26, tileS: 24 })
  })

  it('lists the rows the viewer’s tabs open, the manager’s tools for a manager only', () => {
    const staff = ['mkt.overview.view', 'mkt.calendar.view', 'mkt.projects.view', 'mkt.my_claims.view', 'mkt.meeting_rooms.view']
    expect(mktNavRows(staff).map(r => r.key)).toEqual(['myspace', 'calendar', 'subs', 'projects', 'claims', 'rooms'])
    expect(mktNavRows([...staff, 'mkt.tracking.view']).map(r => r.key)).toEqual(['myspace', 'calendar', 'subs', 'projects', 'tracking', 'workflow', 'minutes', 'claims', 'rooms'])
    expect(mktNavRows(undefined).length).toBe(9)
  })

  it('lights the row a page is under, a subsidiary by its projects', () => {
    expect(mktNavActive('/marketing', null)).toBe('myspace')
    expect(mktNavActive('/marketing/calendar', null)).toBe('calendar')
    expect(mktNavActive('/marketing/projects', new URLSearchParams('sub=CAR'))).toBe('sub:CAR')
    expect(mktNavActive('/marketing/projects', new URLSearchParams('q=x'))).toBe('projects')
    expect(mktNavActive('/admin/rooms', null)).toBe('rooms')
    expect(mktCrumb('/marketing/tracking')).toEqual({ emoji: '📊', label: 'Tracking Dashboard' })
    expect(mktCrumb('/it-support')).toEqual({ emoji: '🛟', label: 'IT support' })
    expect(mktNavActive('/marketing/new', null)).toBe('projects')
    expect(mktCrumb('/marketing/new')).toEqual({ emoji: '📁', label: 'Projects / New project' })
    expect(mktNavActive('/marketing/projects/TSK-CAR-2610-001', null)).toBe('projects')
    expect(mktNavActive('/marketing/workflows', new URLSearchParams('w=x'))).toBe('workflow')
    expect(mktCrumb('/marketing/workflows')).toEqual({ emoji: '🧩', label: 'Workflow Builder' })
    expect(mktNavActive('/marketing/minutes', null)).toBe('minutes')
    expect(mktCrumb('/marketing/minutes')).toEqual({ emoji: '📝', label: 'Minutes Builder' })
  })

  it('is worn by the Principal’s lens and by a template that opens it — never by HR, Finance or a plain staff', () => {
    expect(isMarketingView({ role: 'marketing' })).toBe(true)
    expect(isMarketingView({ role: 'staff', tabs: ['mkt.overview.view'] })).toBe(true)
    expect(isMarketingView({ role: 'staff', tabs: ['dept.overview.view'] })).toBe(false)
    expect(isMarketingView({ role: 'hr', tabs: ['mkt.overview.view'] })).toBe(false)
    expect(isMarketingView({ role: 'principal' })).toBe(false)
    expect(isMarketingView(null)).toBe(false)
  })
})
