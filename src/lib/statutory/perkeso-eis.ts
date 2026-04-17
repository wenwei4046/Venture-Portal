/**
 * PERKESO Borang 4 — monthly EIS contribution submission.
 * MVP CSV approximation; verify against PERKESO ASSIST before going live.
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
  'WAGES',
  'EIS_EE',
  'EIS_ER',
  'TOTAL',
]

export function generatePerkesoEis(
  contributors: StatutoryContributor[],
  meta: StatutoryFileMetadata,
): StatutoryGenerateResult {
  const period = periodYYYYMM(meta.period)
  const rows: string[] = [HEADERS.join(',')]
  const skipped: StatutoryGenerateResult['skipped'] = []
  let rowCount = 0
  let totalAmount = 0

  for (const c of contributors) {
    const nric = formatNric(c.nric)
    if (!nric) {
      skipped.push({ name: c.fullName, reason: 'missing_nric' })
      continue
    }
    const total = c.eisEe + c.eisEr
    rows.push(
      [
        period,
        csvEscape(meta.employerReference),
        nric,
        csvEscape(c.fullName),
        c.statutoryWages.toFixed(2),
        c.eisEe.toFixed(2),
        c.eisEr.toFixed(2),
        total.toFixed(2),
      ].join(','),
    )
    rowCount++
    totalAmount += total
  }

  return {
    csv: rows.join('\r\n') + '\r\n',
    rowCount,
    totalAmount: Number(totalAmount.toFixed(2)),
    skipped,
  }
}
