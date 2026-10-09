/**
 * The permission matrix (2026-10-08, the People Management revamp — the Claude
 * Design handoff "People Management Revamp"): a FUNCTION, an ACTION on it, and
 * how far that reaches — their own records, their department, or the whole
 * company. Cells are bundled into a TEMPLATE; a title points at a template; one
 * person can still be raised or lowered on a cell of their own.
 *
 * Pure, so the three places that draw a matrix — the Permissions tab, the
 * invite drawer and a person's card — agree with each other and with the tests.
 * The rules are the design's own (`setCell`, `cycleNext`, `sodWarnings`,
 * `keyList` in its prototype), and `openedKeys` is the database's
 * `current_permissions()` template path, rule for rule (migration
 * 20261008120000): a cell opens the module key the pages read — and only where
 * that key cannot reach further than the cell says. Since PR2 a write asks for
 * the cell itself (lib/permission-actions.ts), and heldCells says which do.
 */

import { GATED_ACTIONS, viewKeysOf, type FunctionKey } from '@/lib/permission-actions'

export const ACTIONS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'approve', label: 'Approve' },
  { key: 'void', label: 'Void' },
  { key: 'export', label: 'Export' },
  { key: 'manage', label: 'Manage' },
] as const

export type Action = (typeof ACTIONS)[number]['key']
export type Scope = 'own' | 'dept' | 'all'
/** A cell's value. `none` is the dashed `·` — not granted (or, for a person, held back). */
export type Cell = Scope | 'none'

export const CELL_RANK: Record<Cell, number> = { none: 0, own: 1, dept: 2, all: 3 }
export const CELL_LABEL: Record<Cell, string> = { none: '·', own: 'Own', dept: 'Dept', all: 'All' }

export const SECTIONS = ['Daily', 'People', 'Departments', 'Reports', 'Admin'] as const

export type SensitiveField = 'salary' | 'nric' | 'bank'

export const SENSITIVE_FIELDS: ReadonlyArray<{ key: SensitiveField; label: string; description: string }> = [
  { key: 'salary', label: 'Salary amounts', description: 'Basic, allowances and net pay of a named person.' },
  { key: 'nric', label: 'NRIC / IC', description: 'Identity numbers on the roster and payroll files.' },
  { key: 'bank', label: 'Bank accounts', description: 'Account numbers on payroll and payment files.' },
]

/** One row of the matrix, as `permission_functions` holds it. */
export interface PermFunction {
  key: string
  label: string
  section: string
  /** The actions it has, in the matrix's order; the rest are hatched. */
  actions: Action[]
  /** The reaches a cell may take, narrowest first. */
  scopes: Scope[]
  description: string | null
}

/** A template's cells: function → action → scope. An absent cell is `none`. */
export type Grants = Record<string, Partial<Record<Action, Scope>>>

/** A cell as `permission_template_grants` / `user_permission_cells` store it. */
export interface CellRow {
  function_key: string
  action: string
  scope: string | null
}

export function isAction(value: unknown): value is Action {
  return ACTIONS.some(a => a.key === value)
}

export function isScope(value: unknown): value is Scope {
  return value === 'own' || value === 'dept' || value === 'all'
}

export function isSensitiveField(value: unknown): value is SensitiveField {
  return value === 'salary' || value === 'nric' || value === 'bank'
}

export function cellOf(grants: Grants, fn: string, action: Action): Cell {
  return grants[fn]?.[action] ?? 'none'
}

/** A click on a cell: · → each scope the function allows, narrowest first → ·. */
export function cycleNext(fn: PermFunction, current: Cell): Cell {
  const order: Cell[] = ['none', ...fn.scopes]
  return order[(order.indexOf(current) + 1) % order.length]
}

/**
 * Set one cell, keeping View in step (the design's coupling): any action
 * brings View up to at least its reach; lowering View lowers every other
 * action on the function to at most View's reach, and View at · clears them.
 */
export function setCell(grants: Grants, fn: PermFunction, action: Action, scope: Cell): Grants {
  const row: Partial<Record<Action, Scope>> = { ...(grants[fn.key] ?? {}) }
  if (scope === 'none') delete row[action]
  else row[action] = scope
  if (action !== 'view' && scope !== 'none' && CELL_RANK[scope] > CELL_RANK[row.view ?? 'none']) {
    row.view = scope
  }
  if (action === 'view') {
    for (const other of fn.actions) {
      if (other === 'view') continue
      if (CELL_RANK[row[other] ?? 'none'] > CELL_RANK[scope]) {
        if (scope === 'none') delete row[other]
        else row[other] = scope
      }
    }
  }
  const next: Grants = { ...grants }
  if (Object.keys(row).length === 0) delete next[fn.key]
  else next[fn.key] = row
  return next
}

