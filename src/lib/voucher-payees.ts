import type { SupabaseClient } from '@supabase/supabase-js'

// A payment's Pay into (2026-11-09, mig 20261109120000): the bank and account a voucher pays into, kept in
// payment_voucher_payees and reached only through its database functions — `voucher_payees` reads them (the whole
// number for the Bank tick, else "•••• 4821"), `voucher_payee_set` writes one typed in Create payment or Edit,
// `voucher_payee_copy` gives a copy its source's. Optional: most payments name none.

export interface VoucherPayee {
  bank: string | null
  account: string | null
}

/** The account as the database files it: no spaces or dashes. */
export const accountDigits = (s: string) => s.replace(/[\s-]/g, '')

/** What is wrong with a typed Pay into — or null (both blank is fine: it is optional). */
export function payeeProblem(bank: string, account: string): string | null {
  if (bank.trim().length > 120) return 'Keep the bank’s name short.'
  const digits = accountDigits(account)
  if (digits && !/^[0-9A-Za-z]{4,30}$/.test(digits)) return 'An account number is digits only.'
  return null
}

/** "Maybank 5140123400009", "Maybank •••• 0009", or what of it there is; null for none. */
export function payIntoText(p: VoucherPayee | null | undefined): string | null {
  if (!p) return null
  const text = [p.bank, p.account].filter(Boolean).join(' ').trim()
  return text || null
}

/** A number the reader may not see whole — as the database hands it without the Bank tick. */
export const isMaskedAccount = (account: string | null | undefined) => !!account && account.startsWith('••••')

/**
 * As the Principal's view-as may see it: the database answers for the real account, so a page viewed as somebody
 * without the Bank tick masks what it was handed (lib/sensitive.ts).
 */
export function payeeAsSeen(p: VoucherPayee, seesBank: boolean): VoucherPayee {
  if (seesBank || !p.account || isMaskedAccount(p.account)) return p
  return { bank: p.bank, account: `•••• ${p.account.slice(-4)}` }
}

/** The vouchers' Pay into, by voucher id. A reader the database refuses gets none, quietly — the list still opens. */
export async function readVoucherPayees(supabase: SupabaseClient, ids: readonly string[]): Promise<Map<string, VoucherPayee>> {
  const out = new Map<string, VoucherPayee>()
  if (ids.length === 0) return out
  for (let i = 0; i < ids.length; i += 500) {
    let read: { data: unknown; error: unknown }
    try {
      read = await supabase.rpc('voucher_payees', { p_ids: ids.slice(i, i + 500) })
    } catch {
      return out
    }
    const { data, error } = read
    if (error) return out
    for (const r of (data ?? []) as Array<{ voucher_id: string; bank: string | null; account_no: string | null }>) {
      out.set(r.voucher_id, { bank: r.bank, account: r.account_no })
    }
  }
  return out
}
