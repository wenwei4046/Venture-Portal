/**
 * Me's small words and numbers (2026-10-17, the Claude Design handoff `design_handoff_staff_app` — its `hm`, `dur`,
 * `fmtN` and `rm`): clock times from seconds of the day, "1 h 42 m", "1.5", "RM 3,813.53". Pure.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** Seconds of the day → "08:57". */
export const hm = (sec: number) => `${pad(Math.floor(sec / 3600) % 24)}:${pad(Math.floor(sec / 60) % 60)}`

/** Seconds of the day → "08:57:12". */
export const hms = (sec: number) => `${hm(sec)}:${pad(((Math.floor(sec) % 60) + 60) % 60)}`

/** "08:57" or "08:57:12" → seconds of the day. */
export function secOf(t: string): number {
  const [h, m, s] = t.split(':').map(Number)
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
}

/** "1 h 42 m", "12 m". */
export function dur(sec: number): string {
  const x = Math.max(0, Math.floor(sec))
  const h = Math.floor(x / 3600)
  const m = Math.floor(x / 60) % 60
  return h ? `${h} h ${m} m` : `${m} m`
}

/** One decimal at most: 9 → "9", 1.5 → "1.5". */
export const fmtN = (n: number) => (Math.round(n * 10) / 10).toString()

/** "RM 3,813.53". */
export const rm = (n: number) => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtN(n)} ${n === 1 ? one : many}`

/** "182 KB", "1.8 MB". */
export function sizeLabel(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The initials an avatar draws: "Wei Ling Ong" → "WL". */
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
