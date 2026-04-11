import dayjs from 'dayjs'

export function formatMoney(amount: number | null | undefined): string {
  const val = amount ?? 0
  const formatted = Math.abs(val).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  // Negatives render as parenthesis notation per DESIGN.md money format spec.
  // Callers that need color should wrap in text-danger conditional on val < 0.
  return val < 0 ? `RM (${formatted})` : `RM ${formatted}`
}

// Bare number formatting — no RM prefix. Use in dense ledger tables where
// an "RM" column header already implies the currency, or inside print
// statements where repeating "RM" on every line is visual noise. Keeps the
// parenthesis notation for negatives so the sign is preserved.
//
// Prefer formatMoney() for headlines, cards, and standalone numbers. Use
// formatMoneyBare() only when the surrounding context already provides
// currency disambiguation.
export function formatMoneyBare(amount: number | null | undefined): string {
  const val = amount ?? 0
  const formatted = Math.abs(val).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return val < 0 ? `(${formatted})` : formatted
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

export function formatDate(date: string | Date): string {
  return dayjs(date).format('DD MMM YYYY')
}

export function formatMonth(date: string | Date): string {
  return dayjs(date).format('MMM YYYY')
}

export function getPeriodMonth(date?: Date): string {
  return dayjs(date).startOf('month').format('YYYY-MM-DD')
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
