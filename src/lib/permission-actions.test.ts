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
    'reports', 'revenue', 'salary_individual', 'settings', 'team', 'team_invite', 'treasury', 'venture_pool', 'view_switch',
    'crm_manage'],
  finance: ['billing', 'categories', 'claims', 'claims_approve', 'dashboard', 'dept_pool', 'dept_reports', 'reconciliation',
    'reports', 'treasury', 'venture_pool'],
  hr: ['claims', 'claims_approve', 'dashboard', 'director_pool', 'director_salary', 'hr_costing', 'member_memos_manage',
    'member_requests_manage', 'revenue', 'salary_individual', 'team'],
}

const holder = (role: keyof typeof ROLE_DEFAULTS) => {
  const permissions = ROLE_DEFAULTS[role]
  return { permissions, actions: actionsFromKeys(permissions) }
}

describe('KEY_ACTIONS', () => {
  it('is the migrations’ permission_key_actions, row for row', () => {
    // Every migration that adds rows to the table (20261008200000, then the
    // approval queue's own key in 20261009010000).
    const dir = resolve(process.cwd(), 'supabase/migrations')
    const rows = readdirSync(dir).sort().flatMap(file => {
      const sql = readFileSync(join(dir, file), 'utf8')
      return [...sql.matchAll(/INSERT INTO public\.permission_key_actions[^;]*;/g)].flatMap(m =>
        [...m[0].matchAll(/\('([a-z_]+)', '([a-z_]+)', '([a-z]+)'\)/g)].map(r => `${r[1]} ${r[2]}.${r[3]}`))
    })
    // …then every row a later migration moved to another key, and every key
    // a later migration retired whole (my_billing, 20261017160000).
    for (const file of readdirSync(dir).sort()) {
      const sql = readFileSync(join(dir, file), 'utf8')
      for (const m of sql.matchAll(/UPDATE public\.permission_key_actions SET legacy_key = '([a-z_]+)' WHERE legacy_key = '([a-z_]+)' AND function_key = '([a-z_]+)' AND action = '([a-z]+)';/g)) {
        const at = rows.indexOf(`${m[2]} ${m[3]}.${m[4]}`)
        if (at >= 0) rows[at] = `${m[1]} ${m[3]}.${m[4]}`
      }
      for (const m of sql.matchAll(/DELETE FROM public\.permission_key_actions WHERE legacy_key = '([a-z_]+)';/g)) {
        for (let at = rows.length - 1; at >= 0; at--) if (rows[at].startsWith(`${m[1]} `)) rows.splice(at, 1)
      }
    }
    const twin = Object.entries(KEY_ACTIONS).flatMap(([key, list]) => list.map(fa => `${key} ${fa}`))
    expect(rows.length).toBeGreaterThan(70)
    expect([...twin].sort()).toEqual([...rows].sort())
  })

  it('names only keys the portal has', () => {
    const keys = new Set<string>([...PERMISSIONS, 'view_switch', 'member_insight'])
    expect(Object.keys(KEY_ACTIONS).filter(k => !keys.has(k))).toEqual([])
  })
})

describe('the CRM (20261010020000)', () => {
  it('the shared Principal login runs the Control panel, as the CRM gave it', () => {
    const p = holder('principal')
    expect([canDo(p, 'crm', 'view'), canDo(p, 'crm', 'edit'), canDo(p, 'crm', 'manage')]).toEqual([true, true, true])
  })

  it('a Revenue Team title works its own line and runs nothing', () => {
    const team = { permissions: ['member_portal', 'member_crm'], actions: { 'crm.view': 'own', 'crm.edit': 'own' } as const }
    expect([canDo(team, 'crm', 'view', 'own'), canDo(team, 'crm', 'edit', 'own'), canDo(team, 'crm', 'view'), canDo(team, 'crm', 'manage')])
      .toEqual([true, true, false, false])
  })

  it('a cell alone opens nothing without one of the CRM’s keys', () => {
    expect(viewKeysOf('crm')).toEqual(['member_crm', 'crm_manage'])
    expect(canDo({ permissions: [], actions: { 'crm.view': 'all' } }, 'crm', 'view')).toBe(false)
  })

  it('HR and Finance have no CRM', () => {
    for (const role of ['hr', 'finance'] as const) expect(canDo(holder(role), 'crm', 'view', 'own'), role).toBe(false)
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

  it('HR runs payroll, the roster, its titles and ladder, and member services — not logins, and approves no run', () => {
    const h = holder('hr')
    expect(canDo(h, 'hr_costing', 'edit')).toBe(true)
    expect(canDo(h, 'hr_costing', 'approve')).toBe(false)
    expect(canDo(h, 'director_salary', 'approve')).toBe(false)
    expect(canDo(h, 'team', 'edit')).toBe(true)
    expect(canDo(h, 'member', 'manage')).toBe(true)
    expect(canDo(h, 'team', 'manage')).toBe(true)
    expect(canDo(h, 'accounts', 'create')).toBe(false)
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
    const modeOnly = { permissions: ['department_mode'], actions: actionsFromKeys(['department_mode']) }
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
      // A write gate names its page(s) first (2026-10-11, plan C): one, a list, or a choice between two.
      for (const m of s.matchAll(/requireActionOn\(\s*(?:'[^']+'|\[[^\]]*\]|[^,()]*\?[^,()]*)\s*,\s*'(\w+)',\s*'(\w+)'(?:,\s*'(\w+)')?\s*\)/g)) note(m[1], m[2], m[3])
      for (const m of s.matchAll(/(?:requireAnyActionOn|requirePayrollPayoutsActionOn|canDoAny)\(([^)]*)\)/g)) {
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
