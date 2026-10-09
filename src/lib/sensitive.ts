import type { SensitiveField } from '@/lib/permission-matrix'

/**
 * Salary amounts, NRIC / IC and bank account numbers (2026-10-09, PR4 of the
 * People Management revamp): each is shown only where the viewer's title
 * ticks it — the template's Sensitive fields — and as •••• everywhere else
 * (the design: "Hidden as •••• unless ticked, on every page this template can
 * open").
 *
 * The database decides first: since mig 20261009050100 no session reads an
 * NRIC or an account number straight off a table; the readers
 * (`staff_private_fields`, `director_private_fields`, `payroll_line_accounts`,
 * lib/private-fields.ts) hand the value to a holder of the tick and •••• to
 * anybody else. This is the same answer on the app's side, for the one case
 * the database cannot see: the Principal's view-as switch masks the PAGE while
 * the database still answers for the real account.
 */
export const MASKED = '••••'

export type { SensitiveField }

export interface SensitiveHolder {
  /** From `current_sensitive_fields()`; absent means nothing ticked. */
  sensitive?: readonly SensitiveField[]
}

export function sees(viewer: SensitiveHolder, field: SensitiveField): boolean {
  return (viewer.sensitive ?? []).includes(field)
}

/** A value as the database hands it to somebody without the tick. */
export function isMasked(value: unknown): boolean {
  return value === MASKED
}

/** On file — the real value or ••••, either way not blank. */
export function onFile(value: string | null | undefined): boolean {
  return value != null && String(value).trim() !== ''
}

/**
 * The value as this viewer may see it: itself when ticked, •••• when there is
 * one on file and the tick is not theirs, and blank as blank — whether a field
 * is filled in is not a secret (the roster's "missing NRIC" says it anyway).
 */
export function shown(viewer: SensitiveHolder, field: SensitiveField, value: string | null | undefined): string | null {
  if (!onFile(value)) return value ?? null
  return sees(viewer, field) ? (value as string) : MASKED
}

/**
 * An account with no permission template sees what its kind always saw —
 * `current_sensitive_fields()`'s untemplated path, rule for rule: the Principal
 * and HR the NRIC and bank accounts, Finance the bank accounts, and salary
 * amounts wherever the account holds `salary_individual`. The view-as switch
 * asks it with the viewed role's default keys.
 */
export function sensitiveFromKeys(keys: readonly string[], role: string): SensitiveField[] {
  const out = new Set<SensitiveField>()
  if (role === 'principal' || role === 'hr') {
    out.add('bank')
    out.add('nric')
  }
  if (role === 'finance') out.add('bank')
  if (keys.includes('salary_individual')) out.add('salary')
  return [...out].sort()
}

/** Why a file is refused — the sentence a download answers with. */
export function needsTick(field: SensitiveField, what: string): string {
  const label = field === 'nric' ? 'NRIC / IC' : field === 'bank' ? 'Bank accounts' : 'Salary amounts'
  return `${what} needs ${label} ticked for your title — whoever manages permissions can tick it on People › Permissions.`
}
