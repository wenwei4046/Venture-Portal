/**
 * PERKESO Borang 8A — monthly SOCSO contribution submission.
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
  'SOCSO_EE',
  'SOCSO_ER',
  'TOTAL',
]

export function generatePerkesoSocso(
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
    const total = c.socsoEe + c.socsoEr
    rows.push(
      [
        period,
        csvEscape(meta.employerReference),
        nric,
        csvEscape(c.fullName),
        c.statutoryWages.toFixed(2),
        c.socsoEe.toFixed(2),
        c.socsoEr.toFixed(2),
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
