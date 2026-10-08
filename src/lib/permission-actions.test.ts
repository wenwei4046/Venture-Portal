import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GATED_ACTIONS, KEY_ACTIONS, actionsFromJson, actionsFromKeys, canDo, canDoAny, viewKeysOf, type FunctionKey } from './permission-actions'
import type { Action } from './permission-matrix'
import { PERMISSIONS } from './permissions'

const ROLE_DEFAULTS = {
  principal: ['approvals', 'audit_log', 'billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'department_mode',
    'dept_pool', 'dept_reports', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage',
    'member_requests_manage', 'opex', 'override', 'payroll_payouts', 'permissions_manage', 'product_list', 'reconciliation',
    'reports', 'revenue', 'salary_individual', 'settings', 'team', 'team_invite', 'treasury', 'venture_pool', 'view_switch'],
  finance: ['billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'dept_pool', 'dept_reports', 'reconciliation',
    'reports', 'treasury', 'venture_pool'],
  hr: ['claims', 'claims_approve', 'dashboard', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage',
    'member_requests_manage', 'revenue', 'salary_individual', 'team'],
  dept_manager: ['claims', 'dashboard', 'dept_pool', 'dept_reports', 'my_billing', 'opex'],
}

const holder = (role: keyof typeof ROLE_DEFAULTS) => {
  const permissions = ROLE_DEFAULTS[role]
  return { permissions, actions: actionsFromKeys(permissions, role) }
}

describe('KEY_ACTIONS', () => {
  it('is the migration’s permission_key_actions, row for row', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261008200000_permission_actions.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('FROM (VALUES'), sql.indexOf(') AS k(legacy_key'))
    const rows = [...block.matchAll(/\('([a-z_]+)', '([a-z_]+)', '([a-z]+)'\)/g)].map(m => `${m[1]} ${m[2]}.${m[3]}`)
    const twin = Object.entries(KEY_ACTIONS).flatMap(([key, list]) => list.map(fa => `${key} ${fa}`))
    expect(rows.length).toBeGreaterThan(70)
    expect([...twin].sort()).toEqual([...rows].sort())
  })

  it('names only keys the portal has', () => {
    const keys = new Set<string>([...PERMISSIONS, 'view_switch', 'member_insight'])
    expect(Object.keys(KEY_ACTIONS).filter(k => !keys.has(k))).toEqual([])
  })
})

describe('the shared accounts keep exactly what they had', () => {
  it('the Principal raises, approves, voids and manages everywhere', () => {
    const p = holder('principal')
    for (const [fn, action] of [['treasury', 'create'], ['treasury', 'approve'], ['approvals', 'approve'], ['claims', 'approve'],
      ['team', 'manage'], ['accounts', 'manage'], ['settings', 'manage'], ['billing', 'void']] as const) {
      expect(canDo(p, fn, action), `${fn}.${action}`).toBe(true)
    }
  })

  it('Finance raises and voids in Treasury, approves claims, approves nothing in Treasury', () => {
    const f = holder('finance')
    expect(canDo(f, 'treasury', 'create')).toBe(true)
    expect(canDo(f, 'treasury', 'void')).toBe(true)
    expect(canDo(f, 'claims', 'approve')).toBe(true)
    expect(canDo(f, 'treasury', 'approve')).toBe(false)
    expect(canDo(f, 'approvals', 'approve')).toBe(false)
    expect(canDo(f, 'hr_costing', 'view')).toBe(false)
  })

  it('HR runs payroll, the roster, its titles and ladder, and member services — not logins', () => {
    const h = holder('hr')
    expect(canDo(h, 'hr_costing', 'approve')).toBe(true)
    expect(canDo(h, 'team', 'edit')).toBe(true)
    expect(canDo(h, 'member', 'manage')).toBe(true)
    expect(canDo(h, 'team', 'manage')).toBe(true)
    expect(canDo(h, 'accounts', 'create')).toBe(false)
  })

  it('a department manager reaches their department, never the company', () => {
    const d = holder('dept_manager')
    expect(canDo(d, 'dept_pool', 'view', 'dept')).toBe(true)
    expect(canDo(d, 'dept_pool', 'view')).toBe(false)
    expect(canDo(d, 'my_billing', 'create', 'dept')).toBe(true)
    expect(canDo(d, 'claims', 'approve', 'dept')).toBe(false)
  })
})

