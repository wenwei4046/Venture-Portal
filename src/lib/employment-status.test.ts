import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTRACT_MONTH_CHOICES,
  EMPLOYMENT_STATUSES,
  NOTICE_DAYS,
  NOT_SET,
  REMINDER_DAYS,
  REMINDER_HINT,
  ackWords,
  answeredReminder,
  contractEnd,
  dayAfter,
  daysFrom,
  employmentStatusOf,
  isDay,
  monthsLabel,
  probationEnd,
  reminderAcknowledged,
  reminderDue,
  reminderOf,
  statusChip,
  statusColumns,
  statusLine,
  termEndLine,
  whenLabel,
} from './employment-status'

describe('probationEnd — the database’s probation_end to the day', () => {
  it('is the hire date plus the months, less a day', () => {
    expect(probationEnd('2026-10-01', 3)).toBe('2026-12-31')
    expect(probationEnd('2026-08-01', 3)).toBe('2026-10-31')
    expect(probationEnd('2026-10-15', 6)).toBe('2027-04-14')
    expect(probationEnd('2026-12-01', 1)).toBe('2026-12-31')
  })

  it('adds months the way Postgres does at a month’s end (the dry run on production, 2026-10-23)', () => {
    // (DATE '2026-01-31' + make_interval(months => 1))::date - 1 = 2026-02-27; Nov 30 + 3 months → 27 Feb 2027.
    expect(probationEnd('2026-01-31', 1)).toBe('2026-02-27')
    expect(probationEnd('2026-11-30', 3)).toBe('2027-02-27')
    expect(probationEnd('2028-01-31', 1)).toBe('2028-02-28')
  })

  it('is nothing without a hire date or a period', () => {
    expect(probationEnd(null, 3)).toBeNull()
    expect(probationEnd('2026-10-01', null)).toBeNull()
    expect(probationEnd('2026-10-01', 0)).toBeNull()
    expect(probationEnd('01/10/2026', 3)).toBeNull()
  })

  it('is the arithmetic the migration generates the column with', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261024214500_people_employment_status.sql'), 'utf8')
    expect(sql).toMatch(/\(hire_date \+ make_interval\(months => probation_months::integer\)\)::date - 1/)
  })
})

// Contract (2026-10-24 — the user: "can add with one is Contract, then need pick time period as well, 6 month, 12
// month, 18, 24, until 36").
describe('contractEnd — the database’s contract_end to the day', () => {
  it('is the hire date plus the months, less a day — the probation’s count', () => {
    expect(contractEnd('2026-10-01', 12)).toBe('2027-09-30')
    expect(contractEnd('2026-10-01', 6)).toBe('2027-03-31')
    expect(contractEnd('2026-03-01', 36)).toBe('2029-02-28')
    expect(contractEnd('2026-01-31', 6)).toBe('2026-07-30')
    expect(contractEnd('2026-08-31', 18)).toBe('2028-02-28')
    expect(contractEnd(null, 12)).toBeNull()
  })

  it('is the arithmetic the migration generates the column with, and offers the user’s six periods', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261025013000_people_contract_status.sql'), 'utf8')
    expect(sql).toMatch(/\(hire_date \+ make_interval\(months => contract_months::integer\)\)::date - 1/)
    expect(sql).toContain('contract_months BETWEEN 1 AND 36')
    expect([...CONTRACT_MONTH_CHOICES]).toEqual([6, 12, 18, 24, 30, 36])
  })

  // Renew (2026-10-24 — "按一下 renew，就可以再选一次是几个月"): the contract they are on now counts from its own first day.
  it('counts a renewed contract from its first day, as the column does since 20261025052000', () => {
    expect(contractEnd('2027-10-01', 12)).toBe('2028-09-30')
    expect(contractEnd('2027-01-31', 1)).toBe('2027-02-27')
    expect(contractEnd('2028-02-29', 12)).toBe('2029-02-27')
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261025052000_people_contract_renew.sql'), 'utf8')
    expect(sql).toMatch(/\(coalesce\(contract_start, hire_date\) \+ make_interval\(months => contract_months::integer\)\)::date - 1/)
  })
})

describe('a day', () => {
  it('isDay takes a real YYYY-MM-DD only', () => {
    expect(isDay('2026-10-24')).toBe(true)
    expect(isDay('2028-02-29')).toBe(true)
    expect(isDay('2027-02-29')).toBe(false)
    expect(isDay('2026-13-01')).toBe(false)
    expect(isDay('24/10/2026')).toBe(false)
    expect(isDay('')).toBe(false)
    expect(isDay(null)).toBe(false)
  })

  it('dayAfter crosses a month’s, a year’s and a leap February’s end', () => {
    expect(dayAfter('2027-09-30')).toBe('2027-10-01')
    expect(dayAfter('2026-12-31')).toBe('2027-01-01')
    expect(dayAfter('2028-02-28')).toBe('2028-02-29')
    expect(dayAfter('2027-02-28')).toBe('2027-03-01')
  })
})

