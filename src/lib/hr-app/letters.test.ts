import { beforeEach, describe, expect, it, vi } from 'vitest'

// A letter filed from the HR app's person page (2026-10-24 — the user: "do for hr app as well"): the desktop's steps,
// with each write the app's own — asked of its People part first — never the Data center's directly.

const mocks = vi.hoisted(() => ({
  hrAddType: vi.fn(),
  hrFile: vi.fn(),
  hrRenew: vi.fn(),
  portalAddType: vi.fn(),
  portalFile: vi.fn(),
  upload: vi.fn(),
}))
vi.mock('./actions', () => ({ hrAppAddLetterType: mocks.hrAddType, hrAppFileLetter: mocks.hrFile, hrAppRenewContract: mocks.hrRenew }))
vi.mock('@/lib/documentation/actions', () => ({ addLetterType: mocks.portalAddType, fileLetter: mocks.portalFile }))
vi.mock('@/lib/documentation/upload', () => ({ uploadDocumentationFile: mocks.upload }))

import { NEW_LETTER_TYPE, pendingLetter, type LetterChoice } from '@/lib/documentation/attach'
import { hrAppFileLetters, hrAppRenew } from './letters'

const TYPES: LetterChoice[] = [
  { id: 'cfs', name: 'Contract for Service', compulsory: false },
  { id: 'conf', name: 'Confirmation letter', compulsory: false },
]
const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' })
const INPUT = { staffId: 'st2', start: '2027-10-01', months: 12, endsWas: '2027-09-30' }

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset()
  mocks.upload.mockImplementation(async (folder: { letterFor: string }, f: File) => ({
    ok: true, path: `letters/${folder.letterFor}/u/${f.name}`, fileName: f.name, contentType: 'application/pdf', size: 4,
  }))
})

describe('hrAppRenew', () => {
  it('the new contract goes up under their record, then the app’s renewal files it — answering the type it went as', async () => {
    mocks.hrRenew.mockResolvedValue({ ok: true, endsOn: '2028-09-30' })
    const file = pdf('contract.pdf')
    expect(await hrAppRenew(INPUT, { typeId: 'cfs', newType: '', file }, TYPES)).toEqual({ ok: true, endsOn: '2028-09-30', filed: 'Contract for Service' })
    expect(mocks.upload).toHaveBeenCalledWith({ letterFor: 'st2' }, file)
    expect(mocks.hrRenew).toHaveBeenCalledWith({
      ...INPUT, letter: { typeId: 'cfs', path: 'letters/st2/u/contract.pdf', fileName: 'contract.pdf', contentType: 'application/pdf', size: 4 },
    })
  })

  it('a new type is added by the app’s own write first; a refusal stops it before anything goes up', async () => {
    mocks.hrAddType.mockResolvedValueOnce({ ok: true, id: 'renewal' })
    mocks.hrRenew.mockResolvedValue({ ok: true, endsOn: '2028-09-30' })
    expect(await hrAppRenew(INPUT, { typeId: NEW_LETTER_TYPE, newType: 'Renewal contract', file: pdf('c.pdf') }, TYPES)).toMatchObject({ ok: true, filed: 'Renewal contract' })
    expect(mocks.hrRenew).toHaveBeenCalledWith(expect.objectContaining({ letter: expect.objectContaining({ typeId: 'renewal' }) }))
    expect(mocks.portalAddType).not.toHaveBeenCalled()
    mocks.upload.mockClear()
    mocks.hrRenew.mockClear()
    mocks.hrAddType.mockResolvedValueOnce({ ok: false, reason: 'This is not open to your account.' })
    expect(await hrAppRenew(INPUT, { typeId: NEW_LETTER_TYPE, newType: 'Renewal contract', file: pdf('c.pdf') }, TYPES)).toEqual({ ok: false, reason: 'This is not open to your account.' })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.hrRenew).not.toHaveBeenCalled()
  })

  it('says the upload’s refusal, the renewal’s, and a dropped connection in words', async () => {
    mocks.upload.mockResolvedValueOnce({ ok: false, reason: 'The file could not be uploaded.' })
    expect(await hrAppRenew(INPUT, { typeId: 'cfs', newType: '', file: pdf('c.pdf') }, TYPES)).toEqual({ ok: false, reason: 'The file could not be uploaded.' })
    expect(mocks.hrRenew).not.toHaveBeenCalled()
    mocks.hrRenew.mockResolvedValueOnce({ ok: false, reason: 'Their contract changed since this page was opened — reload it.' })
    expect(await hrAppRenew(INPUT, { typeId: 'cfs', newType: '', file: pdf('c.pdf') }, TYPES)).toEqual({ ok: false, reason: 'Their contract changed since this page was opened — reload it.' })
    mocks.hrRenew.mockRejectedValueOnce(new Error('fetch failed'))
    expect(await hrAppRenew(INPUT, { typeId: 'cfs', newType: '', file: pdf('c.pdf') }, TYPES)).toEqual({ ok: false, reason: 'Could not renew it. Check the connection and try again.' })
  })
})

describe('hrAppFileLetters', () => {
  it('files a step’s letter through the app’s own writes, never the Data center’s directly', async () => {
    mocks.hrFile.mockResolvedValue({ ok: true })
    const rows = [{ ...pendingLetter('conf'), file: pdf('confirmation.pdf') }]
    expect(await hrAppFileLetters('st1', rows, TYPES)).toEqual({ filed: ['Confirmation letter'], failed: [] })
    expect(mocks.hrFile).toHaveBeenCalledWith(expect.objectContaining({ staffId: 'st1', typeId: 'conf', fileName: 'confirmation.pdf' }))
    expect(mocks.portalFile).not.toHaveBeenCalled()
  })
})
