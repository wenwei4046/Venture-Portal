import { describe, expect, it } from 'vitest'
import { parseStagedRef, stagedOwner, stagedPath, stagedRefText, STAGED_MAX_BYTES, STAGING_BUCKET } from './staging'

// A file sent ahead of its Server Action (2026-10-23, the owner: "make the size more bigger for all").
const ME = '0e2f8a7c-1b3d-4e5f-8a9b-0c1d2e3f4a5b'
const KEY = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

describe('a staged file', () => {
  it('lives in its sender’s own folder of uploads, a fresh folder each time, its name made plain', () => {
    expect([STAGING_BUCKET, STAGED_MAX_BYTES]).toEqual(['uploads', 100 * 1024 * 1024])
    expect(stagedPath(ME, KEY, 'Invoice (Oct) #2.pdf')).toBe(`${ME}/${KEY}/Invoice_Oct_2.pdf`)
    expect(stagedPath(ME, KEY, '../../etc/passwd')).toBe(`${ME}/${KEY}/etc_passwd`)
    expect(stagedPath(ME, KEY, '报销单.pdf')).toBe(`${ME}/${KEY}/file.pdf`)
    expect(stagedPath(ME, KEY, 'Scan.JPEG')).toBe(`${ME}/${KEY}/Scan.jpeg`)
    expect(stagedPath(ME, KEY, '')).toBe(`${ME}/${KEY}/file`)
    expect(stagedPath(ME, KEY, `${'a'.repeat(300)}.pdf`).split('/')[2]).toBe(`${'a'.repeat(110)}.pdf`)
    expect(stagedOwner(stagedPath(ME, KEY, 'x.pdf'))).toBe(ME)
  })

  it('travels as a line the server reads back exactly', () => {
    const ref = { staged: `${ME}/${KEY}/slip.pdf`, name: 'Slip — Oct.pdf', type: 'application/pdf', size: 1234 }
    expect(parseStagedRef(stagedRefText(ref))).toEqual(ref)
  })

  it('is no line at all when it is not one of ours', () => {
    expect(parseStagedRef(null)).toBeNull()
    expect(parseStagedRef('')).toBeNull()
    expect(parseStagedRef('Joan.pdf')).toBeNull()
    expect(parseStagedRef('{not json')).toBeNull()
    expect(parseStagedRef(JSON.stringify({ staged: `${ME}/x.pdf` }))).toBeNull()
    expect(parseStagedRef(JSON.stringify({ staged: `${ME}/${KEY}/../x.pdf` }))).toBeNull()
    expect(parseStagedRef(JSON.stringify({ staged: `templates/${KEY}/x.pdf` }))).toBeNull()
    expect(parseStagedRef(JSON.stringify({ staged: `${ME}/${KEY}/a b.pdf` }))).toBeNull()
    expect(parseStagedRef(`{"staged":"${ME}/${KEY}/x.pdf","name":"${'n'.repeat(3000)}"}`)).toBeNull()
  })

  it('names itself when the line does not, and never says a size it cannot', () => {
    expect(parseStagedRef(JSON.stringify({ staged: `${ME}/${KEY}/x.pdf`, size: -4 }))).toEqual({ staged: `${ME}/${KEY}/x.pdf`, name: 'x.pdf', type: '', size: 0 })
  })
})