describe('canDo', () => {
  const checker = {
    permissions: ['dashboard', 'treasury', 'billing', 'reports'],
    actions: { 'treasury.view': 'all', 'treasury.approve': 'all', 'treasury.export': 'all', 'billing.view': 'all' } as const,
  }

  it('a Finance · Checker approves and exports, never raises', () => {
    expect(canDo(checker, 'treasury', 'approve')).toBe(true)
    expect(canDo(checker, 'treasury', 'export')).toBe(true)
    expect(canDo(checker, 'treasury', 'create')).toBe(false)
    expect(canDo(checker, 'treasury', 'edit')).toBe(false)
    expect(canDo(checker, 'billing', 'create')).toBe(false)
  })

  it('a cell counts only while the function’s own page is open', () => {
    const heldBack = { permissions: ['dashboard'], actions: { 'hr_costing.view': 'all', 'hr_costing.edit': 'all' } as const }
    expect(canDo(heldBack, 'hr_costing', 'edit')).toBe(false)
  })

  it('a reach is at least as far as asked', () => {
    const own = { permissions: ['claims'], actions: { 'claims.create': 'own', 'claims.approve': 'dept' } as const }
    expect(canDo(own, 'claims', 'create', 'own')).toBe(true)
    expect(canDo(own, 'claims', 'create')).toBe(false)
    expect(canDo(own, 'claims', 'approve', 'own')).toBe(true)
    expect(canDo(own, 'claims', 'approve', 'dept')).toBe(true)
    expect(canDo(own, 'claims', 'approve', 'all')).toBe(false)
  })

  it('nobody, or an account loaded before actions existed, may do nothing', () => {
    expect(canDo(null, 'treasury', 'view')).toBe(false)
    expect(canDo({ permissions: ['treasury'] }, 'treasury', 'create')).toBe(false)
  })

  it('canDoAny is OR', () => {
    expect(canDoAny(checker, ['treasury', 'create'], ['treasury', 'approve'])).toBe(true)
    expect(canDoAny(checker, ['treasury', 'create'], ['billing', 'create'])).toBe(false)
  })
})

describe('actionsFromJson', () => {
  it('keeps fn.action → reach and drops the rest', () => {
    expect(actionsFromJson({ 'treasury.create': 'all', 'claims.approve': 'dept', bogus: 'all', 'x.y': 'everything' }))
      .toEqual({ 'treasury.create': 'all', 'claims.approve': 'dept' })
    expect(actionsFromJson(null)).toEqual({})
    expect(actionsFromJson(['treasury.create'])).toEqual({})
  })
})

describe('viewKeysOf', () => {
  it('is every key that allowed the function’s View', () => {
    expect(viewKeysOf('treasury')).toEqual(['treasury'])
    expect(viewKeysOf('accounts')).toEqual(['team_invite', 'permissions_manage'])
    expect(viewKeysOf('member')).toEqual(['member_requests_manage', 'member_memos_manage'])
    expect(viewKeysOf('revenue_app')).toEqual(['member_portal', 'member_insight', 'member_memos'])
    // Department mode switches a department; it never opened Settings.
    expect(viewKeysOf('settings')).toEqual(['settings'])
    expect(viewKeysOf('view_switch')).toEqual(['view_switch'])
  })

  it('a function’s actions need one of them — Department mode alone manages no Settings page', () => {
    const modeOnly = { permissions: ['department_mode'], actions: actionsFromKeys(['department_mode'], 'staff') }
    expect(modeOnly.actions).toEqual({ 'settings.manage': 'all' })
    expect(canDo(modeOnly, 'settings', 'manage')).toBe(false)
  })
})

describe('GATED_ACTIONS', () => {
  // Every requireAction / requireAnyAction / requirePayrollPayoutsAction /
  // canDo / canDoAny in the app, and the least reach any of them asks.
  const scan = (): Record<string, string> => {
    const REACH: Record<string, number> = { own: 1, dept: 2, all: 3 }
    const asked: Record<string, string> = {}
    const note = (fn: string, action: string, scope = 'all') => {
      const key = `${fn}.${action}`
      if (!asked[key] || REACH[scope] < REACH[asked[key]]) asked[key] = scope
    }
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return walk(path)
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
    })
    for (const file of walk(resolve(process.cwd(), 'src'))) {
      if (/lib[\/](auth|permission-actions)\.ts$/.test(file)) continue
      const s = readFileSync(file, 'utf8')
      for (const m of s.matchAll(/requireAction\(\s*'(\w+)',\s*'(\w+)'(?:,\s*'(\w+)')?\s*\)/g)) note(m[1], m[2], m[3])
      for (const m of s.matchAll(/(?:requireAnyAction|requirePayrollPayoutsAction|canDoAny)\(([^)]*)\)/g)) {
        for (const p of m[1].matchAll(/\[\s*'(\w+)',\s*'(\w+)'(?:,\s*'(\w+)')?\s*\]/g)) note(p[1], p[2], p[3])
      }
      for (const m of s.matchAll(/canDo\(\s*[\w.]+,\s*["'](\w+)["'],\s*["'](\w+)["'](?:,\s*["'](\w+)["'])?\s*\)/g)) note(m[1], m[2], m[3])
    }
    return asked
  }

  it('is every action a gate asks for, at the least reach asked', () => {
    expect(scan()).toEqual(GATED_ACTIONS)
  })

  it('asks only for actions a key can give — the shared accounts keep every gate they passed', () => {
    const given = new Set(Object.values(KEY_ACTIONS).flat())
    expect(Object.keys(GATED_ACTIONS).filter(fa => !given.has(fa as `${FunctionKey}.${Action}`))).toEqual([])
  })
})
