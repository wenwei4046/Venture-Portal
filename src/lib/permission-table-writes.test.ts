import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { KEY_ACTIONS } from './permission-actions'
import { TABLE_WRITES, WRITES_WITHOUT_ACTION, tableWriteRows, type Want, type WriteCommand } from './permission-table-writes'
import { functionScopes } from '@/test/read-paths'

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations')
const THIS_MIGRATION = '20261009020000_writes_ask_for_the_action.sql'
const FUNCTIONS_MIGRATION = '20261009030000_functions_ask_for_the_action.sql'
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const sqlOf = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/\r\n/g, '\n')

/**
 * The DEFINER functions whose check asks for an action (PR3b): the actions
 * `has_any_action` is handed in each one's new check.
 */
const DEFINER_ASKS: Readonly<Record<string, readonly Want[]>> = Object.fromEntries(
  [...sqlOf(FUNCTIONS_MIGRATION).matchAll(
    /swap_check\('public\.([a-z_]+)\([^)]*\)',\n\s+\$q\$[\s\S]*?\$q\$,\n\s+\$q\$[^$]*?has_any_action\(ARRAY\[([^\]]*)\]\)/g,
  )].map(m => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map(a => a[1] as Want)]),
)
/**
 * …as later migrations left them: a function dropped and not made again is
 * gone, and one whose check was swapped (`pg_temp.swap_in`, the Dept Manager
 * going, 20261017160000) asks what its new check asks.
 */
