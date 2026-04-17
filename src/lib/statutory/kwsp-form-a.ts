/**
 * KWSP Form A — monthly EPF contribution submission.
 * MVP CSV approximation; verify against KWSP i-Akaun before going live.
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
  'EPF_EE',
  'EPF_ER',
  'TOTAL',
]

export function generateKwspFormA(
  contributors: StatutoryContributor[],
  meta: StatutoryFileMetadata,
): StatutoryGenerateResult {
  const period = periodYYYYMM(meta.period)
  const rows: string[] = [HEADERS.join(',')]
  const skipped: StatutoryGenerateResult['skipped'] = []
  let rowCount = 0
  let totalAmount = 0

  for (const c of contributors) {
    // Anyone with 0 EPF contribution (exempt or below threshold) is filed too.
    const nric = formatNric(c.nric)
    if (!nric) {
      skipped.push({ name: c.fullName, reason: 'missing_nric' })
      continue
    }
    const total = c.epfEe + c.epfEr
    rows.push(
      [
        period,
        csvEscape(meta.employerReference),
        nric,
        csvEscape(c.fullName),
        c.statutoryWages.toFixed(2),
        c.epfEe.toFixed(2),
        c.epfEr.toFixed(2),
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
