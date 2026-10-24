import { beforeEach, describe, expect, it, vi } from 'vitest'

// The letters a People form held, filed from the browser to the person's Data center record (2026-10-24): each in
// turn — its type (a new one added first), the file into the bucket, then fileLetter — and one refused never holds
// up the rest.

const mocks = vi.hoisted(() => ({ addLetterType: vi.fn(), fileLetter: vi.fn(), upload: vi.fn() }))
vi.mock('./actions', () => ({ addLetterType: mocks.addLetterType, fileLetter: mocks.fileLetter }))
vi.mock('./upload', () => ({ uploadDocumentationFile: mocks.upload }))

import { NEW_LETTER_TYPE, pendingLetter, type LetterChoice } from './attach'
import { fileLetters, letterTypeOf } from './file-letters'

const TYPES: LetterChoice[] = [
  { id: 'offer', name: 'Offer letter', compulsory: true },
  { id: 'cfs', name: 'Contract for Service', compulsory: false },
]
const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' })
const up = (path: string, fileName: string) => ({ ok: true as const, path, fileName, contentType: 'application/pdf', size: 4 })

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.upload.mockImplementation(async (folder: { letterFor: string }, f: File) => up(`letters/${folder.letterFor}/u/${f.name}`, f.name))
  mocks.fileLetter.mockResolvedValue({ ok: true, id: 'letter' })
})

describe('fileLetters', () => {
  it('files each letter with a file to the person — a row left without one is skipped', async () => {
    const rows = [{ ...pendingLetter('offer'), file: pdf('offer.pdf') }, pendingLetter('cfs'), { ...pendingLetter('cfs'), file: pdf('contract.pdf') }]
    const answer = await fileLetters('staff-1', rows, TYPES)
    expect(answer).toEqual({ filed: ['Offer letter', 'Contract for Service'], failed: [] })
    expect(mocks.upload).toHaveBeenCalledTimes(2)
    expect(mocks.upload).toHaveBeenCalledWith({ letterFor: 'staff-1' }, rows[0].file)
    expect(mocks.fileLetter).toHaveBeenNthCalledWith(1, {
      staffId: 'staff-1', typeId: 'offer', path: 'letters/staff-1/u/offer.pdf', fileName: 'offer.pdf', contentType: 'application/pdf', size: 4,
    })
    expect(mocks.fileLetter).toHaveBeenNthCalledWith(2, expect.objectContaining({ typeId: 'cfs', fileName: 'contract.pdf' }))
    expect(mocks.addLetterType).not.toHaveBeenCalled()
  })

  it('adds a type named there first — or uses one of that name already there, in any case', async () => {
    mocks.addLetterType.mockResolvedValue({ ok: true, id: 'agreement' })
    const rows = [
      { ...pendingLetter(NEW_LETTER_TYPE), newType: ' Agreement letter ', file: pdf('agreement.pdf') },
      { ...pendingLetter(NEW_LETTER_TYPE), newType: 'offer LETTER', file: pdf('offer.pdf') },
    ]
    const answer = await fileLetters('staff-1', rows, TYPES)
    expect(mocks.addLetterType).toHaveBeenCalledTimes(1)
    expect(mocks.addLetterType).toHaveBeenCalledWith('Agreement letter')
    expect(mocks.fileLetter).toHaveBeenNthCalledWith(1, expect.objectContaining({ typeId: 'agreement' }))
    expect(mocks.fileLetter).toHaveBeenNthCalledWith(2, expect.objectContaining({ typeId: 'offer' }))
    expect(answer.filed).toEqual(['Agreement letter', 'Offer letter'])
  })

  it('says each letter that did not go, by its row, and files the rest', async () => {
    mocks.upload.mockResolvedValueOnce({ ok: false, reason: 'The file could not be uploaded.' })
    mocks.fileLetter.mockResolvedValueOnce({ ok: false, reason: 'The file did not arrive. Please upload it again.' })
    const a = { ...pendingLetter('offer'), file: pdf('a.pdf') }
    const b = { ...pendingLetter('cfs'), file: pdf('b.pdf') }
    const c = { ...pendingLetter('cfs'), file: pdf('c.pdf') }
    const answer = await fileLetters('staff-1', [a, b, c], TYPES)
    expect(answer.failed).toEqual([
      { key: a.key, name: 'Offer letter', reason: 'The file could not be uploaded.' },
      { key: b.key, name: 'Contract for Service', reason: 'The file did not arrive. Please upload it again.' },
    ])
    expect(answer.filed).toEqual(['Contract for Service'])
  })

  it('a dropped connection is that letter’s, not the whole answer’s', async () => {
    mocks.fileLetter.mockRejectedValueOnce(new Error('fetch failed'))
    const a = { ...pendingLetter('offer'), file: pdf('a.pdf') }
    const answer = await fileLetters('staff-1', [a], TYPES)
    expect(answer).toEqual({ filed: [], failed: [{ key: a.key, name: 'a.pdf', reason: 'Check the connection and try again.' }] })
  })
})

describe('letterTypeOf', () => {
  it('is the type chosen, or says to choose one', async () => {
    expect(await letterTypeOf({ typeId: 'cfs', newType: '' }, TYPES)).toEqual({ ok: true, id: 'cfs', name: 'Contract for Service' })
    expect(await letterTypeOf({ typeId: 'gone', newType: '' }, TYPES)).toEqual({ ok: false, reason: 'Choose the letter type.' })
    expect(await letterTypeOf({ typeId: NEW_LETTER_TYPE, newType: ' ' }, TYPES)).toEqual({ ok: false, reason: 'Name the new letter type.' })
  })

  it('passes on a refusal to add one', async () => {
    mocks.addLetterType.mockResolvedValue({ ok: false, reason: 'You may not do that on Documentation.' })
    expect(await letterTypeOf({ typeId: NEW_LETTER_TYPE, newType: 'Agreement letter' }, TYPES)).toEqual({ ok: false, reason: 'You may not do that on Documentation.' })
  })
})
