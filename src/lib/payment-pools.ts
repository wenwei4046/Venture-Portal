// The pools a payment voucher can draw on (or land in), as the forms list them.
//
// Create payment carried this list as a literal, and a literal list of pools
// leaves out every department provisioned after it was written: IT and Revenue
// Department each have a pool the database resolves (pool_key_to_segment), yet
// neither could be picked on the form until 2026-10-02. The core entries stay
// here; the rest come from the department registry, so the next department
// needs no code change.

import { extraFullDepts, type DeptRegistryRow } from './dept-registry'

export interface PoolOption {
  value: string
  label: string
}

export const PAYMENT_POOL_OPTIONS: PoolOption[] = [
  { value: 'venture_pool', label: 'Venture Pool' },
  { value: 'dept_pool_hr', label: 'HR Dept Pool' },
  { value: 'dept_pool_finance', label: 'Finance Dept Pool' },
  { value: 'dept_pool_director_office', label: 'Director Office Dept Pool' },
  { value: 'dept_pool_director', label: 'Director Pool' },
  { value: 'dept_pool_marketing', label: 'Marketing Dept Pool' },
  { value: 'invoice_payout_pool', label: 'Invoice Payout Pool' },
]

/** Pools of the departments beyond the core five, from the registry. */
export function registryPoolOptions(registry: DeptRegistryRow[]): PoolOption[] {
  return extraFullDepts(registry).map((d) => ({
    value: `dept_pool_${d.segmentKey}`,
    label: `${d.name} Dept Pool`,
  }))
}

/** The core pools followed by any extras not already among them. */
export function paymentPoolOptions(extra: PoolOption[] = []): PoolOption[] {
  return [...PAYMENT_POOL_OPTIONS, ...extra.filter((p) => !PAYMENT_POOL_OPTIONS.some((o) => o.value === p.value))]
}
