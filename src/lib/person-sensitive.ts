/**
 * One person's Salary amounts / NRIC / Bank accounts over their title's
 * template (2026-10-16 — the owner: "Edit Permission 的优先级是高于 Title 和
 * Template 的"; mig 20261016190000). A tick raises (`granted`) or holds back a
 * field for them alone; the database reads it before the template's
 * (`current_sensitive_fields()`, and the Salary tick that opens the pay keys in
 * `current_permissions()`). An account with no template keeps its kind's
 * fields. Pure — the person window and the save share it.
 */

import { SENSITIVE_FIELDS, isSensitiveField, type SensitiveField } from '@/lib/permission-matrix'

export interface SensitiveTick {
  field: SensitiveField
  granted: boolean
}

/** `user_permission_sensitive` rows → ticks; a field the app does not know is dropped. */
export function sensitiveTicksFromRows(rows: ReadonlyArray<{ field: string; granted: boolean }>): SensitiveTick[] {
  return rows.flatMap(r => (isSensitiveField(r.field) && typeof r.granted === 'boolean' ? [{ field: r.field, granted: r.granted }] : []))
}

/** What they see: the template's fields with their own ticks over them, in the matrix's order. */
export function sensitiveOf(template: readonly SensitiveField[], ticks: readonly SensitiveTick[]): SensitiveField[] {
  const out = new Set(template)
  for (const t of ticks) {
    if (t.granted) out.add(t.field)
    else out.delete(t.field)
  }
  return SENSITIVE_FIELDS.map(f => f.key).filter(f => out.has(f))
}

/** One field clicked: flipped, and a tick that lands back on the template's value is no tick at all. */
export function toggleSensitive(template: readonly SensitiveField[], ticks: readonly SensitiveTick[], field: SensitiveField): SensitiveTick[] {
  const on = sensitiveOf(template, ticks).includes(field)
  const rest = ticks.filter(t => t.field !== field)
  return template.includes(field) === !on ? rest : [...rest, { field, granted: !on }]
}

export function sameSensitiveTicks(a: readonly SensitiveTick[], b: readonly SensitiveTick[]): boolean {
  const key = (ts: readonly SensitiveTick[]) => [...ts].map(t => `${t.field}:${t.granted}`).sort().join(',')
  return key(a) === key(b)
}

/** A person's ticks as their window sends them: a field, on or off — each field once, at most three. */
export function isSensitiveTickList(ticks: unknown): ticks is SensitiveTick[] {
  if (!Array.isArray(ticks) || ticks.length > SENSITIVE_FIELDS.length) return false
  const seen = new Set<string>()
  return ticks.every(t => {
    const r = t as Partial<SensitiveTick> | null
    if (!r || !isSensitiveField(r.field) || typeof r.granted !== 'boolean' || seen.has(r.field)) return false
    seen.add(r.field)
    return true
  })
}