/**
 * Maker and checker in one template: a function with both Create and Approve,
 * both granted. Raising your OWN and approving wider is ordinary claims
 * practice, so it is not one.
 */
export function sodWarnings(grants: Grants, functions: readonly PermFunction[]): string[] {
  return functions
    .filter(fn => {
      if (!fn.actions.includes('create') || !fn.actions.includes('approve')) return false
      const create = cellOf(grants, fn.key, 'create')
      const approve = cellOf(grants, fn.key, 'approve')
      if (create === 'none' || approve === 'none') return false
      return !(create === 'own' && approve !== 'own')
    })
    .map(fn => `${fn.label}: Create and Approve are both granted — one person could raise and approve the same item.`)
}

/** Every `module.action:scope` the cells grant, then `sensitive.x` — the Show keys list. */
export function keyList(grants: Grants, sensitive: readonly SensitiveField[], functions: readonly PermFunction[]): string[] {
  const out: string[] = []
  for (const fn of functions) {
    for (const action of fn.actions) {
      const cell = cellOf(grants, fn.key, action)
      if (cell !== 'none') out.push(`${fn.key}.${action}:${cell}`)
    }
  }
  for (const field of SENSITIVE_FIELDS) if (sensitive.includes(field.key)) out.push(`sensitive.${field.key}`)
  return out
}

/** Functions in a section with anything granted, over how many there are — "3/5". */
export function sectionTally(grants: Grants, functions: readonly PermFunction[]): string {
  const granted = functions.filter(fn => fn.actions.some(a => cellOf(grants, fn.key, a) !== 'none')).length
  return `${granted}/${functions.length}`
}

/** Rows as PostgREST returns them → cells. A row naming no known action or reach is skipped. */
export function grantsFromRows(rows: readonly CellRow[]): Grants {
  const grants: Grants = {}
  for (const row of rows) {
    if (!isAction(row.action) || !isScope(row.scope)) continue
    grants[row.function_key] = { ...(grants[row.function_key] ?? {}), [row.action]: row.scope }
  }
  return grants
}

/** Cells → the list `permission_template_save` takes, in the matrix's order. */
export function grantsToRows(grants: Grants, functions: readonly PermFunction[]): Array<{ function_key: string; action: Action; scope: Scope }> {
  const out: Array<{ function_key: string; action: Action; scope: Scope }> = []
  for (const fn of functions) {
    for (const action of fn.actions) {
      const scope = grants[fn.key]?.[action]
      if (scope) out.push({ function_key: fn.key, action, scope })
    }
  }
  return out
}

/** `fn.action` — the key a cell goes by everywhere a person's exceptions are kept. */
export function cellKey(fn: string, action: Action): string {
  return `${fn}.${action}`
}

export function parseCellKey(key: string): { fn: string; action: Action } | null {
  const dot = key.lastIndexOf('.')
  if (dot <= 0) return null
  const action = key.slice(dot + 1)
  return isAction(action) ? { fn: key.slice(0, dot), action } : null
}

/** The cells (`fn.action`) whose value differs between two versions of a template. */
export function changedCells(before: Grants, after: Grants, functions: readonly PermFunction[]): string[] {
  const out: string[] = []
  for (const fn of functions) {
    for (const action of fn.actions) {
      if (cellOf(before, fn.key, action) !== cellOf(after, fn.key, action)) out.push(cellKey(fn.key, action))
    }
  }
  return out
}

export function sameGrants(a: Grants, b: Grants, functions: readonly PermFunction[]): boolean {
  return changedCells(a, b, functions).length === 0
}

export function sameSensitive(a: readonly SensitiveField[], b: readonly SensitiveField[]): boolean {
  return a.length === b.length && a.every(f => b.includes(f))
}

/** `permission_functions` rows → functions; an action or reach the app does not know is dropped. */
export function functionsFromRows(
  rows: ReadonlyArray<{ key: string; label: string; section: string; actions: string[]; scopes: string[]; description: string | null }>,
): PermFunction[] {
  return rows.map(f => ({
    key: f.key,
    label: f.label,
    section: f.section,
    actions: f.actions.filter(isAction),
    scopes: f.scopes.filter(isScope),
    description: f.description,
  }))
}

/** `permission_cell_keys` rows → what each cell opens and on what condition. */
export function cellKeysFromRows(
  rows: ReadonlyArray<{ function_key: string; action: string; legacy_key: string; min_scope: string; gate: string | null }>,
): CellKey[] {
  return rows.flatMap(k =>
    isAction(k.action) && isScope(k.min_scope)
      ? [{
          functionKey: k.function_key,
          action: k.action,
          legacyKey: k.legacy_key,
          minScope: k.min_scope,
          gate: k.gate === 'salary' || k.gate === 'treasury' || k.gate === 'principal' ? k.gate : null,
        }]
      : [],
  )
}

// ─── One person ────────────────────────────────────────────────────────────

