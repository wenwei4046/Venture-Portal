import { fileLetters, letterTypeOf, type LetterWrites } from '@/lib/documentation/file-letters'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import type { FiledLetters, LetterChoice, PendingLetter } from '@/lib/documentation/attach'
import { hrAppAddLetterType, hrAppFileLetter, hrAppRenewContract } from './actions'

/**
 * A letter filed from the HR app's person page (2026-10-24 — the user: "do for hr app as well"): the desktop's own
 * steps — its type (a new one added first), the file straight from the phone into the bucket, then the filing — with
 * each write asked of the app's People part first (./actions.ts).
 */
const writes = (): LetterWrites => ({ addLetterType: hrAppAddLetterType, fileLetter: hrAppFileLetter })

/** The letters a probation's Confirm as permanent or Extend took, filed once the step is done. */
export function hrAppFileLetters(staffId: string, rows: readonly PendingLetter[], types: readonly LetterChoice[]): Promise<FiledLetters> {
  return fileLetters(staffId, rows, types, writes())
}

export type RenewAnswer = { ok: true; endsOn: string; filed: string } | { ok: false; reason: string }

/**
 * Renew from the phone, as the person's page renews (team/people/_components/RenewContract.tsx): the new contract's
 * type and its file first, then `renewContract`, which renews and files it together — `filed` is the type it went as.
 */
export async function hrAppRenew(
  input: { staffId: string; start: string; months: number; endsWas: string },
  letter: Pick<PendingLetter, 'typeId' | 'newType'> & { file: File },
  types: readonly LetterChoice[],
): Promise<RenewAnswer> {
  try {
    const type = await letterTypeOf(letter, types, writes())
    if (!type.ok) return type
    const up = await uploadDocumentationFile({ letterFor: input.staffId }, letter.file)
    if (!up.ok) return up
    const done = await hrAppRenewContract({
      ...input,
      letter: { typeId: type.id, path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size },
    })
    return done.ok ? { ok: true, endsOn: done.endsOn, filed: type.name } : done
  } catch {
    return { ok: false, reason: 'Could not renew it. Check the connection and try again.' }
  }
}