const DEFINER_ASKS_NOW: Readonly<Record<string, readonly Want[]>> = (() => {
  const out: Record<string, readonly Want[]> = { ...DEFINER_ASKS }
  const dropped = new Set<string>()
  for (const f of files.filter(f => f > FUNCTIONS_MIGRATION)) {
    const sql = sqlOf(f)
    for (const m of sql.matchAll(/(DROP FUNCTION IF EXISTS|CREATE OR REPLACE FUNCTION|CREATE FUNCTION) public\.([a-z_]+)\(/g)) {
      if (m[1].startsWith('DROP')) dropped.add(m[2])
      else dropped.delete(m[2])
    }
    for (const m of sql.matchAll(/swap_in\('public\.([a-z_]+)\([^)]*\)',\n\s+\$q\$[\s\S]*?\$q\$,\n\s+\$q\$[^$]*?has_any_action\(ARRAY\[([^\]]*)\]\)/g)) {
      if (m[1] in out) out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(a => a[1] as Want)
    }
  }
  for (const name of dropped) delete out[name]
  return out
})()
/** …of which these also let in whoever may approve the request at hand (`approvable_types()`). */
const DEFINER_LETS_IN_APPROVERS: ReadonlySet<string> = new Set(
  [...sqlOf(FUNCTIONS_MIGRATION).matchAll(
    /swap_check\('public\.([a-z_]+)\([^)]*\)',\n\s+\$q\$[\s\S]*?\$q\$,\n\s+\$q\$([^$]*?)\$q\$\)/g,
  )].filter(m => m[2].includes('approvable_types()')).map(m => m[1]),
)

describe('TABLE_WRITES', () => {
  it('is the migrations’ permission_table_writes, row for row', () => {
    const rows = new Map<string, string[]>()
    for (const f of files) {
      for (const m of sqlOf(f).matchAll(/INSERT INTO public\.permission_table_writes[^;]*;/g)) {
        for (const r of m[0].matchAll(/\('([a-z_0-9]+)', '(INSERT|UPDATE|DELETE)', ARRAY\[([^\]]*)\]\)/g)) {
          rows.set(`${r[1]} ${r[2]}`, [...r[3].matchAll(/'([^']+)'/g)].map(a => a[1]))
        }
      }
    }
    const twin = new Map(tableWriteRows().map(r => [`${r.table} ${r.command}`, r.actions as string[]]))
    expect(rows.size).toBeGreaterThan(300)
    expect(Object.fromEntries([...twin].sort())).toEqual(Object.fromEntries([...rows].sort()))
  })

  it('asks only for actions a key can give — the shared accounts can write wherever their pages do', () => {
    const given = new Set<string>(Object.values(KEY_ACTIONS).flat())
    const asked = new Set(tableWriteRows().flatMap(r => r.actions.map(a => a.split(':')[0])))
    expect([...asked].filter(fa => !given.has(fa))).toEqual([])
  })

  it('asks for a reach only where the function has it', () => {
    const scopes = new Map(Object.entries(functionScopes()))
    expect(scopes.size).toBeGreaterThan(20)
    const reaches = tableWriteRows().flatMap(r => r.actions.filter(a => a.includes(':')))
    expect(reaches.filter(a => {
      const [fa, scope] = a.split(':')
      return !(scopes.get(fa.split('.')[0]) ?? []).includes(scope)
    })).toEqual([])
  })

  it('names its exceptions where the migration’s guard does', () => {
    const guard = sqlOf(THIS_MIGRATION)
    const listed = /AND p\.tablename NOT IN \(([^)]*)\)/.exec(guard)?.[1] ?? ''
    expect([...listed.matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]).sort()).toEqual(Object.keys(WRITES_WITHOUT_ACTION).sort())
  })

  it('no row policy written after 20261009040000 asks for the kind of account', () => {
    // Own / Dept / All are the cell's reach (has_action(fn, action, scope));
    // current_user_role() names the hidden kind a template starts from.
    const later = files.filter(f => f > '20261009040000_own_and_dept_reach_the_rows.sql')
    const asked = later.flatMap(f => [...sqlOf(f).matchAll(/(?:CREATE|ALTER) POLICY\s+(\S+)[^;]*?current_user_role\s*\(/gi)]
      .map(m => `${f} ${m[1]}`))
    expect(asked).toEqual([])
  })

  it('a later migration that opens a table to a domain registers what it asks', () => {
    // CREATE POLICY … FOR INSERT|UPDATE|DELETE|ALL … has_scope / current_user_role
    // / has_perm / has_action, after this migration: the table must be in
    // TABLE_WRITES (or WRITES_WITHOUT_ACTION) — this migration's guard has
    // run once and will not see it.
    const later = files.filter(f => f > THIS_MIGRATION)
    const opened = later.flatMap(f => [...sqlOf(f).matchAll(
      /CREATE POLICY\s+\S+\s+ON\s+(?:public\.)?([a-z_0-9]+)(?:\s+AS\s+PERMISSIVE)?\s+FOR\s+(?:INSERT|UPDATE|DELETE|ALL)\b[^;]*?\b(?:has_scope|current_user_role|has_perm|has_action)\(/gi,
    )].map(m => m[1]))
    expect(opened.filter(t => !(t in TABLE_WRITES) && !(t in WRITES_WITHOUT_ACTION))).toEqual([])
  })
})

// ── Every write the app makes asks for something the database lets in ─────────
// Each `.from('t').insert / update / upsert / delete(` in src/, and each call
// of an INVOKER function that writes, is matched to the gates that stand in
// front of it — the requireAction / requireAnyAction / requirePayrollPayouts-
// Action / requireApprover / requireProductListEdit / requirePermission in its
// own function, else in the functions that call it (this file's, or any file
// importing it). Whoever gets through must hold one of the actions the table
// asks for, or the database refuses somebody the app let in.

/** Tables the app writes that no domain policy covers, and why. */
const NOT_A_DOMAIN_TABLE: Readonly<Record<string, string>> = {
  access_log: 'Everybody logs their own reads (row policy: their own rows).',
  user_table_layouts: 'Each person’s own column layout (row policy: their own rows).',
  member_honours: 'Written by the server with the service role (lib/member/server.ts).',
  member_honour_months: 'Written by the server with the service role (lib/member/server.ts).',
  member_request_attachments: 'Written by the server with the service role (lib/member/server.ts).',
}

/**
 * Writes the database refuses although a gate lets somebody reach them — the
 * row policy refused them before this migration too.
 */
const REFUSED_ALREADY: Readonly<Record<string, string>> = {
  'src/app/(portal)/director-salary/pin-actions.ts treasury_config':
    'The Director PIN’s attempt counter: treasury_config’s row policy has only ever let the Principal write it.',
}

/** Machine paths: they write with the service role, which no row policy meets. */
const SERVICE_ROLE_FILES = /^src\/app\/api\//

/**
 * SECURITY INVOKER functions the app calls that write under the caller's own
 * session: the tables and commands each one writes (production's bodies).
 */
const INVOKER_WRITES: Readonly<Record<string, Readonly<Record<string, readonly WriteCommand[]>>>> = {
  catalogue_add_combo: { catalogue_combos: ['INSERT'], catalogue_combo_prices: ['INSERT', 'UPDATE'] },
  catalogue_remove_combos: { catalogue_combos: ['DELETE'], catalogue_combo_prices: ['DELETE'] },
  catalogue_save_kpi_items: { comm_kpi_items: ['INSERT', 'UPDATE'] },
  comm_clear_first_paid_month: { comm_cutovers: ['DELETE'] },
  comm_set_first_paid_month: { comm_cutovers: ['INSERT', 'UPDATE'] },
  comm_close_salespeople: { comm_salesperson_closes: ['INSERT', 'UPDATE'] },
  comm_reopen_salespeople: { comm_salesperson_closes: ['UPDATE'] },
  comm_replace_membership_position: { comm_hierarchy: ['INSERT', 'UPDATE'] },
  commit_sales_import_batch: { sales_import_batches: ['UPDATE'], sales_order_open_bill_tags: ['INSERT', 'DELETE'] },
  employee_chart_lifecycle: { hr_staff_costs: ['UPDATE'], comm_hierarchy: ['INSERT', 'UPDATE', 'DELETE'] },
  erp_feed_close_month: { erp_feed_closed_months: ['INSERT', 'UPDATE'] },
  erp_feed_reopen_month: { erp_feed_closed_months: ['UPDATE', 'DELETE'] },
  erp_sync_ignore_agent: { comm_ignored_agents: ['INSERT', 'UPDATE'], sales_orders: ['UPDATE'] },
  erp_sync_unignore_agent: { comm_ignored_agents: ['DELETE'], sales_orders: ['UPDATE'] },
  ingest_erp_sales_order: {
    sales_orders: ['INSERT', 'UPDATE'], sales_order_lines: ['INSERT', 'UPDATE', 'DELETE'], comm_upsales: ['INSERT', 'UPDATE'],
    comm_venues: ['INSERT', 'UPDATE'], comm_venue_events: ['INSERT', 'UPDATE'], comm_organisers: ['INSERT'],
    sales_import_batches: ['INSERT', 'UPDATE'], sales_order_open_bill_tags: ['INSERT', 'DELETE'], erp_sync_events: ['INSERT'],
  },
  ladder_delete_level: { title_levels: ['UPDATE', 'DELETE'] },
  ladder_insert_level: { title_levels: ['INSERT', 'UPDATE'] },
  match_erp_salesperson: { comm_agent_aliases: ['INSERT', 'UPDATE'], sales_orders: ['UPDATE'], sales_order_open_bill_tags: ['INSERT', 'DELETE'] },
  member_transfer_waiting: { hr_staff_costs: ['INSERT'] },
  revenue_apply_fair_calendar: { sales_import_batches: ['UPDATE'], sales_orders: ['UPDATE'] },
  revenue_dismiss_double_claim: { comm_double_claim_dismissals: ['INSERT', 'UPDATE'] },
  revenue_restore_double_claim: { comm_double_claim_dismissals: ['DELETE'] },
  revenue_exclude_order: { sales_order_exclusions: ['INSERT'], sales_order_open_bill_tags: ['UPDATE', 'DELETE'], sales_orders: ['UPDATE'] },
  revenue_include_order: { sales_order_exclusions: ['DELETE'], sales_order_open_bill_tags: ['INSERT', 'UPDATE'], sales_orders: ['UPDATE'] },
  revenue_move_order: { sales_order_reassignments: ['INSERT', 'UPDATE', 'DELETE'], sales_order_open_bill_tags: ['INSERT', 'DELETE'], sales_order_shares: ['DELETE'], sales_orders: ['UPDATE'] },
  revenue_set_order_brand: { sales_order_brand_picks: ['INSERT', 'UPDATE', 'DELETE'], sales_order_lines: ['UPDATE'], sales_orders: ['UPDATE'] },
}

const APPROVE: readonly Want[] = ['treasury.approve', 'approvals.approve', 'hr_costing.approve', 'director_salary.approve']
const COMMANDS: Record<string, readonly WriteCommand[]> = {
  insert: ['INSERT'], update: ['UPDATE'], delete: ['DELETE'], upsert: ['INSERT', 'UPDATE'],
}

/** What a gate lets through: each element is one action that opens it; `approver` = any domain's Approve. */
type Gate = { wants: Want[]; approver?: boolean; text: string }

/**
 * The ways in to a write: each path is the gates ONE function stands behind —
 * all of them, so somebody who got through holds one action of each — and
 * there is a path per caller when the write sits in an ungated helper.
 */
interface Site { file: string; line: number; table?: string; rpc?: string; commands: readonly WriteCommand[]; paths: Gate[][] }

type Fn = { file: string; name: string; gates: Gate[]; calls: Set<string> }

function scanApp(): Site[] {
  const cwd = process.cwd()
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(ts|tsx)$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [path] : []
  })
  const rel = (p: string) => relative(cwd, p).replace(/\\/g, '/')
  const resolveModule = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? join(cwd, 'src', spec.slice(2))
      : spec.startsWith('.') ? resolve(dirname(join(cwd, from)), spec) : null
    if (!base) return null
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (/\.tsx?$/.test(c) && existsSync(c)) return rel(c)
    }
    return null
  }
  // A name may arrive cast — `.rpc('execute_fund_source_cancel' as never, …)`.
  const literal = (n: ts.Node | undefined): string | null => {
    while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression(n))) {
      n = n.expression
    }
    return n && ts.isStringLiteralLike(n) ? n.text : null
  }
  const want = (fn: string, action: string, scope?: string | null) =>
    (scope && scope !== 'all' ? `${fn}.${action}:${scope}` : `${fn}.${action}`) as Want
  const pairs = (args: readonly ts.Expression[]): Want[] => args.flatMap(a => {
    if (!ts.isArrayLiteralExpression(a)) return []
    const [fn, action, scope] = a.elements.map(e => literal(e))
    return fn && action ? [want(fn, action, scope)] : []
  })
  const nameOf = (n: ts.Node): string | null => {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) return n.parent.name.text
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text
    return null
  }

  // ── Pass 1: every file's functions, imports and writes ────────────────────
  const fns: Fn[] = []
  const importsOf = new Map<string, Map<string, { from: string; name: string }>>()
  const pending: Array<{ fn: Fn | null; site: Omit<Site, 'paths'> }> = []
  for (const path of walk(join(cwd, 'src'))) {
    const text = readFileSync(path, 'utf8')
    const file = rel(path)
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const imports = new Map<string, { from: string; name: string }>()
    importsOf.set(file, imports)
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !st.importClause) continue
      const from = resolveModule(file, (st.moduleSpecifier as ts.StringLiteral).text)
      const bindings = st.importClause.namedBindings
      if (!from || !bindings || !ts.isNamedImports(bindings)) continue
      for (const el of bindings.elements) imports.set(el.name.text, { from, name: (el.propertyName ?? el.name).text })
    }
    const stack: Fn[] = []
    const visit = (n: ts.Node) => {
      const name = ts.isFunctionLike(n) ? nameOf(n) : null
      if (name) {
        const fn: Fn = { file, name, gates: [], calls: new Set() }
        fns.push(fn)
        stack.push(fn)
      }
      const here = stack[stack.length - 1] ?? null
      if (ts.isCallExpression(n)) {
        const callee = n.expression
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        const text = n.getText(sf).replace(/\s+/g, ' ')
        if (ts.isIdentifier(callee)) {
          const g = callee.text
          // Each write gate names its page first (2026-10-11, plan C): the action is after it.
          if (g === 'requireActionOn') {
            const [, fn, action, scope] = n.arguments.map(a => literal(a))
            if (fn && action) here?.gates.push({ wants: [want(fn, action, scope)], text })
          } else if (g === 'requireAnyActionOn' || g === 'requirePayrollPayoutsActionOn') {
            here?.gates.push({ wants: pairs(n.arguments.slice(1)), text })
          } else if (g === 'requireApproverOn') {
            here?.gates.push({ wants: [], approver: true, text })
          } else if (g === 'requireProductListEdit') {
            here?.gates.push({ wants: ['product_list.edit'], text })
          } else if (g === 'requirePermission' || g === 'requirePayrollPayouts') {
            // A page key: whoever holds it holds its function's View.
            const views = n.arguments.flatMap(a => (KEY_ACTIONS[literal(a) ?? ''] ?? []).filter(fa => fa.endsWith('.view')))
            here?.gates.push({ wants: views as Want[], text })
          } else {
            here?.calls.add(g)
          }
        } else if (ts.isPropertyAccessExpression(callee)) {
          const op = callee.name.text
          if (op in COMMANDS) {
            let e: ts.Expression = callee.expression
            let table: string | null = null
            for (let i = 0; i < 40 && !table; i++) {
              if (ts.isCallExpression(e)) {
                const c = e.expression
                if (ts.isPropertyAccessExpression(c) && c.name.text === 'from') table = literal(e.arguments[0])
                else if (ts.isPropertyAccessExpression(c)) e = c.expression
                else break
              } else if (ts.isPropertyAccessExpression(e) || ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
                e = e.expression
              } else break
            }
            if (table) pending.push({ fn: here, site: { file, line, table, commands: COMMANDS[op] } })
          } else if (op === 'rpc') {
            const rpc = literal(n.arguments[0])
            if (rpc && (rpc in INVOKER_WRITES || rpc in DEFINER_ASKS_NOW)) pending.push({ fn: here, site: { file, line, rpc, commands: [] } })
          }
        }
      }
      ts.forEachChild(n, visit)
      if (name) stack.pop()
    }
    visit(sf)
  }

  // ── Pass 2: a gate in the function itself, else in whoever calls it ───────
  const callers = (fn: Fn): Fn[] => fns.filter(c => {
    if (c.file === fn.file) return c.calls.has(fn.name)
    for (const [local, imp] of importsOf.get(c.file) ?? []) {
      if (imp.from === fn.file && imp.name === fn.name && c.calls.has(local)) return true
    }
    return false
  })
  const pathsOf = (fn: Fn | null, seen = new Set<Fn>()): Gate[][] => {
    if (!fn || seen.has(fn)) return []
    seen.add(fn)
    if (fn.gates.length) return [fn.gates]
    return callers(fn).flatMap(c => pathsOf(c, seen))
  }
  return pending.map(({ fn, site }) => ({ ...site, paths: pathsOf(fn) }))
}

