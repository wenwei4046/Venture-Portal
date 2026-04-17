/**
 * LHDN CP39 — monthly PCB (tax) submission.
 * MVP CSV approximation; verify against LHDN MyTax before going live.
 *
 * The real CP39 format is a fixed-width text file — port this to that
 * schema once we confirm the exact column widths from a current sample.
 */

import {
  csvEscape,
  formatNric,
  periodYYYYMM,
  type StatutoryContributor,
  type StatutoryFileMetadata,
  type StatutoryGenerateResult,
} from './types'

const HEADERS = [
  'PERIOD',
  'EMPLOYER_REF',
  'NRIC',
  'NAME',
  'TAXABLE_INCOME',
  'PCB',
]

export function generateLhdnCp39(
  contributors: StatutoryContributor[],
  meta: StatutoryFileMetadata,
): StatutoryGenerateResult {
  const period = periodYYYYMM(meta.period)
  const rows: string[] = [HEADERS.join(',')]
  const skipped: StatutoryGenerateResult['skipped'] = []
  let rowCount = 0
  let totalAmount = 0

  for (const c of contributors) {
    // Skip zero-PCB rows — LHDN only wants rows with actual tax to submit
    if (c.pcb <= 0) continue

    const nric = formatNric(c.nric)
    if (!nric) {
      skipped.push({ name: c.fullName, reason: 'missing_nric' })
      continue
    }
    rows.push(
      [
        period,
        csvEscape(meta.employerReference),
        nric,
        csvEscape(c.fullName),
        c.taxableIncome.toFixed(2),
        c.pcb.toFixed(2),
      ].join(','),
    )
    rowCount++
    totalAmount += c.pcb
  }

  return {
    csv: rows.join('\r\n') + '\r\n',
    rowCount,
    totalAmount: Number(totalAmount.toFixed(2)),
    skipped,
  }
}
