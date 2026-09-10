import { round2, type CyclePerson, type Granularity } from './payment-cycle'

/** Preview exactly the payable rows included in a new salary batch. */
export function payrollSelection(people: CyclePerson[], selectedIds: readonly string[] | null, granularity: Granularity) {
  const eligible = people.filter((person) => person.net > 0 && !person.voucher)
  const wanted = selectedIds == null ? null : new Set(selectedIds)
  const selected = wanted == null ? eligible : eligible.filter((person) => wanted.has(person.row_id))
  return {
    eligible,
    selected,
    rowIds: selected.map((person) => person.row_id),
    count: selected.length,
    total: round2(selected.reduce((sum, person) => sum + person.net, 0)),
    voucherCount: granularity === 'department' ? Number(selected.length > 0) : selected.length,
  }
}
