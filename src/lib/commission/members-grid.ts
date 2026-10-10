/**
 * Sales Groups › Members (2026-10-10, the HR revamp): the grid edits three
 * things a row at a time — the Rank a month pays from, the Rate mode that
 * rides with it, and Withholding Tax — and saves every changed row in one go.
 * A changed cell is peach until the save lands. This is the arithmetic of
 * "what changed": pure, so the grid stays thin and this is tested.
 */

/** A row's three editable values, as the grid's selects hold them. */
export interface MemberValues {
  /** `comm_ranks.id`; '' while they hold no rank. */
  rank: string
  /** '' = the scheme's default; 'fixed' = Manual; 'variable' = Scheme target. */
  mode: '' | 'fixed' | 'variable'
  /** '' = no withholding (PCB); else the rate in percent, "2". */
  wh: string
}

export type MemberField = keyof MemberValues
export type MemberEdits = Record<string, Partial<MemberValues>>

/** The person as the grid reads them from the team load. */
export interface MemberSource {
  staff_id: string
  employee_name: string
  rank_id: string | null
  rate_mode: 'fixed' | 'variable' | null
  tax_mode: 'pcb' | 'withholding' | 'none'
  withholding_rate: number
}

/** 0.02 → "2"; 0.025 → "2.5". */
export function pctString(rate: number): string {
  return String(Math.round(Number(rate) * 10000) / 100)
}

export function savedValues(p: MemberSource): MemberValues {
  return {
    rank: p.rank_id ?? '',
    mode: p.rate_mode ?? '',
    wh: p.tax_mode === 'withholding' ? pctString(p.withholding_rate) : '',
  }
}

/** What a row shows: the saved values under its edits. */
export function shownValues(p: MemberSource, edits: MemberEdits): MemberValues {
  return { ...savedValues(p), ...(edits[p.staff_id] ?? {}) }
}

/** The fields of a row that differ from what is saved. */
export function changedFields(p: MemberSource, edits: MemberEdits): MemberField[] {
  const saved = savedValues(p)
  const e = edits[p.staff_id] ?? {}
  return (Object.keys(e) as MemberField[]).filter(f => e[f] !== undefined && e[f] !== saved[f])
}

export interface PendingChange {
  staffId: string
  name: string
  fields: MemberField[]
  values: MemberValues
}

/** Every row with a change, in the grid's order, and how many cells changed. */
export function pendingChanges(people: readonly MemberSource[], edits: MemberEdits): { rows: PendingChange[]; cells: number } {
  const rows = people
    .map(p => ({ staffId: p.staff_id, name: p.employee_name, fields: changedFields(p, edits), values: shownValues(p, edits) }))
    .filter(r => r.fields.length > 0)
  return { rows, cells: rows.reduce((n, r) => n + r.fields.length, 0) }
}

/** "3 unsaved changes · Anthony, Lawrence". */
export function saveBarText(rows: readonly PendingChange[], cells: number): string {
  return `${cells} unsaved change${cells === 1 ? '' : 's'} · ${rows.map(r => r.name).join(', ')}`
}

/** One edit applied, dropping it again when it puts the row back as saved. */
export function withEdit(edits: MemberEdits, p: MemberSource, field: MemberField, value: string): MemberEdits {
  const row = { ...(edits[p.staff_id] ?? {}), [field]: value } as Partial<MemberValues>
  if (savedValues(p)[field] === value) delete row[field]
  const next = { ...edits }
  if (Object.keys(row).length === 0) delete next[p.staff_id]
  else next[p.staff_id] = row
  return next
}

/** "B · 9%" — a rung's letter and its pay, the grid's Rank cell. */
export function rankChoiceLabel(r: { label: string }, pay: string): string {
  return `${r.label.replace(/^Rank\s+/, '')} · ${pay}`
}

export const RATE_MODE_LABEL: Record<MemberValues['mode'], string> = {
  '': 'Scheme default',
  fixed: 'Manual',
  variable: 'Scheme target',
}

/** The Withholding cell's choices: none, the statutory 2%, and the person's own rate if it is another. */
export function withholdingChoices(p: MemberSource): string[] {
  const own = savedValues(p).wh
  return own && own !== '2' ? ['', '2', own] : ['', '2']
}

export function withholdingLabel(v: string): string {
  return v === '' ? '—' : `${v}%`
}
