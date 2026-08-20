// Daily Bank dashboard — data layer. One fetch per day, shared by the page
// and the PDF export so screen and file always agree.
//
// Sources (all GL-true, not the bank cache):
//   B/F        = Σ journal_lines on the bank's GL code, JE date < D
//   In/Out D   = Σ debits / credits dated D, split by the JE's segment
//   Pending    = PVs submitted on/before D and NOT approved by end of D
//                (approval_requests.created_at / approved_at — historical
//                days are reconstructed from these timestamps, so a voided
//                or rejected item's disappearance time is approximate)
//   Receipts D = credit vouchers (OR) with payment_date = D per bank
// Timestamps are anchored to Malaysia time (+08:00, no DST).

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import {
  applyPoolAdjust,
  buildBankDay,
  columnForPool,
  columnForSegment,
  emptyAmounts,
  addAmounts,
  totalsAcrossBanks,
  type BankDay,
  type DbColumn,
  type PendingItem,
  type ReceiptItem,
  type SegAmounts,
} from '@/lib/daily-bank'

const r2 = (n: number) => Math.round(n * 100) / 100

export interface DailyBankData {
  date: string
  banks: BankDay[]
  totals: ReturnType<typeof totalsAcrossBanks>
}

export async function fetchDailyBank(
  supabase: SupabaseClient,
  date: string, // YYYY-MM-DD
): Promise<DailyBankData> {
  const dayEndIso = `${date}T23:59:59.999+08:00`

  const { data: bankRows } = await supabase
    .from('bank_accounts')
    .select('id, bank_name, gl_account_code, is_primary')
    .eq('status', 'active')
    .order('is_primary', { ascending: false })
  const banks = ((bankRows ?? []) as Array<{
    id: string
    bank_name: string
    gl_account_code: string | null
    is_primary: boolean
  }>).filter(b => b.gl_account_code)
  const codes = banks.map(b => b.gl_account_code as string)
  if (codes.length === 0) return { date, banks: [], totals: totalsAcrossBanks([]) }

  // ── GL lines on every bank code up to D, with the JE's segment ──
  const glRows = (await fetchAllRows((lo, hi) =>
    supabase
      .from('journal_lines')
      .select('account_code, debit, credit, journal_entries!inner(transaction_date, segment, is_reversed)')
      .in('account_code', codes)
      .lte('journal_entries.transaction_date', date)
      .eq('journal_entries.is_reversed', false)
      .order('id')
      .range(lo, hi),
  )) as unknown as Array<{
    account_code: string
    debit: number | null
    credit: number | null
    journal_entries: { transaction_date: string; segment: string | null }
  }>

  const byCode = new Map<string, { bf: SegAmounts; inToday: SegAmounts; outToday: SegAmounts }>()
  for (const code of codes) {
    byCode.set(code, { bf: emptyAmounts(), inToday: emptyAmounts(), outToday: emptyAmounts() })
  }
  for (const l of glRows) {
    const bucket = byCode.get(l.account_code)
    if (!bucket) continue
    const col = columnForSegment(l.journal_entries.segment)
    const signed = r2(Number(l.debit ?? 0) - Number(l.credit ?? 0))
    if (l.journal_entries.transaction_date < date) {
      addAmounts(bucket.bf, col, signed)
    } else {
      // dated D — split into in (debits) / out (credits)
      if (Number(l.debit ?? 0) > 0) addAmounts(bucket.inToday, col, Number(l.debit ?? 0))
      if (Number(l.credit ?? 0) > 0) addAmounts(bucket.outToday, col, Number(l.credit ?? 0))
    }
  }

  // ── Pending as at end of D: submitted ≤ D, not approved by D ──
  const arRows = (await fetchAllRows((lo, hi) =>
    supabase
      .from('approval_requests')
      .select('reference_id, status, created_at, approved_at, updated_at')
      .eq('reference_table', 'payment_vouchers')
      .lte('created_at', dayEndIso)
      .order('id')
      .range(lo, hi),
  )) as Array<{
    reference_id: string
    status: string
    created_at: string
    approved_at: string | null
    updated_at: string
  }>
  const pendingIds = [
    ...new Set(
      arRows
        .filter(ar => {
          if (ar.approved_at && ar.approved_at <= dayEndIso) return false // approved by D
          if (ar.status === 'rejected' && ar.updated_at <= dayEndIso) return false // rejected by D
          return true
        })
        .map(ar => ar.reference_id),
    ),
  ]

  let pendingByBank = new Map<string, PendingItem[]>()
  if (pendingIds.length > 0) {
    const { data: pvRows } = await supabase
      .from('payment_vouchers')
      .select('id, voucher_no, payee_name, description, amount, bank_account_id, direction, status, updated_at')
      .in('id', pendingIds)
    const vouchers = ((pvRows ?? []) as Array<{
      id: string
      voucher_no: string | null
      payee_name: string | null
      description: string | null
      amount: number
      bank_account_id: string | null
      direction: string
      status: string
      updated_at: string
    }>).filter(
      v =>
        v.direction === 'debit' &&
        // voided before/on D → was gone by then (void time ≈ updated_at)
        !(v.status === 'voided' && v.updated_at <= dayEndIso),
    )

    const { data: srcRows } = await supabase
      .from('payment_voucher_sources')
      .select('voucher_id, pool, amount, role')
      .in('voucher_id', vouchers.map(v => v.id))
    const srcByVoucher = new Map<string, Array<{ pool: string | null; amount: number }>>()
    for (const s of ((srcRows ?? []) as Array<{
      voucher_id: string
      pool: string | null
      amount: number
      role: string | null
    }>)) {
      if (s.role === 'mirror') continue // paying-dept mirror rows are the OTHER side
      const list = srcByVoucher.get(s.voucher_id) ?? []
      list.push({ pool: s.pool, amount: Number(s.amount) })
      srcByVoucher.set(s.voucher_id, list)
    }

    pendingByBank = new Map()
    for (const v of vouchers) {
      if (!v.bank_account_id) continue
      const amounts = emptyAmounts()
      const srcs = srcByVoucher.get(v.id) ?? []
      if (srcs.length > 0) {
        for (const s of srcs) addAmounts(amounts, columnForPool(s.pool), s.amount)
      } else {
        addAmounts(amounts, 'venture', Number(v.amount))
      }
      const item: PendingItem = {
        voucherNo: v.voucher_no ?? '—',
        payee: v.payee_name ?? '—',
        description: v.description ?? '',
        amounts,
        total: r2(Number(v.amount)),
      }
      const list = pendingByBank.get(v.bank_account_id) ?? []
      list.push(item)
      pendingByBank.set(v.bank_account_id, list)
    }
    // Voucher-number order (= submit order) — the .in() fetch above returns
    // rows in arbitrary DB order, which read as a jumble on the day sheet.
    for (const list of pendingByBank.values()) {
      list.sort((a, b) => a.voucherNo.localeCompare(b.voucherNo))
    }
  }

  // ── Receipts (OR vouchers) dated D, itemised for the by-bank view ──
  const { data: orRows } = await supabase
    .from('payment_vouchers')
    .select('voucher_no, payee_name, description, amount, bank_account_id')
    .eq('direction', 'credit')
    .neq('status', 'voided')
    .eq('payment_date', date)
  const receiptsByBank = new Map<string, ReceiptItem[]>()
  for (const r of ((orRows ?? []) as Array<{
    voucher_no: string | null
    payee_name: string | null
    description: string | null
    amount: number
    bank_account_id: string | null
  }>)) {
    if (!r.bank_account_id) continue
    const list = receiptsByBank.get(r.bank_account_id) ?? []
    list.push({
      voucherNo: r.voucher_no ?? '—',
      payer: r.payee_name ?? '—',
      description: r.description ?? '',
      amount: r2(Number(r.amount)),
    })
    receiptsByBank.set(r.bank_account_id, list)
  }

  let days = banks.map(b => {
    const bucket = byCode.get(b.gl_account_code as string) ?? {
      bf: emptyAmounts(),
      inToday: emptyAmounts(),
      outToday: emptyAmounts(),
    }
    return buildBankDay({
      bankId: b.id,
      bankName: b.bank_name,
      glCode: b.gl_account_code as string,
      bf: bucket.bf,
      inToday: bucket.inToday,
      outToday: bucket.outToday,
      pending: pendingByBank.get(b.id) ?? [],
      receipts: receiptsByBank.get(b.id) ?? [],
    })
  })

  // TODAY only: fold the inter-billing pool-vs-GL gap into the primary bank —
  // the dept-pool page's own algorithm — so each department column equals the
  // "By department" cash the user already trusts (user 2026-08-11: 直接拿现有
  // department 的 cash 当做 opening). Past dates stay GL-only (pool history is
  // not date-sliced), stated in the legend.
  if (date === dayjs().format('YYYY-MM-DD')) {
    const [{ data: balances }, { data: deptRows }] = await Promise.all([
      supabase.from('dept_pool_balances').select('department_id, balance'),
      supabase.from('departments').select('id, name, is_internal'),
    ])
    const balanceByDept = new Map(
      ((balances ?? []) as Array<{ department_id: string; balance: number }>).map(b => [
        b.department_id,
        Number(b.balance),
      ]),
    )
    const nameToCol: Record<string, DbColumn> = {
      Director: 'director',
      'Director Office': 'director_office',
      Finance: 'finance',
      HR: 'hr',
      Marketing: 'marketing',
    }
    const targets: Partial<Record<DbColumn, number>> = {}
    let ventureOverlay = 0
    for (const d of ((deptRows ?? []) as Array<{ id: string; name: string; is_internal: boolean }>)) {
      if (d.is_internal && d.name === 'Venture Office') {
        ventureOverlay = balanceByDept.get(d.id) ?? 0
        continue
      }
      const col = nameToCol[d.name]
      if (col) targets[col] = balanceByDept.get(d.id) ?? 0
    }
    days = applyPoolAdjust(days, targets, ventureOverlay, banks[0]?.id ?? '')
  }

  return { date, banks: days, totals: totalsAcrossBanks(days) }
}
