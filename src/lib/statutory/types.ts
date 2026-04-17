/**
 * Shared types for the 4 Malaysian statutory file generators (Spec 6).
 *
 * One StatutoryContributor row = one person (staff or director) for one
 * period, already merged by the caller. Each generator reads only the
 * fields it needs.
 *
 * Real schemas: verify against the test portals before relying on output.
 *   - KWSP i-Akaun: https://secure.kwsp.gov.my/
 *   - PERKESO ASSIST: https://assist.perkeso.gov.my/
 *   - LHDN MyTax (for CP39): https://mytax.hasil.gov.my/
 */

export interface StatutoryContributor {
  /** Employee code or director code — used in PAYER_REFERENCE style fields. */
  code: string | null
  fullName: string
  nric: string | null
  /** Basic + statutory allowance (the EPF wage base, already pro-rated). */
  statutoryWages: number
  /** Gross - EPF EE (for PCB). */
  taxableIncome: number

  epfEr: number
  epfEe: number
  socsoEr: number
  socsoEe: number
  eisEr: number
  eisEe: number
  pcb: number
}

export interface StatutoryFileMetadata {
  /** YYYY-MM-01 for the period this file covers. */
  period: string
  /** Employer NRIC number (KWSP / PERKESO reference). Free text for MVP. */
  employerReference: string
}

export interface StatutoryGenerateResult {
  csv: string
  rowCount: number
  totalAmount: number
  skipped: Array<{ name: string; reason: 'missing_nric' }>
}

export function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function formatNric(nric: string | null): string | null {
  if (!nric) return null
  // Strip dashes + spaces. KWSP / PERKESO / LHDN all want digits-only.
  return nric.replace(/[-\s]/g, '')
}

export function periodYYYYMM(period: string): string {
  // '2026-04-01' → '202604'
  return period.slice(0, 4) + period.slice(5, 7)
}
