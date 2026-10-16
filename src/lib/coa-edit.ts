// What an account's edit sends (2026-10-15, Settings › Chart of Accounts and
// the Finance phone app's): the account's code — the key — and ONLY what the
// person changed. A whole-record save wrote back every field as it was when
// the form opened, so a change somebody else made meanwhile (the logins are
// shared, two open copies are normal) was quietly put back — the user's rule:
// an edit form saves only the fields that changed. Pure.

import { CASH_FLOW_CATEGORIES, type AccountType, type CashFlowCategory } from './coa'

export interface CoaAccount {
  code: string
  name: string
  type: AccountType
  cash_flow_category: CashFlowCategory
  parent_code: string | null
  is_active: boolean
  sort_order: number
}

/** The form as the person left it. */
export interface AccountDraft {
  type: AccountType
  /** The code typed (a rename re-points the account's history). */
  code: string
  name: string
  cashFlow: CashFlowCategory
  /** '' = top level. */
  parent: string
  active: boolean
}

export interface AccountEdit {
  form: FormData
  /** A new type: a new code in the new range, every past transaction re-pointed (asked first). */
  typeChange: boolean
  /** A new code, same type: every past transaction re-pointed (asked first). */
  codeChange: boolean
  /** Nothing to save. */
  nothing: boolean
}

export function accountEdit(initial: CoaAccount, d: AccountDraft): AccountEdit {
  const form = new FormData()
  form.set('code', initial.code)
  const typeChange = d.type !== initial.type
  const typed = d.code.trim()
  const codeChange = !typeChange && typed !== '' && typed !== initial.code
  // A type change owns the code (it picks one in the new range), so no rename rides with it.
  if (typeChange) form.set('new_type', d.type)
  else if (codeChange) form.set('new_code', typed)
  const name = d.name.trim()
  if (name !== initial.name) form.set('name', name)
  if (d.cashFlow !== initial.cash_flow_category) form.set('cash_flow_category', d.cashFlow)
  if (d.active !== initial.is_active) form.set('is_active', d.active ? 'true' : 'false')
  // A type change detaches the account (the old parent is the old type); otherwise the parent only when it moved.
  if (!typeChange && d.parent !== (initial.parent_code ?? '')) form.set('parent_code', d.parent)
  return { form, typeChange, codeChange, nothing: !typeChange && !codeChange && [...form.keys()].length === 1 }
}

/**
 * The accounts an account may sit under: its own type, active, never itself
 * or one of its own sub-accounts (a cycle) — code order (the database's
 * same-type and no-cycle rules, drawn as the choice).
 */
export function parentChoices(accounts: readonly CoaAccount[], type: AccountType, self: string | null): CoaAccount[] {
  const below = new Set<string>(self ? [self] : [])
  let grew = true
  while (grew && self) {
    grew = false
    for (const a of accounts) {
      if (a.parent_code && below.has(a.parent_code) && !below.has(a.code)) {
        below.add(a.code)
        grew = true
      }
    }
  }
  return accounts.filter((a) => a.type === type && a.is_active && !below.has(a.code)).sort((a, b) => a.code.localeCompare(b.code))
}

export interface AccountRowUpdates {
  name?: string
  is_active?: boolean
  cash_flow_category?: CashFlowCategory
  parent_code?: string | null
}

/**
 * What an account's edit writes on its row (`updateAccount`): only the fields
 * the form carries — one it leaves out stays as it is. A name sent must not be
 * empty; a cash flow category sent must be one; the parent is left alone on a
 * type change (the type change detached it). Checked before anything is written.
 */
export function accountRowUpdates(fd: FormData, typeChange: boolean): { ok: true; updates: AccountRowUpdates } | { ok: false; error: string } {
  const updates: AccountRowUpdates = {}
  if (fd.has('name')) {
    const name = String(fd.get('name') ?? '').trim()
    if (!name) return { ok: false, error: 'Account name is required' }
    updates.name = name
  }
  if (fd.has('is_active')) updates.is_active = fd.get('is_active') === 'on' || fd.get('is_active') === 'true'
  const cfc = String(fd.get('cash_flow_category') ?? '').trim()
  if (cfc) {
    if (!(CASH_FLOW_CATEGORIES as readonly string[]).includes(cfc)) return { ok: false, error: 'Invalid cash flow category' }
    updates.cash_flow_category = cfc as CashFlowCategory
  }
  if (fd.has('parent_code') && !typeChange) {
    const parent = String(fd.get('parent_code') ?? '').trim()
    updates.parent_code = parent === '' ? null : parent
  }
  return { ok: true, updates }
}
