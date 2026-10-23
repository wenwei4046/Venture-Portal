import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  CONTRACT_MONTH_CHOICES,
  EMPLOYMENT_STATUSES,
  NOT_SET,
  PROBATION_NOTICE_DAYS,
  contractEnd,
  daysFrom,
  employmentStatusOf,
  monthsLabel,
  probationDue,
  probationEnd,
  probationEndLine,
  statusChip,
  statusColumns,
  statusLine,
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
})

describe('the reminder’s window', () => {
  const today = '2026-10-23'

  it('opens 15 days before the end (the user, 2026-10-24) and stays open past it', () => {
    expect(PROBATION_NOTICE_DAYS).toBe(15)
    expect(probationDue('2026-11-06', today)).toBe(true) // 14 days
    expect(probationDue('2026-11-07', today)).toBe(true) // 15 days
    expect(probationDue('2026-11-08', today)).toBe(false) // 16 days
    expect(probationDue('2026-10-23', today)).toBe(true)
    expect(probationDue('2026-09-30', today)).toBe(true)
    expect(probationDue(null, today)).toBe(false)
  })

  it('counts whole days, and says them', () => {
    expect(daysFrom(today, '2026-11-01')).toBe(9)
    expect(daysFrom(today, '2026-10-20')).toBe(-3)
    expect(whenLabel('2026-11-01', today)).toBe('in 9 days')
    expect(whenLabel('2026-10-24', today)).toBe('tomorrow')
    expect(whenLabel('2026-10-23', today)).toBe('today')
    expect(whenLabel('2026-10-22', today)).toBe('yesterday')
    expect(whenLabel('2026-10-20', today)).toBe('3 days ago')
    expect(probationEndLine('2026-11-01', today)).toBe('Ends 1 Nov 2026 · in 9 days')
    expect(probationEndLine('2026-10-20', today)).toBe('Ended 20 Oct 2026 · 3 days ago')
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

  it('reads Contract on peach, its end in the hint — however near (nobody is reminded of it)', () => {
    expect(statusChip({ status: 'contract', contractEnd: '2027-09-30' }, today)).toEqual({ label: 'Contract', tone: 'runOn', title: 'Contract ends 30 Sep 2027 · in 342 days' })
    expect(statusChip({ status: 'contract', contractEnd: '2026-10-25' }, today).label).toBe('Contract')
    expect(statusChip({ status: 'contract', contractEnd: null }, today)).toMatchObject({ label: 'Contract', title: 'Contract — its end is counted from the hire date, which is missing' })
  })

  it('reads Probation, then how near its end once HR is being told', () => {
    expect(statusChip({ status: 'probation', probationEnd: '2026-12-31' }, today)).toMatchObject({ label: 'Probation', tone: 'alert', title: 'Probation ends 31 Dec 2026 · in 69 days' })
    expect(statusChip({ status: 'probation', probationEnd: '2026-11-01' }, today).label).toBe('Probation · 9d left')
    expect(statusChip({ status: 'probation', probationEnd: '2026-10-23' }, today).label).toBe('Probation · ends today')
    const ended = statusChip({ status: 'probation', probationEnd: '2026-10-20', probationAcked: true, ackName: 'LI SEAN' }, today)
    expect(ended.label).toBe('Probation · ended')
    expect(ended.title).toBe('Probation ended 20 Oct 2026 · 3 days ago — Acknowledged by LI SEAN')
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