describe('the app’s writes', () => {
  const sites = scanApp()

  it('finds them', () => {
    expect(sites.filter(s => s.table).length).toBeGreaterThan(250)
    expect(sites.filter(s => s.rpc).length).toBeGreaterThan(20)
  })

  it('every table the app writes is registered, or says why it needs no action', () => {
    const tables = new Set(sites.flatMap(s => (s.table && !SERVICE_ROLE_FILES.test(s.file) ? [s.table] : [])))
    const unknown = [...tables].filter(t => !(t in TABLE_WRITES) && !(t in WRITES_WITHOUT_ACTION) && !(t in NOT_A_DOMAIN_TABLE))
    expect(unknown.sort()).toEqual([])
  })

  it('whoever gets through a write’s gates holds an action the database asks for', () => {
    const misses: string[] = []
    // One gate of the path whose every way through is an action the table asks
    // for is enough: whoever passed holds one of them.
    const covers = (asked: readonly Want[], gate: Gate) =>
      gate.approver ? APPROVE.some(a => asked.includes(a)) : gate.wants.length > 0 && gate.wants.every(w => asked.includes(w))
    const judge = (s: Site, where: string, table: string, command: WriteCommand, path: Gate[]) => {
      const asked = TABLE_WRITES[table]?.[command]
      if (!asked) return // no domain policy for this command: own rows, or refused for everybody
      if (`${s.file} ${table}` in REFUSED_ALREADY) return
      if (!path.some(gate => covers(asked, gate))) {
        misses.push(`${where} ${table} ${command}: ${path.map(g => g.text).join(' & ')}`)
      }
    }
    for (const s of sites) {
      const where = `${s.file}:${s.line}`
      for (const path of s.paths) {
        if (s.table) for (const c of s.commands) judge(s, where, s.table, c, path)
        if (s.rpc) for (const [table, commands] of Object.entries(INVOKER_WRITES[s.rpc] ?? {})) {
          for (const c of commands) judge(s, `${where} ${s.rpc}`, table, c, path)
        }
      }
    }
    expect(misses).toEqual([])
  })

  it('nothing writes a registered table without a gate in front of it', () => {
    const ungated = sites
      .filter(s => s.paths.length === 0 && !SERVICE_ROLE_FILES.test(s.file))
      .filter(s => (s.table ? s.table in TABLE_WRITES : true))
      .map(s => `${s.file}:${s.line} ${s.table ?? s.rpc}`)
    expect(ungated).toEqual([])
  })

  // 2026-10-21 / 22: an UPDATE or DELETE that no action opens is refused to every session, and RLS
  // refuses it by leaving the rows out — no row moves and no error says so. Reverse payment's delete
  // of a voucher's fund_source_repayments (fsr_no_delete USING (false)) left them all; Copy's and
  // Record fund in's "rollback" deletes left a blank draft and a source nobody could approve. Such a
  // write is a guarded database step (or the command is registered, if a row policy really opens it).
  // An INSERT is never silent — its refusal is an error — and an upsert's update half raises one too.
  it('never updates or deletes through the session what the database lets nobody update or delete', () => {
    const silent = (table: string, command: WriteCommand) =>
      (command === 'UPDATE' || command === 'DELETE') && table in TABLE_WRITES && !TABLE_WRITES[table][command]
    const misses = sites.filter(s => !SERVICE_ROLE_FILES.test(s.file)).flatMap(s => [
      ...(s.table && s.commands.length === 1 && silent(s.table, s.commands[0]) ? [`${s.file}:${s.line} ${s.table} ${s.commands[0]}`] : []),
      ...Object.entries(s.rpc ? (INVOKER_WRITES[s.rpc] ?? {}) : {}).flatMap(([table, commands]) =>
        commands.filter(c => silent(table, c)).map(c => `${s.file}:${s.line} ${s.rpc} → ${table} ${c}`)),
    ])
    expect(misses).toEqual([])
  })
})

