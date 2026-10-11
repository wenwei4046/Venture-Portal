import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { KEY_ACTIONS } from '@/lib/permission-actions'

/**
 * Every READ the app makes under somebody's session, and the gates that stand
 * in front of it (PR3d, 2026-10-09) — the twin of the write scan in
 * permission-table-writes.test.ts, with the ways in that reads also need: a
 * server component rendered as JSX (`<Section />`), a default export, a
 * namespace import, and a function wrapped in cache() / memo().
 *
 * A read is `.from('t').select(…)` (or a write's `.select()` handing rows
 * back), or `.rpc('f')` — whether f reads under the caller's session is the
 * caller's question (SECURITY INVOKER functions do).
 */

/** One action, at a reach when less than All: `treasury.view`, `claims.view:own`. */
export type Want = string

/** What a gate lets through: each element is one action that opens it. Empty = it cannot be told in actions. */
export interface Gate { wants: Want[]; text: string }

export interface ReadSite {
  file: string
  line: number
  /** The function it sits in, or null at module level. */
  fn: string | null
  table?: string
  /** from(<not a string>): the table is chosen at run time. */
  dynamic?: boolean
  /** Relations the select() embeds — read under the same session. */
  embeds?: string[]
  /** False when the select() text is built at run time (its embeds cannot be told). */
  selectKnown?: boolean
  rpc?: string
  /** select = a read; returning = the rows a write hands back; rpc = a function call. */
  via: 'select' | 'returning' | 'rpc'
  /** One path per way in: the gates ONE function stands behind (all of them). */
  paths: Gate[][]
  /** Ways in that reach no gate: `file#function` of each ungated root. */
  roots: string[]
}

type Fn = { file: string; name: string; gates: Gate[]; calls: Set<string> }

const WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete'])
const WRAPPERS = new Set(['cache', 'memo', 'forwardRef', 'unstable_cache'])

/**
 * The text of a select() argument: a string, a template's literal parts, or a
 * string constant of the same file. null when it cannot be told (built at run time).
 */
function selectText(arg: ts.Expression | undefined, sf: ts.SourceFile): string | null {
  if (!arg) return '*'
  while (ts.isAsExpression(arg) || ts.isParenthesizedExpression(arg)) arg = arg.expression
  if (ts.isStringLiteralLike(arg)) return arg.text
  if (ts.isTemplateExpression(arg)) return [arg.head.text, ...arg.templateSpans.map(s => s.literal.text)].join(' ')
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = selectText(arg.left, sf)
    const r = selectText(arg.right, sf)
    return l !== null && r !== null ? `${l}${r}` : null
  }
  if (ts.isIdentifier(arg)) {
    let found: string | null = null
    const look = (n: ts.Node) => {
      if (found !== null) return
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === (arg as ts.Identifier).text && n.initializer) {
        const t = selectText(n.initializer, sf)
        if (t !== null) found = t
      }
      ts.forEachChild(n, look)
    }
    look(sf)
    return found
  }
  return null
}

/**
 * The relations a select() embeds — `*, companies(name)`, `owner:users!fk(name)`,
 * `payment_vouchers:pv_id (voucher_no)`: each a table read too. Both sides of an
 * `alias:relation` are kept (either may be the table); names that are no table
 * are dropped by whoever reads the list.
 */
function embedsOf(arg: ts.Expression | undefined, sf: ts.SourceFile): string[] {
  const text = selectText(arg, sf)
  if (!text) return []
  const names = [...text.matchAll(/(?:^|[\s,(])(?:([a-z_][a-z_0-9]*)\s*:\s*)?([a-z_][a-z_0-9]*)(?:![a-z_0-9]+)?\s*\(/g)]
    .flatMap(m => (m[1] ? [m[1], m[2]] : [m[2]]))
  return [...new Set(names)]
}

/** Is this expression the service role's client — `adminClient()`, cast or not, or a name given to it? */
function byServiceRole(e: ts.Expression, adminIds: ReadonlySet<string>): boolean {
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAwaitExpression(e)) e = e.expression
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) return e.expression.text === 'adminClient'
  return ts.isIdentifier(e) && adminIds.has(e.text)
}

