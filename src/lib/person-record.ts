// A person's full page, edited where it stands (2026-10-14, the user: "when i
// press edit, no need jump to another tab, it should be can edit key in
// column"). Edit turns each fact into its field in the same row; one bar at
// the sheet's foot saves. What the pay basis offers, how it travels in the
// form `updateStaff` reads, and the words it reads as — shared by the read and
// the edit rows, so the two cannot say different things.
import { isFullyCommissionBased, isVariablePay } from './staff-form'

/**
 * How a person is paid, as the record's one Employment Type row says it.
 * Fully commission based (a commission department, commission-eligible) and
 * Variable pay (the Director department's) leave no basic on the record.
 */
export type PayMode = 'full_commission' | 'variable' | 'salaried' | 'commission_eligible'

export const PAY_MODE_LABEL: Readonly<Record<PayMode, string>> = {
  full_commission: 'Fully commission based',
  variable: 'Variable pay',
  salaried: 'Salaried',
  commission_eligible: 'Commission-eligible',
}

export function payModeOf(row: { employment_type: string; commission_dept: boolean }): PayMode {
  if (isFullyCommissionBased(row)) return 'full_commission'
  if (isVariablePay(row)) return 'variable'
  return row.employment_type === 'commission_eligible' ? 'commission_eligible' : 'salaried'
}

/**
 * The choices a person's department offers — the old Edit page's: a
 * commission department ticked Fully commission based or not (then a basic),
 * the Director department Variable pay or not, any other department picked
 * Salaried or Commission-eligible. What they hold today is always among them,
 * so a save that does not touch the row cannot change it.
 */
export function payModeChoices(row: { commission_dept: boolean; director_dept: boolean }, current: PayMode): PayMode[] {
  const offered: PayMode[] = row.commission_dept
    ? ['full_commission', 'salaried']
    : row.director_dept
      ? ['variable', 'salaried']
      : ['salaried', 'commission_eligible']
  return offered.includes(current) ? offered : [current, ...offered]
}

/**
 * What a pay basis sends to `updateStaff`: the ticks the old form had
 * (`full_commission`, `variable_pay`) or its Employment Type select — the
 * action and `payFieldsForUpdate` read exactly these.
 */
export function payModeFields(mode: PayMode): Record<string, string> {
  switch (mode) {
    case 'full_commission':
      return { full_commission: 'on' }
    case 'variable':
      return { variable_pay: 'on' }
    default:
      return { employment_type: mode }
  }
}

/** Fully commission based carries no basic and no statutory: those rows are not shown, nor asked. */
export const asksStatutory = (mode: PayMode) => mode !== 'full_commission'

/** The basic and both allowances are asked only of a fixed pay. */
export const asksPay = (mode: PayMode) => mode === 'salaried' || mode === 'commission_eligible'

export const EPF_LABELS: Readonly<Record<string, string>> = {
  A: 'Part A (Citizen, under 60)',
  C: 'Part C (Citizen, 60+)',
  E: 'Part E (Non-citizen, under 60)',
  F: 'Part F (Non-citizen, 60+)',
}

export const SOCSO_LABELS: Readonly<Record<string, string>> = {
  first: 'First',
  second: 'Second',
}

export const PCB_LABELS: Readonly<Record<string, string>> = {
  KA1: 'KA1 (Single)',
  KA2: 'KA2 (Married, spouse not working)',
  KA3: 'KA3 (Married, spouse working)',
}

/** The save bar's count: "No changes", "1 change", "3 changes". */
export function changesLabel(count: number): string {
  if (count === 0) return 'No changes'
  return `${count} change${count === 1 ? '' : 's'}`
}

/**
 * The named fields of a form whose value is not the one it was drawn with —
 * the browser keeps that first value (`defaultValue`, `defaultChecked`, an
 * option's `defaultSelected`), so a field typed back to what it was counts
 * as unchanged. Hidden fields ride along with a choice that counts itself.
 */
export function changedFields(form: HTMLFormElement): Set<string> {
  const out = new Set<string>()
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement) {
      if (!el.name || el.type === 'hidden' || el.disabled) continue
      const changed = el.type === 'checkbox' || el.type === 'radio' ? el.checked !== el.defaultChecked : el.value !== el.defaultValue
      if (changed) out.add(el.name)
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.name && !el.disabled && el.value !== el.defaultValue) out.add(el.name)
    } else if (el instanceof HTMLSelectElement) {
      if (el.name && !el.disabled && Array.from(el.options).some(o => o.selected !== o.defaultSelected)) out.add(el.name)
    }
  }
  return out
}
