import { addLetterType, fileLetter } from './actions'
import { NEW_LETTER_TYPE, lettersToFile, type FiledLetters, type LetterChoice, type PendingLetter } from './attach'
import { uploadDocumentationFile } from './upload'

/**
 * The two writes a letter takes: the Data center's own — or the HR app's (2026-10-24, lib/hr-app/letters.ts), which
 * ask the app's People part first and then call these.
 */
export interface LetterWrites {
  addLetterType(name: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }>
  fileLetter(input: { staffId: string; typeId: string; path: string; fileName: string; contentType: string | null; size: number }): Promise<{ ok: true } | { ok: false; reason: string }>
}

/**
 * The letters a People form held, filed to the person's Data center record from the browser (2026-10-24, ./attach.ts):
 * each in turn as the Data center's Upload files one — its type (a new one added first), the file straight into the
 * bucket, then `fileLetter`, which asks the database whether it arrived and sends it to them. One that is refused does
 * not hold up the rest; the answer says which went and which did not.
 */
export async function fileLetters(
  staffId: string,
  rows: readonly PendingLetter[],
  types: readonly LetterChoice[],
  via: LetterWrites = { addLetterType, fileLetter },
): Promise<FiledLetters> {
  const out: FiledLetters = { filed: [], failed: [] }
  for (const row of lettersToFile(rows)) {
    try {
      const type = await letterTypeOf(row, types, via)
      if (!type.ok) {
        out.failed.push({ key: row.key, name: row.file.name, reason: type.reason })
        continue
      }
      const up = await uploadDocumentationFile({ letterFor: staffId }, row.file)
      if (!up.ok) {
        out.failed.push({ key: row.key, name: type.name, reason: up.reason })
        continue
      }
      const res = await via.fileLetter({ staffId, typeId: type.id, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size })
      if (res.ok) out.filed.push(type.name)
      else out.failed.push({ key: row.key, name: type.name, reason: res.reason })
    } catch {
      out.failed.push({ key: row.key, name: row.file.name, reason: 'Check the connection and try again.' })
    }
  }
  return out
}

export type LetterTypeOutcome = { ok: true; id: string; name: string } | { ok: false; reason: string }

/**
 * A row's letter type: the one chosen — or the one named there, an existing type of that name (any case) before a new
 * one is added, as the Data center's Upload does.
 */
export async function letterTypeOf(
  row: Pick<PendingLetter, 'typeId' | 'newType'>,
  types: readonly LetterChoice[],
  via: Pick<LetterWrites, 'addLetterType'> = { addLetterType },
): Promise<LetterTypeOutcome> {
  if (row.typeId !== NEW_LETTER_TYPE) {
    const chosen = types.find(t => t.id === row.typeId)
    return chosen ? { ok: true, id: chosen.id, name: chosen.name } : { ok: false, reason: 'Choose the letter type.' }
  }
  const name = row.newType.trim()
  if (!name) return { ok: false, reason: 'Name the new letter type.' }
  const existing = types.find(t => t.name.trim().toLowerCase() === name.toLowerCase())
  if (existing) return { ok: true, id: existing.id, name: existing.name }
  const added = await via.addLetterType(name)
  return added.ok ? { ok: true, id: added.id, name } : { ok: false, reason: added.reason }
}
