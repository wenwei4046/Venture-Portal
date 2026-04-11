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
