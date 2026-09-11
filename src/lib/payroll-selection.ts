import { round2, salaryComponents, type CyclePerson, type Granularity } from './payment-cycle'
import { getStaffBankAccount, type BankAccountSelection } from './staff-bank-accounts'

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

export type SalaryComponentSelection = {
  payroll_row_id: string
  component: 'net' | 'basic' | 'commission'
  account: BankAccountSelection
  expected_amount?: number
  expected_bank_name?: string | null
  expected_bank_account_no?: string | null
}

export function salaryComponentLabel(component: SalaryComponentSelection['component']) {
  return component === 'basic' ? 'Net basic' : component === 'commission' ? 'Commission' : 'Net salary'
}

/** A selection names payment components, so paying basic never consumes commission. */
export function payrollComponentSelection(
  people: CyclePerson[], selectedKeys: readonly string[] | null, granularity: Granularity,
  accounts: Readonly<Record<string, BankAccountSelection>> = {},
) {
  const wanted = selectedKeys == null ? null : new Set(selectedKeys)
  const lines = people.flatMap(person => salaryComponents(person).map(component => {
    const key = `${person.row_id}:${component.component}`
    const liveVoucher = component.voucher?.status === 'voided' ? null : component.voucher
    const account = liveVoucher ? component.recipient_account ?? 'account_1' : accounts[key] ?? 'account_1'
    const recipient = liveVoucher
      ? { bankName: component.bank_name, accountNo: component.bank_account_no }
      : getStaffBankAccount(person, account)
    return { key, person, ...component, voucher: liveVoucher, account, recipient }
  }))
  const eligible = lines.filter(line => line.amount > 0 && !line.voucher)
  const selected = eligible.filter(line => wanted == null || wanted.has(line.key) || wanted.has(line.person.row_id))
  const rowIds = [...new Set(selected.map(line => line.person.row_id))]
  const selectedPeople = people.filter(person => rowIds.includes(person.row_id))
  return {
    lines, eligible, selected, selectedPeople, rowIds,
    selectionKeys: selected.map(line => line.key),
    count: rowIds.length,
    lineCount: selected.length,
    total: round2(selected.reduce((sum, line) => sum + line.amount, 0)),
    voucherCount: granularity === 'department' ? new Set(selected.map(line => line.component)).size : selected.length,
    componentSelections: selected.map(line => ({ payroll_row_id: line.person.row_id, component: line.component, account: line.account,
      expected_amount: line.amount, expected_bank_name: line.recipient.bankName, expected_bank_account_no: line.recipient.accountNo })),
    missingAccounts: selected.filter(line => line.person.scope === 'staff' && (!line.recipient.bankName?.trim() || /^\d+$/.test(line.recipient.bankName.trim()) || !line.recipient.accountNo || !/^\d+$/.test(line.recipient.accountNo))),
    negativeComponents: lines.filter(line => rowIds.includes(line.person.row_id) && line.amount < 0),
  }
}
