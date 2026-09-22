// src/lib/deal-preview.ts
// Live figures for the New loan / New fund source preview panel (2026-09-22:
// the user asked for the form to show 每月本金 / 利息 / 合计 / 到期 while
// typing instead of making them work it out). Same flat arithmetic the
// schedule uses — fixed rate × original principal, principal ÷ months — so
// what the panel says is what the record will say once approved.
import dayjs from 'dayjs'

export interface DealPreviewInput {
  principal: number
  /** Monthly rate as a decimal (1.5% /mo → 0.015). */
  monthlyRate: number
  /** Scheduled months; null = 无固定期限 (interest only, no principal due). */
  months: number | null
  compounding: boolean
}

export interface DealPreviewFigures {
  /** null when open-ended. */
  principalPerMonth: number | null
  /** Every month's interest when flat; the first month's when compounding. */
  interestPerMonth: number
  totalPerMonth: number
  /** Whole-life interest on a flat, scheduled plan; null when open-ended or
   *  compounding (then it depends on how repayments actually land). */
  totalInterest: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function dealPreviewFigures(i: DealPreviewInput): DealPreviewFigures {
  const p = Number.isFinite(i.principal) && i.principal > 0 ? i.principal : 0
  const r = Number.isFinite(i.monthlyRate) && i.monthlyRate > 0 ? i.monthlyRate : 0
  const n = i.months != null && Number.isFinite(i.months) && i.months >= 1 ? Math.floor(i.months) : null
  const interestPerMonth = round2(p * r)
  const principalPerMonth = n ? round2(p / n) : null
  return {
    principalPerMonth,
    interestPerMonth,
    totalPerMonth: round2((principalPerMonth ?? 0) + interestPerMonth),
    totalInterest: n && !i.compounding ? round2(interestPerMonth * n) : null,
  }
}

/** What the user typed in a number box: '' / junk → null. */
export function numberOrNull(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** Loan maturity = start date + tenure months, the way the detail page shows it. */
export function loanMaturity(startIso: string, months: number | null): string | null {
  if (!months || months < 1) return null
  const d = dayjs(startIso)
  if (!startIso || !d.isValid()) return null
  return d.add(Math.floor(months), 'month').format('YYYY-MM-DD')
}

/** Bank line for the preview: "Maybank ···5678". */
export function bankShort(bankName: string, accountNumber: string): string {
  const digits = (accountNumber ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `${bankName} ···${digits.slice(-4)}` : bankName
}