// Two reminders (2026-10-24 — the user: "need 30 days and 15 days before remind, 2 reminder, then for probation need same
// as well"): a probation's end and a contract's alike.
describe('the reminders', () => {
  const today = '2026-10-23'

  it('the first 30 days before the end, the second 15 days before — and open past the end', () => {
    expect(REMINDER_DAYS).toEqual([30, 15])
    expect(NOTICE_DAYS).toBe(30)
    expect(reminderOf('2026-11-23', today)).toBeNull() // 31 days
    expect(reminderOf('2026-11-22', today)).toBe(30) // 30 days: the first
    expect(reminderOf('2026-11-08', today)).toBe(30) // 16 days
    expect(reminderOf('2026-11-07', today)).toBe(15) // 15 days: the second
    expect(reminderOf('2026-10-23', today)).toBe(15) // today
    expect(reminderOf('2026-09-30', today)).toBe(15) // ended, still open
    expect(reminderOf(null, today)).toBeNull()
    expect(reminderDue('2026-11-22', today)).toBe(true)
    expect(reminderDue('2026-11-23', today)).toBe(false)
    expect(reminderDue(null, today)).toBe(false)
    expect(REMINDER_HINT).toBe('HR is reminded 30 and 15 days before.')
  })

  it('an acknowledgement answers the reminder that stood on the office’s day it was given — the first’s never the second', () => {
    const end = '2026-11-22'
    const first = { ackEnd: end, ackAt: '2026-10-25T03:00:00Z' } // 28 days before
    const second = { ackEnd: end, ackAt: '2026-11-07T03:00:00Z' } // 15 days before
    expect(answeredReminder(end, first)).toBe(30)
    expect(answeredReminder(end, second)).toBe(15)
    // 00:30 on 7 Nov the office's time is 6 Nov by UTC's clock: the office's day decides.
    expect(answeredReminder(end, { ackEnd: end, ackAt: '2026-11-06T16:30:00Z' })).toBe(15)
    expect(answeredReminder(end, { ackEnd: '2026-10-01', ackAt: '2026-09-20T03:00:00Z' })).toBeNull() // for another end
    expect(answeredReminder(end, { ackEnd: null, ackAt: null })).toBeNull()
    // The first acknowledged: done until the second opens — then it waits again.
    expect(reminderAcknowledged(end, first, '2026-10-30')).toBe(true)
    expect(reminderAcknowledged(end, first, '2026-11-07')).toBe(false)
    expect(reminderAcknowledged(end, second, '2026-11-07')).toBe(true)
    expect(reminderAcknowledged(end, second, '2026-11-30')).toBe(true)
    expect(ackWords(end, first, '2026-10-30')).toBe('Acknowledged')
    expect(ackWords(end, first, '2026-11-07')).toBe('30-day reminder acknowledged')
    expect(ackWords(end, second, '2026-11-07')).toBe('Acknowledged')
    expect(ackWords(end, { ackEnd: null, ackAt: null }, '2026-11-07')).toBeNull()
  })

  it('counts whole days, and says them', () => {
    expect(daysFrom(today, '2026-11-01')).toBe(9)
    expect(daysFrom(today, '2026-10-20')).toBe(-3)
    expect(whenLabel('2026-11-01', today)).toBe('in 9 days')
    expect(whenLabel('2026-10-24', today)).toBe('tomorrow')
    expect(whenLabel('2026-10-23', today)).toBe('today')
    expect(whenLabel('2026-10-22', today)).toBe('yesterday')
    expect(whenLabel('2026-10-20', today)).toBe('3 days ago')
    expect(termEndLine('2026-11-01', today)).toBe('Ends 1 Nov 2026 · in 9 days')
    expect(termEndLine('2026-10-20', today)).toBe('Ended 20 Oct 2026 · 3 days ago')
  })
})

