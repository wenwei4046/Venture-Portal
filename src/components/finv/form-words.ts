// What the Finance kit's forms say (2026-10-14, the Finance revamp v2 — D07):
// the figures, the pools' short names, a file's size, and the prototype's
// sentence for what is still missing. Shared by Create payment, Create
// receipt and Loan repayment received.

export const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A typed figure, 0 when it is not one. */
export const num = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** "Venture Pool" → "Venture", "HR Dept Pool" → "HR" — the design's pool names. */
export const poolName = (label: string) => label.replace(/ Dept Pool$/, '').replace(/ Pool$/, '')

export const fileSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "05 May 2025" — a deal's day in a list. */
export const shortDay = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}`
}

/**
 * "Pay to, an amount and a description are needed before you can save." — the prototype's sentence, for what is
 * missing; `short`, its receipt's ("Received from and an amount are needed.").
 */
export function neededSentence(need: string[], short = false): string | null {
  if (need.length === 0) return null
  const list = need.length === 1 ? need[0] : `${need.slice(0, -1).join(', ')} and ${need[need.length - 1]}`
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${need.length === 1 ? 'is' : 'are'} needed${short ? '' : ' before you can save'}.`
}

/** The Server Action body's cap is 4 MB (next.config); the files must leave room for the rest. */
export const FILES_CAP = 3.8 * 1024 * 1024
