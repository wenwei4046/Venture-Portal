import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REMINDER_DAYS } from './employment-status'
import { ackLine, acknowledged, dueReviews, endingWords, reviewsFromRow, seesTermReminders, waitingCount } from './term-reviews'

const row = (over: Record<string, unknown>) => ({
  id: 'p1', name: 'TEOH CHEA HUAN', firstName: 'CHEA HUAN', lastName: 'TEOH', code: 'HV009', department: 'Revenue Department',
  title: 'Team Leader', hireDate: '2026-08-01', months: 3, endsOn: '2026-10-31', ackEnd: null, ackName: null, ackAt: null, ...over,
})

describe('probation_reviews() and contract_reviews() as the bell reads them', () => {
  it('names them as the roster does, keeps the dates, and says which term', () => {
    const [r] = reviewsFromRow([row({})], 'probation')
    expect(r).toMatchObject({ kind: 'probation', id: 'p1', name: 'TEOH CHEA HUAN', code: 'HV009', months: 3, endsOn: '2026-10-31', ackEnd: null })
    expect(reviewsFromRow([row({ firstName: 'WEN WEI', lastName: 'LOO', name: 'LOO WEN WEI' })], 'probation')[0].name).toBe('LOO WEN WEI')
    expect(reviewsFromRow([row({ months: 12, endsOn: '2027-07-31' })], 'contract')[0]).toMatchObject({ kind: 'contract', months: 12, endsOn: '2027-07-31' })
  })

  it('drops what is not a row', () => {
    expect(reviewsFromRow(null, 'contract')).toEqual([])
    expect(reviewsFromRow([{ name: 'no id' }, 7, row({ id: 'p2' })], 'probation').map(r => r.id)).toEqual(['p2'])
  })
})

describe('what the bell lists and counts', () => {
  const today = '2026-10-23'
  const list = reviewsFromRow([
    row({ id: 'later', endsOn: '2026-12-31' }), // 69 days: not yet
    row({ id: 'month', endsOn: '2026-11-20' }), // 28 days: the first reminder
    row({ id: 'soon', endsOn: '2026-11-01' }), // 9 days: the second
    row({ id: 'acked', endsOn: '2026-10-28', ackEnd: '2026-10-28', ackName: 'LI SEAN', ackAt: '2026-10-20T02:00:00Z' }), // the second, acknowledged
    row({ id: 'first-only', endsOn: '2026-11-03', ackEnd: '2026-11-03', ackName: 'LI SEAN', ackAt: '2026-10-10T02:00:00Z' }), // 24 days before: the first's
    row({ id: 'ended', endsOn: '2026-10-20' }), // 3 days ago, still open
    row({ id: 'extended', endsOn: '2026-11-05', ackEnd: '2026-10-05', ackAt: '2026-09-28T02:00:00Z' }), // acknowledged for an older end
    row({ id: 'no-hire', endsOn: null, hireDate: null }),
  ], 'probation')

  it('ending within 30 days or past — waiting ones first, soonest first', () => {
    expect(dueReviews(list, today).map(r => r.id)).toEqual(['ended', 'soon', 'first-only', 'extended', 'month', 'acked'])
  })

  it('counts only the ones still waiting for Acknowledge — the first reminder’s acknowledgement does not answer the second', () => {
    expect(waitingCount(list, today)).toBe(5)
  })

  it('an acknowledgement counts for the end and the reminder it was given for', () => {
    expect(acknowledged({ endsOn: '2026-10-28', ackEnd: '2026-10-28', ackAt: '2026-10-20T02:00:00Z' }, today)).toBe(true)
    expect(acknowledged({ endsOn: '2026-11-03', ackEnd: '2026-11-03', ackAt: '2026-10-10T02:00:00Z' }, today)).toBe(false)
    expect(acknowledged({ endsOn: '2026-11-03', ackEnd: '2026-11-03', ackAt: '2026-10-10T02:00:00Z' }, '2026-10-15')).toBe(true)
    expect(acknowledged({ endsOn: '2026-11-05', ackEnd: '2026-10-05', ackAt: '2026-09-28T02:00:00Z' }, today)).toBe(false)
    expect(acknowledged({ endsOn: null, ackEnd: null, ackAt: null }, today)).toBe(false)
  })

  it('says who acknowledged which, and when', () => {
    const [acked, firstOnly] = [list.find(r => r.id === 'acked')!, list.find(r => r.id === 'first-only')!]
    expect(ackLine(acked, today)).toBe('Acknowledged by LI SEAN · 20 Oct')
    expect(ackLine(firstOnly, today, 'D MMM YYYY')).toBe('30-day reminder acknowledged by LI SEAN · 10 Oct 2026')
    expect(ackLine(list.find(r => r.id === 'soon')!, today)).toBeNull()
  })
})

describe('who is told', () => {
  const hr = { permissions: ['team'], actions: { 'team.view': 'all', 'team.edit': 'all' } as const, closed: [] as string[] }

  it('whoever may edit a person on their page', () => {
    expect(seesTermReminders(hr)).toBe(true)
    expect(seesTermReminders({ ...hr, actions: { 'team.view': 'all' } })).toBe(false)
  })

  it('not while viewing as somebody, nor with the page’s Edit box unticked', () => {
    expect(seesTermReminders({ ...hr, viewingAs: { id: 'x', name: 'X' } })).toBe(false)
    expect(seesTermReminders({ ...hr, closed: ['hr.people.edit'] })).toBe(false)
  })
})

// The phone (2026-10-23, mig 20261024223000 — the user: "HR 手机 app 里的提醒和推送，以及 HR Overview 首页上的数字"); a
// contract too, 30 and again 15 days before, since mig 20261025046500.
describe('the sweep and the summary lines', () => {
  it('the hourly sweep tells on the days the bell lists — the SQL keeps REMINDER_DAYS', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261025046500_people_term_end_reminders.sql'), 'utf8')
    const [first, second] = REMINDER_DAYS
    expect(sql).toContain(`WHERE term.ends_on - ${first} <= v_today AND v_today <= term.ends_on`)
    expect(sql).toContain(`v_stage := CASE WHEN v_left <= ${second} THEN ${second} ELSE ${first} END;`)
    expect(sql).toContain(`(CASE WHEN r.ends_on - (r.ack_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date <= ${second} THEN ${second} ELSE ${first} END) <= v_stage`)
  })

  it('a summary line’s part: one, many — a probation’s or a contract’s', () => {
    expect(endingWords('probation', 1)).toBe('1 probation ending')
    expect(endingWords('probation', 3)).toBe('3 probations ending')
    expect(endingWords('contract', 1)).toBe('1 contract ending')
    expect(endingWords('contract', 2)).toBe('2 contracts ending')
  })
})