describe('the chip an active person wears', () => {
  const today = '2026-10-23'

  it('names the status — and Active for a reader not shown it', () => {
    expect(statusChip({ status: 'permanent' }, today)).toEqual({ label: 'Permanent', tone: 'ledger' })
    expect(statusChip({ status: 'part_time' }, today)).toEqual({ label: 'Part time', tone: 'info' })
    expect(statusChip({ status: null }, today)).toMatchObject({ label: NOT_SET, tone: 'plain', title: 'Employment status not set — Probation, Contract, Permanent or Part time, on their page' })
    expect(statusChip({ status: undefined }, today)).toEqual({ label: 'Active', tone: 'ledger' })
  })

  it('reads Contract on peach, its end in the hint — and how near, from its first reminder on (2026-10-24)', () => {
    expect(statusChip({ status: 'contract', contractEnd: '2027-09-30' }, today)).toEqual({ label: 'Contract', tone: 'runOn', title: 'Contract ends 30 Sep 2027 · in 342 days' })
    expect(statusChip({ status: 'contract', contractEnd: '2026-11-22' }, today)).toEqual({ label: 'Contract · 30d left', tone: 'runOn', title: 'Contract ends 22 Nov 2026 · in 30 days' })
    expect(statusChip({ status: 'contract', contractEnd: '2026-10-25' }, today).label).toBe('Contract · 2d left')
    const acked = statusChip({ status: 'contract', contractEnd: '2026-10-30', ack: { ackEnd: '2026-10-30', ackAt: '2026-10-22T03:00:00Z', ackName: 'LI SEAN' } }, today)
    expect(acked.title).toBe('Contract ends 30 Oct 2026 · in 7 days — Acknowledged by LI SEAN')
    expect(statusChip({ status: 'contract', contractEnd: null }, today)).toMatchObject({ label: 'Contract', title: 'Contract — its end is counted from the hire date, which is missing' })
  })

  it('reads Probation, then how near its end from its first reminder — 30 days before', () => {
    expect(statusChip({ status: 'probation', probationEnd: '2026-12-31' }, today)).toMatchObject({ label: 'Probation', tone: 'alert', title: 'Probation ends 31 Dec 2026 · in 69 days' })
    expect(statusChip({ status: 'probation', probationEnd: '2026-11-23' }, today).label).toBe('Probation')
    expect(statusChip({ status: 'probation', probationEnd: '2026-11-22' }, today).label).toBe('Probation · 30d left')
    expect(statusChip({ status: 'probation', probationEnd: '2026-11-01' }, today).label).toBe('Probation · 9d left')
    expect(statusChip({ status: 'probation', probationEnd: '2026-10-23' }, today).label).toBe('Probation · ends today')
    const ended = statusChip({ status: 'probation', probationEnd: '2026-10-20', ack: { ackEnd: '2026-10-20', ackAt: '2026-10-21T03:00:00Z', ackName: 'LI SEAN' } }, today)
    expect(ended.label).toBe('Probation · ended')
    expect(ended.title).toBe('Probation ended 20 Oct 2026 · 3 days ago — Acknowledged by LI SEAN')
    // Only the first reminder acknowledged, once the second stands: the hint says which.
    const second = statusChip({ status: 'probation', probationEnd: '2026-11-01', ack: { ackEnd: '2026-11-01', ackAt: '2026-10-05T03:00:00Z', ackName: 'LI SEAN' } }, today)
    expect(second.title).toBe('Probation ends 1 Nov 2026 · in 9 days — 30-day reminder acknowledged by LI SEAN')
    expect(statusChip({ status: 'probation', probationEnd: null }, today).label).toBe('Probation')
  })
})

describe('what a form sends', () => {
  it('a status, and a period only for a probation or a contract — the other’s cleared', () => {
    expect(statusColumns('permanent', '3', '12')).toEqual({ employment_status: 'permanent', probation_months: null, contract_months: null })
    expect(statusColumns('part_time', undefined, undefined)).toEqual({ employment_status: 'part_time', probation_months: null, contract_months: null })
    expect(statusColumns('probation', '3', '12')).toEqual({ employment_status: 'probation', probation_months: 3, contract_months: null })
    expect(statusColumns(' probation ', 6, null)).toEqual({ employment_status: 'probation', probation_months: 6, contract_months: null })
    expect(statusColumns('contract', '3', '12')).toEqual({ employment_status: 'contract', probation_months: null, contract_months: 12 })
    expect(statusColumns('contract', null, 36)).toEqual({ employment_status: 'contract', probation_months: null, contract_months: 36 })
  })

  it('refuses in words', () => {
    expect(() => statusColumns('', '3', null)).toThrow('Pick the employment status — Probation, Contract, Permanent or Part time.')
    expect(() => statusColumns('freelance', '3', null)).toThrow('Pick the employment status')
    expect(() => statusColumns('probation', '', '12')).toThrow('Pick the probation period.')
    expect(() => statusColumns('probation', '25', null)).toThrow('Pick the probation period.')
    expect(() => statusColumns('probation', '2.5', null)).toThrow('Pick the probation period.')
    expect(() => statusColumns('contract', '3', '')).toThrow('Pick the contract period.')
    expect(() => statusColumns('contract', '3', '37')).toThrow('Pick the contract period.')
    expect(() => statusColumns('contract', null, 0)).toThrow('Pick the contract period.')
  })

  it('knows the four the database allows', () => {
    expect(EMPLOYMENT_STATUSES).toEqual(['probation', 'contract', 'permanent', 'part_time'])
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20261025013000_people_contract_status.sql'), 'utf8')
    expect(sql).toContain("employment_status IN ('probation', 'contract', 'permanent', 'part_time')")
    expect(employmentStatusOf('contract')).toBe('contract')
    expect(employmentStatusOf('Permanent')).toBeNull()
  })
})

describe('the words', () => {
  it('a period and a status line', () => {
    expect(monthsLabel(1)).toBe('1 month')
    expect(monthsLabel(3)).toBe('3 months')
    expect(statusLine('probation', 3, '2026-12-31')).toBe('Probation · 3 months · ends 31 Dec 2026')
    expect(statusLine('probation', 3, null)).toBe('Probation · 3 months')
    expect(statusLine('contract', 12, '2027-09-30')).toBe('Contract · 12 months · ends 30 Sep 2027')
    expect(statusLine('contract', 24, null)).toBe('Contract · 24 months')
    expect(statusLine('permanent', null, null)).toBe('Permanent')
    expect(statusLine(null, null, null)).toBeNull()
  })
})
