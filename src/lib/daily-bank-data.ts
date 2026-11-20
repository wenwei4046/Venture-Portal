// Daily Bank dashboard — data layer. One fetch per day, shared by the page
// and the PDF export so screen and file always agree.
//
// Sources (all GL-true, not the bank cache):
//   B/F        = Σ journal_lines on the bank's GL code, JE date < D
//   In/Out D   = Σ debits / credits dated D, split by the JE's segment
//   Pending    = PVs submitted on/before D and NOT approved by end of D
//                (a payroll funding transfer moves money, it does not spend
//                it: out of its bank and into the one it funds, HR's column)
//                (approval_requests.created_at / approved_at — historical
//                days are reconstructed from these timestamps, so a voided
//                or rejected item's disappearance time is approximate)
//   Receipts D = credit vouchers (OR) with payment_date = D per bank
// Timestamps are anchored to Malaysia time (+08:00, no DST).

import { officeToday } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/paginate'
import { isPayrollReference } from '@/lib/payroll-vouchers'
import { startRead } from '@/lib/start-read'
import {
  applyPoolAdjust,
  buildBankDay,
  columnForPool,
  columnForSegment,
  dbColumnsWithLabels,
  emptyAmounts,
  addAmounts,
  setExtraDbColumns,
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
  /** Column set for the view/export — the six cores + one per provisioned
   *  full department. Travels in the payload because the view is a client
   *  component and can't read the server module's column state. */
  columns: Array<{ key: string; label: string }>
}