/** A person's own cells over their template: `fn.action` → their cell (`none` = ✕). */
export type PersonCells = Record<string, Cell>

export function personCellsFromRows(rows: readonly CellRow[]): PersonCells {
  const out: PersonCells = {}
  for (const row of rows) {
    if (!isAction(row.action)) continue
    out[cellKey(row.function_key, row.action)] = isScope(row.scope) ? row.scope : 'none'
  }
  return out
}

export function personCellsToRows(cells: PersonCells): Array<{ function_key: string; action: Action; scope: Scope | null }> {
  return Object.entries(cells).flatMap(([key, cell]) => {
    const parsed = parseCellKey(key)
    return parsed ? [{ function_key: parsed.fn, action: parsed.action, scope: cell === 'none' ? null : cell }] : []
  })
}

/** What they hold: the template with their own cells laid over it. */
export function effectiveGrants(template: Grants, own: PersonCells): Grants {
  const out: Grants = {}
  for (const [fn, row] of Object.entries(template)) out[fn] = { ...row }
  for (const [key, cell] of Object.entries(own)) {
    const parsed = parseCellKey(key)
    if (!parsed) continue
    const row = { ...(out[parsed.fn] ?? {}) }
    if (cell === 'none') delete row[parsed.action]
    else row[parsed.action] = cell
    if (Object.keys(row).length === 0) delete out[parsed.fn]
    else out[parsed.fn] = row
  }
  return out
}

/** How many of their own cells reach further than the template, and how many fall short. */
export function exceptionCounts(template: Grants, own: PersonCells): { raised: number; lowered: number } {
  let raised = 0
  let lowered = 0
  for (const [key, cell] of Object.entries(own)) {
    const parsed = parseCellKey(key)
    if (!parsed) continue
    if (CELL_RANK[cell] > CELL_RANK[cellOf(template, parsed.fn, parsed.action)]) raised++
    else lowered++
  }
  return { raised, lowered }
}

/**
 * A click on one of a person's cells: the next value after what they hold now;
 * landing back on the template's value removes their exception rather than
 * storing a copy of it (the design: "Cycling a cell back to the template value
 * removes the override").
 */
export function cyclePersonCell(template: Grants, own: PersonCells, fn: PermFunction, action: Action): PersonCells {
  const key = cellKey(fn.key, action)
  const current = cellOf(effectiveGrants(template, own), fn.key, action)
  const next = cycleNext(fn, current)
  const out = { ...own }
  if (next === cellOf(template, fn.key, action)) delete out[key]
  else out[key] = next
  return out
}

/** Their exceptions without the ones that now say exactly what the template says. */
export function pruneExceptions(template: Grants, own: PersonCells): PersonCells {
  const out: PersonCells = {}
  for (const [key, cell] of Object.entries(own)) {
    const parsed = parseCellKey(key)
    if (parsed && cell !== cellOf(template, parsed.fn, parsed.action)) out[key] = cell
  }
  return out
}

/**
 * The people a template save would touch on a cell they have their own value
 * on — each with those cells. The user's rule (2026-10-08): saving a template
 * for everybody asks, person by person, keep theirs or reset to the template.
 */
export function exceptionsOnChangedCells<P extends { cells: PersonCells }>(
  people: readonly P[],
  before: Grants,
  after: Grants,
  functions: readonly PermFunction[],
): Array<{ person: P; cells: string[] }> {
  const changed = new Set(changedCells(before, after, functions))
  return people
    .map(person => ({ person, cells: Object.keys(person.cells).filter(k => changed.has(k)).sort() }))
    .filter(a => a.cells.length > 0)
}

/** "TM audit_log.view:all", "SR hr_costing.export:✕" — the Personal exceptions column. */
export function describeExceptions(initials: string, own: PersonCells): string[] {
  return Object.entries(own)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, cell]) => `${initials} ${key}:${cell === 'none' ? '✕' : cell}`)
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

// ─── What a template opens today ───────────────────────────────────────────

export type CellGate = 'salary' | 'treasury' | 'principal'

/** One row of `permission_cell_keys`: a cell, the module key it opens, and on what condition. */
export interface CellKey {
  functionKey: string
  action: Action
  legacyKey: string
  minScope: Scope
  gate: CellGate | null
}

const MEMBER_APP_KEYS = ['member_portal', 'member_quote', 'member_requests', 'member_memos', 'member_insight', 'member_crm', 'crm_manage']

/**
 * The module keys these cells open while the gates still read module keys —
 * `current_permissions()`'s template path, rule for rule: the cell reaches the
 * key's narrowest opening reach, and its gate holds (salary amounts ticked;
 * Treasury · View granted; a Principal template). Salary amounts open the two
 * salary keys. A Revenue app account only ever holds the member app's keys.
 */
