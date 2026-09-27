import { round2, statutoryPayable, type CyclePerson, type Granularity, type Scheme, type StatutoryCoverage } from './payment-cycle'

/** Preview remaining contributions, even when one of PERKESO's schemes exists. */
export function statutorySelection(
  people: CyclePerson[], schemes: readonly Scheme[], coverage: readonly StatutoryCoverage[],
  selectedIds: readonly string[] | null, granularity: Granularity,
) {
  // What can be raised now: the funded part of each scheme, less what
  // vouchers already cover — so a resubmit raises only its difference.
  const remaining = (p: CyclePerson, s: Scheme) => statutoryPayable(coverage, p, s)
  const uniqueSchemes = [...new Set(schemes)]
  const eligible = people.filter(p => uniqueSchemes.some(s => remaining(p, s) > 0))
  const wanted = selectedIds == null ? null : new Set(selectedIds)
  const selected = wanted == null ? eligible : eligible.filter(p => wanted.has(p.row_id))
  const lines = selected.flatMap(person => uniqueSchemes.filter(s => remaining(person, s) > 0)
    .map(scheme => ({ person, scheme, amount: remaining(person, scheme) })))
  const departmentKeys = new Set(lines.map(l => `${l.person.scope}:${l.person.dept_id ?? l.person.dept_name}:${l.scheme}`))
  return {
    eligible, selected, lines, rowIds: selected.map(p => p.row_id), count: selected.length,
    total: round2(lines.reduce((t, l) => t + l.amount, 0)),
    voucherCount: granularity === 'employee' ? lines.length : departmentKeys.size,
  }
}