export async function fetchDailyBank(
  supabase: SupabaseClient,
  date: string, // YYYY-MM-DD
  // false = the account may not see what one named person is paid
  // (canSeePayrollPayouts): its pending payroll is one line per bank.
  opts: { seesPayroll: boolean },
): Promise<DailyBankData> {
  const dayEndIso = `${date}T23:59:59.999+08:00`

  // ── Every read the day needs, started together (2026-10-08) ──────────
  // One after another they were eight round trips (~415 ms in production).
  // Only real dependencies wait: the GL lines for the banks' codes, and the
  // pending chain — requests → their vouchers → those vouchers' sources.
  // Nothing is worked out until every read is in, so the column set below
  // (setExtraDbColumns, module state) is set and used with no await between.

  // Dynamic departments (2026-08-24): every provisioned full dept gets its
  // own column.
  const fullDeptRead = startRead(
    supabase
      .from('departments')
      .select('name, segment_key')
      .not('segment_key', 'is', null),
  )

  const banksRead = startRead(
    supabase
      .from('bank_accounts')
      .select('id, bank_name, gl_account_code, is_primary')
      .eq('status', 'active')
      .order('is_primary', { ascending: false })
      .then(({ data: bankRows }) => ((bankRows ?? []) as Array<{
        id: string
        bank_name: string
        gl_account_code: string | null
        is_primary: boolean
      }>).filter(b => b.gl_account_code)),
  )

  // ── GL lines on every bank code up to D, with the JE's segment ──
  // (No bank code → the day has nothing to show and returns before reading
  // these; see below.)
  const glRowsRead = startRead(
    banksRead.then(async banks => {
      const codes = banks.map(b => b.gl_account_code as string)
      if (codes.length === 0) return []
      return (await fetchAllRows((lo, hi) =>
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
    }),
  )

  // ── Pending as at end of D: submitted ≤ D, not approved by D ──
  // The three reads of the chain; what they come to is worked out below.
  const pendingRead = startRead(
    (async () => {
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
      if (pendingIds.length === 0) return null

      const { data: pvRows } = await supabase
        .from('payment_vouchers')
        .select('id, voucher_no, payee_name, description, amount, bank_account_id, direction, status, updated_at, reference_type, voucher_type')
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
        reference_type: string | null
        voucher_type: string | null
      }>).filter(
        v =>
          v.direction === 'debit' &&
          // voided before/on D → was gone by then (void time ≈ updated_at)
          !(v.status === 'voided' && v.updated_at <= dayEndIso),
      )

      const { data: srcRows } = await supabase
        .from('payment_voucher_sources')
        .select('voucher_id, pool, amount, role, account_code')
        .in('voucher_id', vouchers.map(v => v.id))
      return { vouchers, srcRows }
    })(),
  )

  // ── Receipts (OR vouchers) dated D, itemised for the by-bank view ──
  const orRead = startRead(
    supabase
      .from('payment_vouchers')
      .select('voucher_no, payee_name, description, amount, bank_account_id')
      .eq('direction', 'credit')
      .neq('status', 'voided')
      .eq('payment_date', date),
  )

  // ── Approved payroll funding transfers up to D (2026-11-20) ──
  // Their journal entry carries one segment (HR's, or the director's for a
  // director round) on both bank lines, but the money left the paying
  // departments' pools in the paying bank. Read here so that bank's columns
  // can say so (below).
  const roundsRead = startRead(
    (async () => {
      const rounds = (await fetchAllRows((lo, hi) =>
        supabase
          .from('payment_vouchers')
          .select('id, bank_account_id, journal_entries!payment_vouchers_journal_entry_id_fkey!inner(transaction_date, segment, is_reversed)')
          .eq('voucher_type', 'payroll_bank_transfer')
          .eq('status', 'paid')
          .lte('journal_entries.transaction_date', date)
          .eq('journal_entries.is_reversed', false)
          .order('id')
          .range(lo, hi),
      )) as unknown as Array<{
        id: string
        bank_account_id: string | null
        journal_entries: { transaction_date: string; segment: string | null }
      }>
      if (rounds.length === 0) return { rounds, sources: [] }
      const sources = (await fetchAllRows((lo, hi) =>
        supabase
          .from('payment_voucher_sources')
          .select('voucher_id, pool, amount, role')
          .in('voucher_id', rounds.map(r => r.id))
          .order('id')
          .range(lo, hi),
      )) as unknown as Array<{ voucher_id: string; pool: string | null; amount: number; role: string | null }>
      return { rounds, sources }
    })(),
  )

  // TODAY only: the pool balances whose gap is folded into the primary bank
  // (below). Asked now when D is today; whether to fold is still decided at
  // the end, as before.
  const startTodayReads = () =>
    startRead(
      Promise.all([
        supabase.from('dept_pool_balances').select('department_id, balance'),
        supabase.from('departments').select('id, name, is_internal'),
      ]),
    )
  const todayRead = date === officeToday() ? startTodayReads() : null

  const [{ data: fullDeptRows }, banks] = await Promise.all([fullDeptRead, banksRead])
  const extraCols = ((fullDeptRows ?? []) as Array<{ name: string; segment_key: string }>)
    .filter(d => !['marketing', 'hr', 'finance', 'director_office', 'director', 'corporate'].includes(d.segment_key))
    .map(d => ({ key: d.segment_key, label: d.name }))
  const codes = banks.map(b => b.gl_account_code as string)
  if (codes.length === 0) {
    setExtraDbColumns(extraCols)
    return { date, banks: [], totals: totalsAcrossBanks([]), columns: dbColumnsWithLabels() }
  }

  const glRows = await glRowsRead
  const paidRounds = await roundsRead
  const pending = await pendingRead
  const { data: orRows } = await orRead
  const todayAnswers =
    date === officeToday() ? await (todayRead ?? startTodayReads()) : null

  // Every read is in. Set BEFORE any emptyAmounts()/column resolution below.
  setExtraDbColumns(extraCols)

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

  // ── A payroll funding transfer, by the departments that paid it ──
  // (2026-11-20 — the user: "revenue 不应该negative吧" → "做".) The staging
  // entry takes the paying bank's money off under its one segment (HR's), so a
  // round Revenue funded inside Alliance left Revenue's RM 261k standing in
  // Alliance and the pool gap put it back as −273k on Hong Leong. The paying
  // bank's line is read again by the pools that paid: the segment's column
  // gets its amount back, each paying pool's column gives its share. The
  // funded bank's line stays HR's (custody). Totals per bank do not move.
  {
    const srcByRound = new Map<string, Array<{ pool: string | null; amount: number }>>()
    for (const s of paidRounds.sources) {
      if (s.role === 'mirror') continue
      const list = srcByRound.get(s.voucher_id) ?? []
      list.push({ pool: s.pool, amount: Number(s.amount) })
      srcByRound.set(s.voucher_id, list)
    }
    const codeByBank = new Map(banks.map(b => [b.id, b.gl_account_code as string]))
    for (const r of paidRounds.rounds) {
      const srcs = srcByRound.get(r.id) ?? []
      const code = r.bank_account_id ? codeByBank.get(r.bank_account_id) : undefined
      const bucket = code ? byCode.get(code) : undefined
      if (!bucket || srcs.length === 0) continue
      const segCol = columnForSegment(r.journal_entries.segment)
      const total = r2(srcs.reduce((s, x) => s + x.amount, 0))
      if (r.journal_entries.transaction_date < date) {
        // Out of the bank: the segment's column gets it back, the pools give it.
        addAmounts(bucket.bf, segCol, total)
        for (const s of srcs) addAmounts(bucket.bf, columnForPool(s.pool), -s.amount)
      } else {
        addAmounts(bucket.outToday, segCol, -total)
        for (const s of srcs) addAmounts(bucket.outToday, columnForPool(s.pool), s.amount)
      }
    }
  }

  // ── Pending as at end of D (read above): null = nothing pending ──
  let pendingByBank = new Map<string, PendingItem[]>()
  if (pending) {
    const { vouchers, srcRows } = pending
    const srcByVoucher = new Map<string, Array<{ pool: string | null; amount: number; accountCode: string | null }>>()
    for (const s of ((srcRows ?? []) as Array<{
      voucher_id: string
      pool: string | null
      amount: number
      role: string | null
      account_code: string | null
    }>)) {
      if (s.role === 'mirror') continue // paying-dept mirror rows are the OTHER side
      const list = srcByVoucher.get(s.voucher_id) ?? []
      list.push({ pool: s.pool, amount: Number(s.amount), accountCode: s.account_code })
      srcByVoucher.set(s.voucher_id, list)
    }

    // A pending payroll voucher names who is paid what. An account without
    // Payroll payouts gets them folded into one line per bank (below), so
    // what is pending — and what is free — still comes out right.
    const folded = opts.seesPayroll ? [] : vouchers.filter(v => isPayrollReference(v.reference_type))
    const listed = opts.seesPayroll ? vouchers : vouchers.filter(v => !isPayrollReference(v.reference_type))
    const addVoucher = (amounts: SegAmounts, v: { id: string; amount: number }) => {
      const srcs = srcByVoucher.get(v.id) ?? []
      if (srcs.length > 0) {
        for (const s of srcs) addAmounts(amounts, columnForPool(s.pool), s.amount)
      } else {
        addAmounts(amounts, 'venture', Number(v.amount))
      }
    }

    // What a pending voucher does to each bank (2026-11-19 — the user, on the
    // board: "帮我检查这个是不是有问题" → "开 PR 修"). A payment leaves its own
    // bank, from its pools' columns. A payroll funding transfer
    // (payroll_bank_transfer) moves its pools' money into HR's payroll custody,
    // in the bank whose GL code its rows carry: from one bank to another it
    // leaves the first and comes into the second, under HR (a negative pending
    // = money coming in); within one bank no cash moves — only the columns
    // change, Revenue's down and HR's up, the bank's total untouched. It used to
    // be taken off its bank whole: Alliance → Alliance rounds of RM 295k showed
    // as spent, and an HLB → Alliance round never reached Alliance.
    const bankByCode = new Map(banks.map(b => [b.gl_account_code as string, b]))
    type Leg = { bankId: string; amounts: SegAmounts; total: number; description: string }
    const legsOf = (v: (typeof vouchers)[number]): Leg[] => {
      if (!v.bank_account_id) return []
      const amounts = emptyAmounts()
      addVoucher(amounts, v)
      const total = r2(Number(v.amount))
      const description = v.description ?? ''
      if (v.voucher_type !== 'payroll_bank_transfer') return [{ bankId: v.bank_account_id, amounts, total, description }]
      const destCode = (srcByVoucher.get(v.id) ?? []).find(s => s.accountCode)?.accountCode ?? null
      const dest = destCode ? bankByCode.get(destCode) : undefined
      if (!dest) return [{ bankId: v.bank_account_id, amounts, total, description }]
      if (dest.id === v.bank_account_id) {
        addAmounts(amounts, 'hr', -total)
        return [{ bankId: v.bank_account_id, amounts, total: 0, description: `${description} · within ${dest.bank_name}, no cash moves` }]
      }
      const into = emptyAmounts()
      addAmounts(into, 'hr', -total)
      const from = banks.find(b => b.id === v.bank_account_id)?.bank_name ?? 'another bank'
      return [
        { bankId: v.bank_account_id, amounts, total, description: `${description} · to ${dest.bank_name}` },
        { bankId: dest.id, amounts: into, total: -total, description: `${description} · in from ${from}` },
      ]
    }

    pendingByBank = new Map()
    for (const v of listed) {
      for (const leg of legsOf(v)) {
        const item: PendingItem = {
          voucherNo: v.voucher_no ?? '—',
          payee: v.payee_name ?? '—',
          description: leg.description,
          amounts: leg.amounts,
          total: leg.total,
        }
        const list = pendingByBank.get(leg.bankId) ?? []
        list.push(item)
        pendingByBank.set(leg.bankId, list)
      }
    }
    // Voucher-number order (= submit order) — the .in() fetch above returns
    // rows in arbitrary DB order, which read as a jumble on the day sheet.
    for (const list of pendingByBank.values()) {
      list.sort((a, b) => a.voucherNo.localeCompare(b.voucherNo))
    }

    // Payroll, folded: last on each bank's list. English only — the same
    // payload feeds the PDF, which has no CJK glyphs.
    const foldedByBank = new Map<string, { amounts: SegAmounts; total: number; count: number }>()
    for (const v of folded) {
      for (const leg of legsOf(v)) {
        const f = foldedByBank.get(leg.bankId) ?? { amounts: emptyAmounts(), total: 0, count: 0 }
        for (const c of Object.keys(leg.amounts) as DbColumn[]) addAmounts(f.amounts, c, leg.amounts[c] ?? 0)
        f.total = r2(f.total + leg.total)
        f.count += 1
        foldedByBank.set(leg.bankId, f)
      }
    }
    for (const [bankId, f] of foldedByBank) {
      const list = pendingByBank.get(bankId) ?? []
      list.push({
        voucherNo: '—',
        payee: 'Payroll',
        description: `${f.count} voucher${f.count === 1 ? '' : 's'} — total only`,
        amounts: f.amounts,
        total: f.total,
      })
      pendingByBank.set(bankId, list)
    }
  }

  // ── Receipts (OR vouchers) dated D, itemised for the by-bank view ──
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
  if (todayAnswers) {
    const [{ data: balances }, { data: deptRows }] = todayAnswers
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
      // Dynamic full departments: their column key IS the segment key.
      ...Object.fromEntries(extraCols.map(e => [e.label, e.key])),
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

  return { date, banks: days, totals: totalsAcrossBanks(days), columns: dbColumnsWithLabels() }
}
