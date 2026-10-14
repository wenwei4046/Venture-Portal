import { describe, expect, it } from 'vitest'
import { EMPTY_PERSONAL, letterState, myDocumentsFromRow, personalFromRow, personalIn, personalPath, personalUnseen } from './personal'

// One's own documents (2026-10-14 — the user: "documentation 我要分成两种：一个是 company，一个是 personal"): what
// `my_documents()` answers, and how every face draws Personal — folders a press goes into, files, the letters on top.

const CONTRACTS = 'c1'
const Y2026 = 'c2'
const row = {
  staffId: 'zack',
  company: [{ id: 'd1', name: 'Fair handbook', fileName: 'Handbook.pdf', contentType: 'application/pdf', size: 12, uploadedAt: '2026-10-11T02:00:00Z', seen: false }],
  personal: {
    folders: [
      { id: CONTRACTS, name: 'Contracts', parent: null, at: '2026-10-14T01:00:00Z' },
      { id: Y2026, name: '2026', parent: CONTRACTS, at: '2026-10-14T01:00:00Z' },
      { name: 'no id' },
    ],
    files: [
      { id: 'f1', ref: 'F-101', name: 'Offer.pdf', contentType: 'application/pdf', size: '900', at: '2026-10-14T02:00:00Z', parent: CONTRACTS, seen: true },
      { id: 'f2', ref: 'F-102', name: 'Renewal.docx', contentType: null, size: null, at: '2026-10-14T03:00:00Z', parent: Y2026, seen: false },
      // Shared on its own inside a folder that is not: it stands at the top.
      { id: 'f3', ref: 'F-103', name: 'appraisal.pdf', contentType: null, size: 1, at: '2026-10-14T04:00:00Z', parent: null },
    ],
    letters: [
      { id: 'l1', ref: 'D-101', typeName: 'Offer letter', name: 'Offer_zack.pdf', at: '2026-10-01T02:00:00Z', memoId: 'm1', readAt: '2026-10-02T02:00:00Z', acknowledgedAt: null },
      { id: 'l2', ref: 'D-102', typeName: '', name: 'Warning.pdf', at: '2026-10-09T02:00:00Z', memoId: null, readAt: null, acknowledgedAt: null },
    ],
  },
}

describe('reading my_documents()', () => {
  const docs = myDocumentsFromRow(row)!

  it('keeps Company and Personal as they came, nothing malformed', () => {
    expect(docs.staffId).toBe('zack')
    expect(docs.company).toEqual([expect.objectContaining({ id: 'd1', ext: 'PDF', seen: false })])
    expect(docs.personal.folders.map(f => [f.id, f.parent])).toEqual([[CONTRACTS, null], [Y2026, CONTRACTS]])
    expect(docs.personal.files[0]).toMatchObject({ ext: 'PDF', size: 900, seen: true })
    expect(docs.personal.files[2]).toMatchObject({ parent: null, seen: false })
    expect(docs.personal.letters[1]).toMatchObject({ typeName: 'Letter', ext: 'PDF', memoId: null })
  })

  it('a shared login (no record) has nothing; a broken answer is no answer', () => {
    expect(myDocumentsFromRow({ staffId: null, company: [], personal: {} })).toEqual({ staffId: null, company: [], personal: EMPTY_PERSONAL })
    expect(myDocumentsFromRow(null)).toBeNull()
    expect(myDocumentsFromRow([])).toBeNull()
    expect(personalFromRow(undefined)).toEqual(EMPTY_PERSONAL)
  })
})

describe('drawing Personal', () => {
  const personal = personalFromRow(row.personal)

  it('the top: the letters newest first, the folders A→Z with what is in them all the way down, the files A→Z', () => {
    const top = personalIn(personal, null)
    expect(top.letters.map(l => l.id)).toEqual(['l2', 'l1'])
    expect(top.folders.map(f => [f.name, f.files, f.unseen])).toEqual([['Contracts', 2, 1]])
    expect(top.files.map(f => f.name)).toEqual(['appraisal.pdf'])
  })

  it('a folder: its folders and files, no letters; an unknown one holds nothing', () => {
    expect(personalIn(personal, CONTRACTS)).toMatchObject({ folders: [{ name: '2026', files: 1, unseen: 1 }], files: [{ id: 'f1' }], letters: [] })
    expect(personalIn(personal, 'gone')).toEqual({ folders: [], files: [], letters: [] })
  })

  it('the path from the top', () => {
    expect(personalPath(personal, Y2026)).toEqual([{ id: null, name: 'Personal' }, { id: CONTRACTS, name: 'Contracts' }, { id: Y2026, name: '2026' }])
    expect(personalPath(personal, null)).toEqual([{ id: null, name: 'Personal' }])
    expect(personalPath(personal, 'gone')).toEqual([{ id: null, name: 'Personal' }])
  })

  it('what is new: files not opened, letters not read; how a letter stands', () => {
    expect(personalUnseen(personal)).toBe(3)
    expect(personal.letters.map(letterState)).toEqual(['read', 'new'])
    expect(letterState({ readAt: 'x', acknowledgedAt: 'y' })).toBe('acknowledged')
  })
})
