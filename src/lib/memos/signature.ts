/**
 * A memo is acknowledged with the person's own hand-drawn signature (2026-10-20 — the user: "点进去的时候，应该要有一个
 * signature，也就是他自己手绘签名的那种，签完之后再来点那个 Acknowledge button"). The pad
 * (`components/memos/SignaturePad`) hands back a PNG data URL; the database keeps it on the receipt with the first
 * acknowledgement (`member_memo_receipts.signature`, mig 20261021013000) and refuses an Acknowledge without one
 * (`memo_signature_ok` — the same rule as here, so the app says it before the database has to).
 *
 * Pure: imported by the Server Actions that send one and by the screens that draw one back.
 */

/** The pad's PNG, as a data URL — the PNG's own first bytes (`\x89PNG\r\n\x1a\n` → `iVBORw0KGgo`) included. */
const SIGNATURE = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/

/** Shortest a signature's data URL may be: the PNG header alone is not one. */
export const SIGNATURE_MIN = 200
/** Longest: the pad's 600 × 200 picture is a few kilobytes; this leaves room for a scrawl, not for a photo. */
export const SIGNATURE_MAX = 200_000

/** A signature the database will take — the pad's PNG data URL, of a sensible size. */
export function isMemoSignature(value: unknown): value is string {
  return typeof value === 'string' && value.length >= SIGNATURE_MIN && value.length <= SIGNATURE_MAX && SIGNATURE.test(value)
}

/** What is wrong with the signature an Acknowledge is about to send — null when nothing is. */
export function signatureProblem(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return 'Sign in the box before you acknowledge.'
  if (typeof value !== 'string' || !SIGNATURE.test(value) || value.length < SIGNATURE_MIN) return 'That signature could not be read. Clear it and sign again.'
  if (value.length > SIGNATURE_MAX) return 'That signature is too large. Clear it and sign again.'
  return null
}

/** A signature read back from the database, kept only when it is one (it is drawn as an image's source). */
export function signatureOrNull(value: unknown): string | null {
  return isMemoSignature(value) ? value : null
}