export function openedKeys(
  grants: Grants,
  sensitive: readonly SensitiveField[],
  baseRole: string,
  cellKeys: readonly CellKey[],
): string[] {
  const seesSalary = sensitive.includes('salary')
  const opened = new Set<string>()
  for (const k of cellKeys) {
    if (heldBecause(grants, seesSalary, baseRole, k) === null && cellOf(grants, k.functionKey, k.action) !== 'none') {
      opened.add(k.legacyKey)
    }
  }
  if (seesSalary) {
    opened.add('salary_individual')
    opened.add('payroll_payouts')
  }
  const keys = [...opened]
  return (baseRole === 'revenue_member' ? keys.filter(k => MEMBER_APP_KEYS.includes(k)) : keys).sort()
}

/** Why a granted cell does not open its key yet, or null when it does. */
function heldBecause(grants: Grants, seesSalary: boolean, baseRole: string, k: CellKey): string | null {
  const cell = cellOf(grants, k.functionKey, k.action)
  if (cell === 'none') return null
  if (CELL_RANK[cell] < CELL_RANK[k.minScope]) {
    return `${CELL_LABEL[cell]} is not enforced on this yet, so it stays closed until it is — All opens it now`
  }
  if (k.gate === 'salary' && !seesSalary) return 'It shows what people are paid — tick Salary amounts to open it'
  if (k.gate === 'treasury' && cellOf(grants, 'treasury', 'view') === 'none') return 'It opens the treasury ledgers — needs Treasury · View too'
  if (k.gate === 'principal' && baseRole !== 'principal') {
    return 'It opens the Principal’s own powers — only a full-access template opens it for now'
  }
  if (baseRole === 'revenue_member' && !MEMBER_APP_KEYS.includes(k.legacyKey)) {
    return 'A Revenue app account opens only the Revenue app'
  }
  return null
}

/**
 * The granted cells that open nothing today, each with the reason — shown
 * beside the matrix so a cell that is saved but not yet in force is never a
 * silent surprise.
 *
 * Since 2026-10-08 (PR2) a write asks for its action (`requireAction`): such a
 * cell is in force once the function's pages are open to the template (one of
 * its View keys, `viewKeysOf`) and it reaches as far as the gates ask
 * (`GATED_ACTIONS` — Claims · Create asks Own, My Billing · Create Dept, the
 * rest All). Anything else still works through its module key, as before. A
 * cell nothing acts on yet (Revenue · Approve, Venture Pool · Create, Logins &
 * invites · View …) is not "held" — there is nothing to open.
 */
export function heldCells(
  grants: Grants,
  sensitive: readonly SensitiveField[],
  baseRole: string,
  cellKeys: readonly CellKey[],
  functions: readonly PermFunction[],
): Array<{ key: string; label: string; reason: string }> {
  const seesSalary = sensitive.includes('salary')
  const opened = new Set(openedKeys(grants, sensitive, baseRole, cellKeys))
  const out: Array<{ key: string; label: string; reason: string }> = []
  for (const fn of functions) {
    for (const action of fn.actions) {
      const cell = cellOf(grants, fn.key, action)
      if (cell === 'none') continue
      const keys = cellKeys.filter(k => k.functionKey === fn.key && k.action === action)
      const reasons = keys.map(k => heldBecause(grants, seesSalary, baseRole, k))
      if (reasons.some(r => r === null)) continue
      const asked = action === 'view' ? undefined : GATED_ACTIONS[cellKey(fn.key, action)]
      let reason: string | null = keys.length > 0 ? reasons[0]! : null
      if (asked) {
        const views = viewKeysOf(fn.key as FunctionKey)
        if (views.length > 0 && !views.some(k => opened.has(k))) {
          reason = viewHeldBecause(grants, seesSalary, baseRole, cellKeys, fn.key, views)
        } else if (CELL_RANK[cell] < CELL_RANK[asked]) {
          reason = `${CELL_LABEL[cell]} is not enforced on this yet, so it stays closed until it is — ${CELL_LABEL[asked]} opens it now`
        } else {
          reason = null
        }
      }
      if (reason === null) continue
      const label = `${fn.label} · ${ACTIONS.find(a => a.key === action)!.label}`
      out.push({ key: cellKey(fn.key, action), label, reason })
    }
  }
  return out
}

/** Why a function's pages stay closed: the reason its first granted View key is held. */
function viewHeldBecause(
  grants: Grants,
  seesSalary: boolean,
  baseRole: string,
  cellKeys: readonly CellKey[],
  fnKey: string,
  views: readonly string[],
): string {
  for (const k of cellKeys) {
    if (k.functionKey !== fnKey || !views.includes(k.legacyKey)) continue
    const why = heldBecause(grants, seesSalary, baseRole, k)
    if (why) return why
  }
  return 'Its pages are not open to this template — give the function’s View first'
}
