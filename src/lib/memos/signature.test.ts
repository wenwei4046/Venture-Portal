import { describe, expect, it } from 'vitest'
import { memoPreviewFromRow } from './model'
import { SIGNATURE_MAX, isMemoSignature, signatureOrNull, signatureProblem } from './signature'

// A memo's Acknowledge carries the person's own signature (2026-10-20): the pad's PNG data URL, of a sensible size —
// the rule the database's memo_signature_ok holds too (mig 20261021013000).

const png = (n: number) => `data:image/png;base64,iVBORw0KGgo${'A'.repeat(n)}`

describe('a memo signature', () => {
  it('is the pad’s PNG data URL', () => {
    expect(isMemoSignature(png(400))).toBe(true)
    expect(isMemoSignature(`${png(398)}==`)).toBe(true)
    expect(signatureProblem(png(400))).toBeNull()
  })

  it('nothing drawn: say so', () => {
    for (const v of [null, undefined, '']) expect(signatureProblem(v)).toBe('Sign in the box before you acknowledge.')
  })

  it('never another picture, a PNG header alone, script, or a photo-sized file', () => {
    for (const v of [
      `data:image/jpeg;base64,/9j/4AAQ${'A'.repeat(400)}`,
      'data:image/png;base64,iVBORw0KGgoAAAA',
      `data:image/png;base64,${'A'.repeat(400)}`,
      `javascript:alert(1)//${'A'.repeat(400)}`,
      `data:image/png;base64,iVBORw0KGgo${'A'.repeat(400)}"><script>`,
      png(SIGNATURE_MAX),
      42,
    ]) {
      expect(isMemoSignature(v), String(v).slice(0, 40)).toBe(false)
      expect(signatureProblem(v), String(v).slice(0, 40)).not.toBeNull()
    }
    expect(signatureProblem(png(SIGNATURE_MAX))).toBe('That signature is too large. Clear it and sign again.')
  })

  it('read back, only a signature is drawn — anything else is nothing', () => {
    expect(signatureOrNull(png(400))).toBe(png(400))
    expect(signatureOrNull('https://example.com/x.png')).toBeNull()
    expect(signatureOrNull(null)).toBeNull()
  })
})

// Publish › Preview's Who has it (hr_memo_preview, mig 20261021013000): each person's signature, kept only when it is one.
describe('a preview person’s signature', () => {
  const row = (signature: unknown) => memoPreviewFromRow({
    id: 'm1', title: 'House rules', body: '', sender: 'People & Culture', kind: 'Memo', publishedAt: '2026-10-20T02:00:00Z', requiresAck: true,
    people: [{ staffId: 's1', name: 'KRIS', department: 'Revenue Department', hasLogin: true, readAt: null, acknowledgedAt: '2026-10-20T03:00:00Z', signature }],
  })!.people[0]

  it('is read as the signature it is', () => {
    expect(row(png(400)).signature).toBe(png(400))
  })

  it('is nothing when there is none, or when it is anything but the pad’s PNG', () => {
    for (const v of [null, undefined, 'https://example.com/x.png', `data:image/svg+xml;base64,${'A'.repeat(400)}`]) expect(row(v).signature).toBeNull()
  })
})
