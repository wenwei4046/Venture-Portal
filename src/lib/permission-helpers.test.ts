import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// 2026-10-09 (20261009070000): the helpers every row policy and permission
// check asks are plpgsql. A SECURITY DEFINER LANGUAGE sql function is never
// inlined and its body is planned again on EVERY call — has_any_action cost
// 6.4 ms a call that way, 0.78 ms as plpgsql — and a policy calls its helper
// once per statement. Redefining one of them as SQL brings that back.

const HELPERS = [
  'current_user_department_id', 'current_user_segment', 'current_permissions', 'current_actions',
  'current_sensitive_fields', 'has_perm', 'has_scope', 'has_action', 'has_any_action', 'may_write',
  'approvable_types', 'member_is_manager', 'sees_sensitive',
]

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations')
const PLANNED_ONCE = '20261009070000_permission_checks_planned_once.sql'
const sqlOf = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/\r\n/g, '\n')

describe('the permission helpers are planned once', () => {
  it('the migration turns every one of them into plpgsql', () => {
    const sql = sqlOf(PLANNED_ONCE)
    for (const name of HELPERS) expect(sql).toMatch(new RegExp(`to_plpgsql\\('public\\.${name}\\(`))
  })

  it('no later migration writes one of them in SQL again', () => {
    const later = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql') && f > PLANNED_ONCE).sort()
    const backToSql = later.flatMap(f =>
      [...sqlOf(f).matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\$(\w*)\$[\s\S]*?\$\3\$([^;]*);/gi)]
        .filter(m => HELPERS.includes(m[1].toLowerCase()))
        .filter(m => /LANGUAGE\s+sql\b/i.test(`${m[2]} ${m[4]}`))
        .map(m => `${f}: ${m[1]}`),
    )
    expect(backToSql).toEqual([])
  })
})
