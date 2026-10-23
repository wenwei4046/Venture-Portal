import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROBATION_NOTICE_DAYS } from './employment-status'
import { acknowledged, dueReviews, probationsEnding, reviewsFromRow, seesProbationReminders, waitingCount } from './probation-reviews'

const row = (over: Record<string, unknown>) => ({
  id: 'p1', name: 'TEOH CHEA HUAN', firstName: 'CHEA HUAN', lastName: 'TEOH', code: 'HV009', department: 'Revenue Department',
  title: 'Team Leader', hireDate: '2026-08-01', months: 3, endsOn: '2026-10-31', ackEnd: null, ackName: null, ackAt: null, ...over,
})

describe('probation_reviews() as the bell reads it', () => {
  it('names them as the roster does, and keeps the dates', () => {
    const [r] = reviewsFromRow([row({})])
    expect(r).toMatchObject({ id: 'p1', name: 'TEOH CHEA HUAN', code: 'HV009', months: 3, endsOn: '2026-10-31', ackEnd: null })
    expect(reviewsFromRow([row({ firstName: 'WEN WEI', lastName: 'LOO', name: 'LOO WEN WEI' })])[0].name).toBe('LOO WEN WEI')
  })

  it('drops what is not a row', () => {
    expect(reviewsFromRow(null)).toEqual([])
    expect(reviewsFromRow([{ name: 'no id' }, 7, row({ id: 'p2' })]).map(r => r.id)).toEqual(['p2'])
  })
})

describe('what the bell lists and counts', () => {
  const today = '2026-10-23'
  const list = reviewsFromRow([
    row({ id: 'later', endsOn: '2026-12-31' }), // 69 days: not yet
    row({ id: 'soon', endsOn: '2026-11-01' }), // 9 days
    row({ id: 'acked', endsOn: '2026-10-28', ackEnd: '2026-10-28', ackName: 'LI SEAN' }),
    row({ id: 'ended', endsOn: '2026-10-20' }), // 3 days ago, still open
    row({ id: 'extended', endsOn: '2026-11-05', ackEnd: '2026-10-05' }), // acknowledged for an older end
    row({ id: 'no-hire', endsOn: null, hireDate: null }),
  ])

  it('ending within 14 days or past — waiting ones first, soonest first', () => {
    expect(dueReviews(list, today).map(r => r.id)).toEqual(['ended', 'soon', 'extended', 'acked'])
  })

  it('counts only the ones still waiting for Acknowledge', () => {
    expect(waitingCount(list, today)).toBe(3)
  })

  it('an acknowledgement counts for the end it was given for', () => {
    expect(acknowledged({ endsOn: '2026-10-28', ackEnd: '2026-10-28' })).toBe(true)
    expect(acknowledged({ endsOn: '2026-11-05', ackEnd: '2026-10-05' })).toBe(false)
    expect(acknowledged({ endsOn: null, ackEnd: null })).toBe(false)
  })
})

describe('who is told', () => {
  const hr = { permissions: ['team'], actions: { 'team.view': 'all', 'team.edit': 'all' } as const, closed: [] as string[] }

  it('whoever may edit a person on their page', () => {
    expect(seesProbationReminders(hr)).toBe(true)
    expect(seesProbationReminders({ ...hr, actions: { 'team.view': 'all' } })).toBe(false)
  })

  it('not while viewing as somebody, nor with the page’s Edit box unticked', () => {
    expect(seesProbationReminders({ ...hr, viewingAs: { id: 'x', name: 'X' } })).toBe(false)
    expect(seesProbationReminders({ ...hr, closed: ['hr.people.edit'] })).toBe(false)
  })
})

// The phone (2026-10-23, mig 20261024223000 — the user: "HR 手机 app 里的提醒和推送，以及 HR Overview 首页上的数字"); its window 15 days since mig 20261025010000.
describe('the sweep and the summary lines', () => {
  it('the hourly sweep tells within the window the bell lists — the SQL keeps PROBATION_NOTICE_DAYS', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261025010000_probation_notice_15_days.sql'), 'utf8')
    expect(sql).toContain(`s.probation_end - ${PROBATION_NOTICE_DAYS} <= v_today AND v_today <= s.probation_end`)
  })

  it('a summary line’s part: one probation, many probations', () => {
    expect(probationsEnding(1)).toBe('1 probation ending')
    expect(probationsEnding(3)).toBe('3 probations ending')
  })
})
