// Lead View › Quick replies (2026-10-23, the redesign v2 handoff's Data Center tab — mig 20261023300000): a shortcut
// CS types in the Inbox's reply box (/instal) to put its text in, for one brand or every brand. The database keeps
// them (lead_quick_replies); this file is the shape, the database's check and the Inbox's matching.

export interface QuickReply {
  id: string
  /** null = every brand. */
  brandId: string | null
  /** "/instal" — a slash, then small letters, digits, - or _. */
  shortcut: string
  body: string
  /** How often CS put it in. */
  used: number
}

const SHORTCUT = /^\/[a-z0-9_-]{1,30}$/

/** What is wrong before saving, in the database's words; null when the list may be saved. */
export function quickProblem(rows: Array<Pick<QuickReply, 'brandId' | 'shortcut' | 'body'>>): string | null {
  if (rows.length > 200) return 'The quick replies are not in the right shape.'
  if (rows.some(r => !SHORTCUT.test(r.shortcut) || !r.body.trim() || r.body.length > 1000)) {
    return 'A quick reply is a shortcut like /instal (small letters and digits) and its text (1,000 characters at most).'
  }
  const keys = rows.map(r => `${r.shortcut}|${r.brandId ?? ''}`)
  if (new Set(keys).size !== keys.length) return 'Two quick replies use the same shortcut for the same brand.'
  return null
}

/** "instal" or "/Instal " → "/instal": what the shortcut box keeps. */
export function cleanShortcut(raw: string): string {
  return '/' + raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30)
}

/**
 * The Inbox's reply box: when the text ends in a word that starts with "/", the quick replies of the conversation's
 * brand (and every brand's) whose shortcut starts with it, the brand's own first. Null when there is no "/word".
 */
export function quickMatches(text: string, rows: QuickReply[], brandId: string): { typed: string; matches: QuickReply[] } | null {
  const m = /(?:^|\s)(\/[a-z0-9_-]*)$/i.exec(text)
  if (!m) return null
  const typed = m[1].toLowerCase()
  const matches = rows
    .filter(r => (r.brandId === null || r.brandId === brandId) && r.shortcut.startsWith(typed))
    .sort((a, b) => Number(a.brandId === null) - Number(b.brandId === null) || b.used - a.used || a.shortcut.localeCompare(b.shortcut))
  return { typed, matches }
}

/** The reply box with the typed "/word" swapped for the quick reply's text. */
export function insertQuick(text: string, typed: string, body: string): string {
  return text.slice(0, text.length - typed.length) + body
}