// ── The DEFINER functions ask for an action too (20261009030000) ─────────────
// Each function's check now hands `has_any_action` a list; whoever the app's
// gates let call it must hold one of them, at the reach it asks (All covers
// Dept covers Own), or the database refuses somebody the app let in.
describe('the DEFINER functions that ask for an action', () => {
  const sites = scanApp().filter(s => s.rpc && s.rpc in DEFINER_ASKS_NOW)
  /**
   * Calls behind `requireApprover()` — any domain's Approve — where the action
   * narrows it to one domain before the call, out of this scan's sight.
   */
  const DECIDED_IN_ONE_DOMAIN: Readonly<Record<string, string>> = {
    'src/app/(portal)/approvals/actions.ts bump_bank_balance':
      'A loan’s group approval: assertMayDecide(user, group) on new_loan + payment_voucher — Treasury · Approve or Approvals · Approve.',
  }
  const RANK: Readonly<Record<string, number>> = { own: 0, dept: 1, all: 2 }
  const parse = (w: string) => {
    const [fa, scope = 'all'] = w.split(':')
    return { fa, rank: RANK[scope] ?? 2 }
  }
  /** Somebody who holds `held` passes `has_any_action(asked)`. */
  const passes = (held: Want, asked: readonly Want[]) => {
    const h = parse(held)
    return asked.some(a => {
      const x = parse(a)
      return x.fa === h.fa && h.rank >= x.rank
    })
  }

  it('reads all 70 from the migration — 68 since My Billing’s two requests were dropped', () => {
    expect(Object.keys(DEFINER_ASKS)).toHaveLength(70)
    expect(Object.keys(DEFINER_ASKS).filter(name => !(name in DEFINER_ASKS_NOW)).sort()).toEqual(['submit_dept_payment_request', 'submit_invoice_request'])
    expect(DEFINER_ASKS_NOW.mint_invoice_no).toEqual(['billing.create'])
    expect(Object.values(DEFINER_ASKS).every(asked => asked.length > 0)).toBe(true)
    expect([...DEFINER_LETS_IN_APPROVERS]).toEqual(['dept_request_pv_rejected'])
  })

  it('asks only for actions a key can give', () => {
    const given = new Set<string>(Object.values(KEY_ACTIONS).flat())
    const asked = new Set(Object.values(DEFINER_ASKS_NOW).flat().map(a => a.split(':')[0]))
    expect([...asked].filter(fa => !given.has(fa))).toEqual([])
  })

  it('the app calls them', () => {
    expect(new Set(sites.map(s => s.rpc)).size).toBeGreaterThan(50)
  })

  it('whoever gets through a call’s gates holds an action the function asks for', () => {
    const misses: string[] = []
    for (const s of sites) {
      const asked = DEFINER_ASKS_NOW[s.rpc as string]
      if (`${s.file} ${s.rpc}` in DECIDED_IN_ONE_DOMAIN) {
        expect(asked).toEqual(expect.arrayContaining(['treasury.approve', 'approvals.approve']))
        continue
      }
      for (const path of s.paths) {
        const ok = path.some(gate => gate.approver
          ? DEFINER_LETS_IN_APPROVERS.has(s.rpc as string) || APPROVE.every(a => passes(a, asked))
          : gate.wants.length > 0 && gate.wants.every(w => passes(w, asked)))
        if (!ok) misses.push(`${s.file}:${s.line} ${s.rpc}: ${path.map(g => g.text).join(' & ')}`)
      }
    }
    expect(misses).toEqual([])
  })
})
