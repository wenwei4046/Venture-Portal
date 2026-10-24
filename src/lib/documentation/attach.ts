import { fileRefusal } from './model'

/**
 * Letters filed with an employment status (2026-10-24 — the user: "我们 select 那个 state 的时候，我要他能够 attach 一个
 * form。因为他开 account 之后，就已经有他的 offer letter、agreement letter 等等 … 新员工进来的时候，他 put 那个 status，然后能够
 * attach 他的 offer letter。当然包括 letter 的 type，当他一选了之后，就自动 attach 进 document data center 里面"). Add Staff,
 * the waiting list's Transfer and a person's card take letters beside the status — each its letter type (or a new one
 * named there, as the Data center's Upload names one) and its file — and file each to the person's Data center record
 * as Upload does (`hr_letter_file`; the letter is sent to them as it is filed). Renew asks for the new contract the same
 * way (lib/contract-renewal.ts). Documentation · Create, as Upload asks; the types come from `hr_letter_type_choices()`.
 *
 * Pure, so every form reads one set of rules; the filing itself is ./file-letters.ts.
 */

export interface LetterChoice {
  id: string
  name: string
  /** The Data center flags a person without one of these. */
  compulsory: boolean
}

/** "+ Add a new letter type…" in a type select. */
export const NEW_LETTER_TYPE = '__new'

/** A letter a form holds until it is filed: its type (or NEW_LETTER_TYPE with the name typed) and its file. */
export interface PendingLetter {
  key: string
  typeId: string
  newType: string
  file: File | null
}

/** The letter types as `hr_letter_type_choices()` answers them; anything malformed is left out. */
export function letterChoicesFromRow(raw: unknown): LetterChoice[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(v => {
    const t = (v ?? {}) as { id?: unknown; name?: unknown; compulsory?: unknown }
    return typeof t.id === 'string' && typeof t.name === 'string' && t.name.trim() !== ''
      ? [{ id: t.id, name: t.name, compulsory: t.compulsory === true }]
      : []
  })
}

let made = 0

/** A row to fill: on this type, if given, with no file yet. */
export function pendingLetter(typeId = ''): PendingLetter {
  made += 1
  return { key: `letter-${made}`, typeId, newType: '', file: null }
}

/** A new person's letters to start with: a row for each compulsory type (the Offer letter), its file to choose. */
export function startingLetters(types: readonly LetterChoice[]): PendingLetter[] {
  return types.filter(t => t.compulsory).map(t => pendingLetter(t.id))
}

/** The type a form starts a letter on: the one type whose name says it (a renewal's /contract/i) — or none. */
export function suggestedLetterType(types: readonly LetterChoice[], says: RegExp): string {
  const hits = types.filter(t => says.test(t.name))
  return hits.length === 1 ? hits[0].id : ''
}

/** The letters a form files: those with a file. A row left without one is not a letter — a compulsory row is optional. */
export function lettersToFile(rows: readonly PendingLetter[]): Array<PendingLetter & { file: File }> {
  return rows.filter((r): r is PendingLetter & { file: File } => r.file !== null)
}

/** Why the letters cannot be filed as they stand — a type to choose or name, a file refused — or null. */
export function lettersRefusal(rows: readonly PendingLetter[]): string | null {
  for (const r of lettersToFile(rows)) {
    if (!r.typeId) return `Choose the letter type for ${r.file.name}.`
    if (r.typeId === NEW_LETTER_TYPE && !r.newType.trim()) return `Name the new letter type for ${r.file.name}.`
    const refused = fileRefusal(r.file)
    if (refused) return refused
  }
  return null
}

/** How many letters a form holds to file — what a save counts as changes. */
export function lettersCount(rows: readonly PendingLetter[]): number {
  return lettersToFile(rows).length
}

/** What filing answered: the types filed, and each letter that was not — its row, its name, why. */
export interface FiledLetters {
  filed: string[]
  failed: Array<{ key: string; name: string; reason: string }>
}

/** "Offer letter filed to ANA's record", "2 letters filed to ANA's record" — or null when none was. */
export function filedWords(filed: readonly string[], person: string): string | null {
  if (filed.length === 0) return null
  const what = filed.length === 1 ? filed[0] : `${filed.length} letters`
  return `${what} filed to ${person.trim() ? `${person.trim()}'s` : 'their'} record`
}

/** "Offer letter was not filed: The file did not arrive. Please upload it again." — every one that was not, or null. */
export function failedWords(failed: FiledLetters['failed']): string | null {
  if (failed.length === 0) return null
  return failed.map(f => `${f.name} was not filed: ${f.reason}`).join(' ')
}
