import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APPROVAL_DOMAIN, approvableTypes, canDecide, canSeeApprovals, decision, type Approver } from './approval-domains'
import { actionsFromKeys } from './permission-actions'

const PRINCIPAL_KEYS = ['approvals', 'treasury', 'override', 'billing', 'hr_costing', 'director_salary', 'claims', 'dashboard']
const account = (id: string, role: string, keys: string[]): Approver => ({ id, role, permissions: keys, actions: actionsFromKeys(keys, role) })

const principal = account('p', 'principal', PRINCIPAL_KEYS)
const finance = account('f', 'finance', ['treasury', 'billing', 'claims', 'claims_approve', 'dashboard'])
const hr = account('h', 'hr', ['hr_costing', 'director_salary', 'team', 'claims', 'dashboard'])
// Templated people: their cells, and the keys those cells open.
const checker: Approver = {
  id: 'c', role: 'finance', permissions: ['treasury', 'billing', 'reports', 'dashboard'],
  actions: { 'treasury.view': 'all', 'treasury.approve': 'all', 'treasury.export': 'all' },
}
const director: Approver = {
  id: 'd', role: 'staff', permissions: ['approvals_queue', 'treasury', 'reports', 'dashboard'],
  actions: { 'approvals.view': 'all', 'approvals.approve': 'all', 'treasury.view': 'all', 'treasury.approve': 'all' },
}
const office: Approver = {
  id: 'o', role: 'staff', permissions: ['approvals_queue', 'dashboard'],
  actions: { 'approvals.view': 'all' },
}

describe('APPROVAL_DOMAIN', () => {
  it('is the migration’s approval_domain(), type for type', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261009010000_approvals_by_domain.sql'), 'utf8')
    const body = sql.slice(sql.indexOf('FUNCTION public.approval_domain'), sql.indexOf('COMMENT ON FUNCTION public.approval_domain'))
    const fromSql = Object.fromEntries([...body.matchAll(/WHEN '([a-z_]+)' THEN '([a-z_]+)'/g)].map((m) => [m[1], m[2]]))
    const fromTs = Object.fromEntries(Object.entries(APPROVAL_DOMAIN).filter(([, d]) => d !== null))
    expect(fromTs).toEqual(fromSql)
  })
})

describe('who may decide what', () => {
  it('the Principal decides everything, their own included (user 2026-08-06)', () => {
    expect(approvableTypes(principal)).toHaveLength(Object.keys(APPROVAL_DOMAIN).length)
    expect(canDecide(principal, ['payroll_run'], ['p'])).toBe(true)
  })

  it('the shared Finance and HR accounts decide nothing, as before', () => {
    expect(approvableTypes(finance)).toEqual([])
    expect(approvableTypes(hr)).toEqual([])
    expect(canSeeApprovals(finance)).toBe(false)
    expect(canSeeApprovals(hr)).toBe(false)
  })

  it('a Finance · Checker decides Treasury’s requests, nothing of HR’s or a contract', () => {
    const mine = approvableTypes(checker)
    expect(mine).toContain('payment_voucher')
    expect(mine).toContain('new_loan')
    expect(mine).toContain('loan_cancel')
    expect(mine).not.toContain('payroll_run')
    expect(mine).not.toContain('new_contract')
    expect(canSeeApprovals(checker)).toBe(true)
  })

  it('…and never the voucher they raised', () => {
    expect(decision(checker, ['payment_voucher'], ['someone-else'])).toEqual({ may: true })
    expect(decision(checker, ['payment_voucher'], ['c'])).toEqual({ may: false, why: expect.stringMatching(/You raised it/) })
  })

  it('a combined approval needs every type in it and none of its submitters', () => {
    expect(canDecide(checker, ['new_loan', 'payment_voucher'], ['x'])).toBe(true)
    expect(canDecide(checker, ['payment_voucher', 'payroll_run'], ['x'])).toBe(false)
    expect(canDecide(checker, ['new_loan', 'payment_voucher'], ['x', 'c'])).toBe(false)
  })

  it('a Director’s Approvals · Approve reaches the whole queue', () => {
    expect(canDecide(director, ['payroll_run'], ['h'])).toBe(true)
    expect(canDecide(director, ['new_contract'], ['f'])).toBe(true)
  })

  it('the Executive office sees the queue and decides nothing', () => {
    expect(canSeeApprovals(office)).toBe(true)
    expect(approvableTypes(office)).toEqual([])
    expect(decision(office, ['payment_voucher'], ['f'])).toEqual({ may: false, why: expect.stringMatching(/Not yours to decide/) })
  })

  it('a Principal masked as Finance decides nothing in that view', () => {
    const masked: Approver = { ...account('p', 'finance', ['treasury', 'billing']), actualRole: 'principal' }
    expect(approvableTypes(masked)).toEqual([])
  })

  it('nobody decides nothing', () => {
    expect(approvableTypes(null)).toEqual([])
    expect(canSeeApprovals(undefined)).toBe(false)
    expect(decision(null, ['payment_voucher'], [])).toEqual({ may: false, why: 'Sign in to decide' })
  })
})
