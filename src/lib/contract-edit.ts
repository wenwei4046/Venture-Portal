// A marketing contract's Edit sends only what was changed (2026-10-16 — the
// user's rule of 2026-10-14: the shared logins open one contract on two
// screens, and a form written back whole puts back what the other changed);
// `updateContract` writes only what it is sent. The form's own names, so the
// desktop's ContractForm and the Finance phone app's sheet send alike. Pure.

export interface ContractFields {
  companyId: string
  description: string
  /** RM, as typed. */
  amount: string
  /** `YYYY-MM-DD`, or '' for none. */
  startDate: string
  endDate: string
}

const NAMES: Record<keyof ContractFields, string> = {
  companyId: 'company_id',
  description: 'description',
  amount: 'amount',
  startDate: 'start_date',
  endDate: 'end_date',
}

function same(key: keyof ContractFields, a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true
  if (key !== 'amount' || a.trim() === '' || b.trim() === '') return false
  const p = Number(a)
  const q = Number(b)
  return Number.isFinite(p) && Number.isFinite(q) && Math.abs(p - q) < 0.005
}

/** A new contract: every field, under the form's names. */
export function contractNewForm(now: ContractFields): FormData {
  const fd = new FormData()
  for (const key of Object.keys(NAMES) as Array<keyof ContractFields>) fd.set(NAMES[key], now[key].trim())
  return fd
}

/** An edited one: the contract, and only the fields changed. */
export function contractEditForm(id: string, was: ContractFields, now: ContractFields): FormData {
  const fd = new FormData()
  fd.set('id', id)
  for (const key of Object.keys(NAMES) as Array<keyof ContractFields>) {
    if (!same(key, was[key], now[key])) fd.set(NAMES[key], now[key].trim())
  }
  return fd
}

/** The edit sends nothing but the contract: nothing to save. */
export const contractEditsNothing = (fd: FormData) => [...fd.keys()].every((k) => k === 'id')

/** The desktop form's fields, read back by their names. */
export function contractFieldsOf(fd: FormData): ContractFields {
  const s = (k: string) => (fd.get(k) as string | null) ?? ''
  return { companyId: s('company_id'), description: s('description'), amount: s('amount'), startDate: s('start_date'), endDate: s('end_date') }
}