/** The approve actions — any of them opens the approver gate (requireApproverOn). */
export const APPROVE: readonly Want[] = ['treasury.approve', 'approvals.approve', 'hr_costing.approve', 'director_salary.approve']

/**
 * minReach: each function's least reach (permission_functions.scopes) — a page
 * key is held with its function's View at SOME reach, so the key's gate is
 * read as that View at the least one (`claims.view:own`, `dept_pool.view:dept`).
 */
export function scanReads(
  root: string = process.cwd(),
  minReach: Readonly<Record<string, string>> = {},
  /** Gates the scan cannot see, by `file#function`: a check written by hand (`if (!canSee…) notFound()`). */
  extraGates: Readonly<Record<string, Gate>> = {},
): ReadSite[] {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(ts|tsx)$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [path] : []
  })
  const rel = (p: string) => relative(root, p).replace(/\\/g, '/')
  const resolveModule = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? join(root, 'src', spec.slice(2))
      : spec.startsWith('.') ? resolve(dirname(join(root, from)), spec) : null
    if (!base) return null
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (/\.tsx?$/.test(c) && existsSync(c)) return rel(c)
    }
    return null
  }
  const literal = (n: ts.Node | undefined): string | null => {
    while (n && (ts.isAsExpression(n) || ts.isParenthesizedExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression(n))) {
      n = n.expression
    }
    return n && ts.isStringLiteralLike(n) ? n.text : null
  }
  const want = (fn: string, action: string, scope?: string | null): Want =>
    scope && scope !== 'all' ? `${fn}.${action}:${scope}` : `${fn}.${action}`
  const pairs = (args: readonly ts.Expression[]): Want[] => args.flatMap(a => {
    if (!ts.isArrayLiteralExpression(a)) return []
    const [fn, action, scope] = a.elements.map(e => literal(e))
    return fn && action ? [want(fn, action, scope)] : []
  })
  const viewsOf = (keys: readonly string[]): Want[] =>
    keys.flatMap(k => (KEY_ACTIONS[k] ?? []).filter(fa => fa.endsWith('.view')))
      .map(fa => {
        const least = minReach[fa.slice(0, -'.view'.length)]
        return least && least !== 'all' ? `${fa}:${least}` : fa
      })
  const calleeName = (e: ts.Expression): string | null =>
    ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null
  /** A function's name: declared, assigned, or assigned through a wrapper call (cache, memo …). */
  const nameOf = (n: ts.Node): string | null => {
    if (ts.isFunctionDeclaration(n)) {
      if (n.name) return n.name.text
      return n.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : null
    }
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const p = n.parent
      if (ts.isVariableDeclaration(p) && p.initializer === n && ts.isIdentifier(p.name)) return p.name.text
      if (ts.isCallExpression(p) && WRAPPERS.has(calleeName(p.expression) ?? '') && ts.isVariableDeclaration(p.parent)
          && p.parent.initializer === p && ts.isIdentifier(p.parent.name)) return p.parent.name.text
      if (ts.isExportAssignment(p)) return 'default'
    }
    return null
  }

  // ── Pass 1: functions, imports, gates, calls, reads ───────────────────────
  const fns: Fn[] = []
  const importsOf = new Map<string, Map<string, { from: string; name: string }>>()
  const namespacesOf = new Map<string, Map<string, string>>()
  /** The name a file's default export goes by. */
  const defaultOf = new Map<string, string>()
  const pending: Array<{ fn: Fn | null; site: Omit<ReadSite, 'paths' | 'roots'> }> = []
  for (const path of walk(join(root, 'src'))) {
    const text = readFileSync(path, 'utf8')
    const file = rel(path)
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const imports = new Map<string, { from: string; name: string }>()
    const namespaces = new Map<string, string>()
    importsOf.set(file, imports)
    namespacesOf.set(file, namespaces)
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && st.importClause) {
        const from = resolveModule(file, (st.moduleSpecifier as ts.StringLiteral).text)
        if (!from) continue
        if (st.importClause.name) imports.set(st.importClause.name.text, { from, name: 'default' })
        const bindings = st.importClause.namedBindings
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) imports.set(el.name.text, { from, name: (el.propertyName ?? el.name).text })
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          namespaces.set(bindings.name.text, from)
        }
      } else if (ts.isFunctionDeclaration(st) && st.name && st.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        defaultOf.set(file, st.name.text)
      } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
        defaultOf.set(file, st.expression.text)
      } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause) && st.moduleSpecifier) {
        // export { default as X } from './y' — a re-export: X is y's default.
        const from = resolveModule(file, (st.moduleSpecifier as ts.StringLiteral).text)
        if (from) for (const el of st.exportClause.elements) imports.set(`reexport:${el.name.text}`, { from, name: (el.propertyName ?? el.name).text })
      }
    }
    // Names this file gives the service role's client: `const admin = adminClient() as …`.
    const adminIds = new Set<string>()
    const findAdmin = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && byServiceRole(n.initializer, adminIds)) {
        adminIds.add(n.name.text)
      }
      ts.forEachChild(n, findAdmin)
    }
    findAdmin(sf)
    const stack: Fn[] = []
    const visit = (n: ts.Node) => {
      const name = ts.isFunctionLike(n) ? nameOf(n) : null
      if (name) {
        const fn: Fn = { file, name, gates: [], calls: new Set() }
        fns.push(fn)
        stack.push(fn)
      }
      const here = stack[stack.length - 1] ?? null
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName)) {
        here?.calls.add(n.tagName.text)
      }
      if (ts.isCallExpression(n)) {
        const callee = n.expression
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
        const text = n.getText(sf).replace(/\s+/g, ' ').slice(0, 160)
        if (ts.isIdentifier(callee)) {
          const g = callee.text
          // Each write gate names its page first (2026-10-11, plan C): the action is after it.
          if (g === 'requireActionOn') {
            const [, fn, action, scope] = n.arguments.map(a => literal(a))
            if (fn && action) here?.gates.push({ wants: [want(fn, action, scope)], text })
          } else if (g === 'requireAnyActionOn' || g === 'requirePayrollPayoutsActionOn') {
            here?.gates.push({ wants: pairs(n.arguments.slice(1)), text })
          } else if (g === 'requireApproverOn') {
            here?.gates.push({ wants: [...APPROVE], text })
          } else if (g === 'requireApprovalQueue') {
            here?.gates.push({ wants: ['approvals.view', ...APPROVE], text })
          } else if (g === 'requireProductListEdit') {
            here?.gates.push({ wants: ['product_list.edit'], text })
          } else if (g === 'requireProductList') {
            here?.gates.push({ wants: ['product_list.view'], text })
          } else if (g === 'requirePermission' || g === 'requirePayrollPayouts') {
            const keys = n.arguments.map(a => literal(a)).filter((k): k is string => !!k)
            here?.gates.push({ wants: viewsOf(keys), text })
          } else {
            here?.calls.add(g)
          }
        } else if (ts.isPropertyAccessExpression(callee)) {
          const op = callee.name.text
          if (ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text)) {
            here?.calls.add(`${callee.expression.text}.${op}`)
          }
          if ((op === 'from' || op === 'rpc') && byServiceRole(callee.expression, adminIds)) {
            // The service role's client meets no row policy: not a read under a session.
          } else if (op === 'from' && ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === 'storage') {
            // supabase.storage.from('bucket') — a storage bucket, not a table.
          } else if (op === 'from') {
            const table = literal(n.arguments[0]) ?? undefined
            // The chain above the from(): the first method called on it, and the select() if one follows.
            const chain: string[] = []
            let selectArg: ts.Expression | undefined
            let selected = false
            let p: ts.Node = n
            for (let i = 0; i < 80; i++) {
              const parent = p.parent
              if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === p) {
                chain.push(parent.name.text)
                const call = ts.isCallExpression(parent.parent) && parent.parent.expression === parent ? parent.parent : null
                if (parent.name.text === 'select' && call && !selected) { selected = true; selectArg = call.arguments[0] }
                p = call ?? parent
              } else if (parent && (ts.isNonNullExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent))) {
                p = parent
              } else break
            }
            const first = chain[0]
            // A table chosen at run time counts only when a client call follows: Array.from(…).map is no read.
            const clientCall = first === 'select' || (!!first && WRITE_OPS.has(first))
            const shape = { file, line, fn: here?.name ?? null, table, dynamic: !table, embeds: embedsOf(selectArg, sf), selectKnown: !selected || selectText(selectArg, sf) !== null }
            if (!table && !clientCall) {
              // Array.from, Buffer.from …
            } else if (first === 'select') pending.push({ fn: here, site: { ...shape, via: 'select' } })
            else if (first && WRITE_OPS.has(first)) {
              if (selected) pending.push({ fn: here, site: { ...shape, via: 'returning' } })
            } else {
              // A builder handed on (`const q = supabase.from('t')`): count it a read.
              pending.push({ fn: here, site: { ...shape, via: 'select' } })
            }
          } else if (op === 'rpc') {
            const rpc = literal(n.arguments[0])
            if (rpc) pending.push({ fn: here, site: { file, line, fn: here?.name ?? null, rpc, via: 'rpc' } })
          }
        }
      }
      ts.forEachChild(n, visit)
      if (name) stack.pop()
    }
    visit(sf)
  }

  // ── Pass 2: a gate in the function itself, else in whoever calls it ───────
  /** Is `local` in file c a name for fn (declared there, imported, a namespace member, or a re-export)? */
  const refersTo = (cFile: string, local: string, fn: Fn): boolean => {
    const imp = importsOf.get(cFile)?.get(local)
    if (!imp || imp.from !== fn.file) return false
    if (imp.name === fn.name) return true
    return imp.name === 'default' && defaultOf.get(fn.file) === fn.name
  }
  const callersCache = new Map<Fn, Fn[]>()
  const callers = (fn: Fn): Fn[] => {
    const hit = callersCache.get(fn)
    if (hit) return hit
    const out = fns.filter(c => {
      if (c === fn) return false
      if (c.file === fn.file && c.calls.has(fn.name)) return true
      for (const local of c.calls) {
        if (refersTo(c.file, local, fn)) return true
        const dot = local.indexOf('.')
        if (dot > 0 && namespacesOf.get(c.file)?.get(local.slice(0, dot)) === fn.file && local.slice(dot + 1) === fn.name) return true
      }
      return false
    })
    // Re-exports: a caller importing X from an index that re-exports fn.
    for (const [file, imps] of importsOf) {
      for (const [key, imp] of imps) {
        if (!key.startsWith('reexport:') || imp.from !== fn.file) continue
        if (!(imp.name === fn.name || (imp.name === 'default' && defaultOf.get(fn.file) === fn.name))) continue
        const exported = key.slice('reexport:'.length)
        for (const c of fns) {
          if (c === fn || out.includes(c)) continue
          for (const local of c.calls) {
            const i = importsOf.get(c.file)?.get(local)
            if (i && i.from === file && i.name === exported) { out.push(c); break }
          }
        }
      }
    }
    callersCache.set(fn, out)
    return out
  }
  /**
   * The gated functions in front of fn, and the ungated ROOTS behind it — a
   * function nothing calls that stands behind no gate: a page or action open
   * to anybody signed in, or a caller this scan cannot see (a prop, a map of
   * functions). A read with a root is not proven gated.
   */
  const reach = (fn: Fn | null): { paths: Gate[][]; roots: string[] } => {
    const paths: Gate[][] = []
    const roots: string[] = []
    const seen = new Set<Fn>()
    const go = (f: Fn | null) => {
      if (!f) { roots.push('(module level)'); return }
      if (seen.has(f)) return
      seen.add(f)
      const extra = extraGates[`${f.file}#${f.name}`]
      if (extra || f.gates.length) { paths.push(extra ? [...f.gates, extra] : f.gates); return }
      const cs = callers(f)
      if (cs.length === 0) roots.push(`${f.file}#${f.name}`)
      for (const c of cs) go(c)
    }
    go(fn)
    return { paths, roots }
  }
  return pending.map(({ fn, site }) => {
    const { paths, roots } = reach(fn)
    return { ...site, paths, roots }
  })
}
