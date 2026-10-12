import { describe, expect, it } from 'vitest'
import {
  EMPTY_DRIVE, HV, ROOT, crumbs, deptAt, driveFromRow, fileTone, folderAt, folderCards, folderNameRefusal, parentOf, parsePlace,
  pathLine, personAt, placeExists, placeFiles, searchDrive, sizeLabel, takesFolders, type Drive,
} from './drive'
import type { Documentation, PersonLetter } from './model'

// The Data center as a Drive (2026-10-12 — the user: company → department → the person, folders HR makes for a
// subsidiary and its departments): the tree, its addresses, what each place holds, a name once per place, search.

const REV = '11111111-1111-4111-8111-111111111111'
const HRD = '22222222-2222-4222-8222-222222222222'
const ZACK = '33333333-3333-4333-8333-333333333333'
const AMY = '44444444-4444-4444-8444-444444444444'
const CARRES = '55555555-5555-4555-8555-555555555555'
const CARRES_FIN = '66666666-6666-4666-8666-666666666666'

const letter = (over: Partial<PersonLetter>): PersonLetter => ({
  id: 'L1', ref: 'D-101', staffId: ZACK, staffName: 'Zack', typeId: 'warn', typeName: 'Warning letter', fileName: 'Warning_zack.pdf',
  contentType: 'application/pdf', size: 1, filedAt: '2026-10-01T02:00:00Z', filedBy: 'HR Manager', source: 'upload',
  readAt: null, acknowledgedAt: null, withdrawnAt: null, events: [], ...over,
})

const DOC: Pick<Documentation, 'departments' | 'people' | 'letters' | 'letterTypes'> = {
  departments: [
    { id: REV, name: 'Revenue Department', people: 1 },
    { id: HRD, name: 'HR', people: 1 },
  ],
  people: [
    { id: ZACK, name: 'Zack', code: 'HV010', title: 'Team Leader', departmentId: REV },
    { id: AMY, name: 'Amy', code: 'HV020', title: 'HR Manager', departmentId: HRD },
  ],
  letterTypes: [{ id: 'offer', name: 'Offer letter', compulsory: true, count: 1 }, { id: 'warn', name: 'Warning letter', compulsory: false, count: 1 }],
  letters: [letter({}), letter({ id: 'L2', staffId: AMY, staffName: 'Amy', typeId: 'offer', typeName: 'Offer letter', fileName: 'Offer_amy.pdf' })],
}

const DRIVE: Drive = {
  folders: [
    { id: CARRES, name: 'Carres', parent: ROOT, createdAt: '2026-10-12T01:00:00Z', createdBy: 'Amy' },
    { id: CARRES_FIN, name: 'Finance', parent: folderAt(CARRES), createdAt: '2026-10-12T01:00:00Z', createdBy: 'Amy' },
  ],
  files: [
    { id: 'F1', ref: 'F-101', fileName: 'SOP.pdf', contentType: 'application/pdf', size: 2_400_000, parent: folderAt(CARRES_FIN), uploadedAt: '2026-10-12T02:00:00Z', uploadedBy: 'Amy', deletedAt: null, events: [] },
    { id: 'F2', ref: 'F-102', fileName: 'Old.xlsx', contentType: null, size: 900, parent: folderAt(CARRES_FIN), uploadedAt: '2026-10-12T02:00:00Z', uploadedBy: 'Amy', deletedAt: '2026-10-12T03:00:00Z', events: [] },
  ],
}

describe('reading hr_drive()', () => {
  it('keeps what it can read and skips what has no id', () => {
    const d = driveFromRow({
      folders: [{ id: CARRES, name: 'Carres', parent: 'root', createdAt: 'x', createdBy: 'Amy' }, { name: 'no id' }],
      files: [{ id: 'F1', ref: 'F-101', fileName: 'a.pdf', size: '12', parent: `folder:${CARRES}`, events: [{ what: 'Uploaded', at: 'x', who: 'Amy', note: null }] }],
    })
    expect(d?.folders).toHaveLength(1)
    expect(d?.files[0]).toMatchObject({ size: 12, contentType: null, deletedAt: null, events: [{ what: 'Uploaded', note: '' }] })
    expect(driveFromRow(null)).toBeNull()
    expect(driveFromRow([])).toBeNull()
  })
})

describe('places', () => {
  it('reads an address back, and nothing else', () => {
    expect(parsePlace(ROOT)).toEqual({ kind: 'root', id: '' })
    expect(parsePlace(HV)).toEqual({ kind: 'company', id: 'hv' })
    expect(parsePlace(personAt(ZACK))).toEqual({ kind: 'person', id: ZACK })
    expect(parsePlace('folder:nope')).toBeNull()
    expect(parsePlace('dept:x; drop')).toBeNull()
    expect(parsePlace(undefined)).toBeNull()
  })

  it('walks up from a person to the Data center, and from a folder HR made', () => {
    expect(crumbs(personAt(ZACK), DOC, DRIVE).map(c => c.name)).toEqual(['Data center', 'HOUZS Venture', 'Revenue', 'Zack'])
    expect(crumbs(folderAt(CARRES_FIN), DOC, DRIVE).map(c => c.name)).toEqual(['Data center', 'Carres', 'Finance'])
    expect(parentOf(deptAt(REV), DOC, DRIVE)).toBe(HV)
    expect(pathLine(folderAt(CARRES_FIN), DOC, DRIVE)).toBe('Carres › Finance')
    expect(pathLine(ROOT, DOC, DRIVE)).toBe('Data center')
  })

  it('a place that went (a folder deleted, a person gone) is no place — the path falls back to the Data center', () => {
    expect(placeExists(folderAt('77777777-7777-4777-8777-777777777777'), DOC, DRIVE)).toBe(false)
    expect(placeExists(personAt('88888888-8888-4888-8888-888888888888'), DOC, DRIVE)).toBe(false)
    expect(crumbs(folderAt('77777777-7777-4777-8777-777777777777'), DOC, DRIVE).map(c => c.at)).toEqual([ROOT])
  })

  it('a folder may go anywhere but inside a person', () => {
    expect([ROOT, HV, deptAt(REV), folderAt(CARRES)].map(takesFolders)).toEqual([true, true, true, true])
    expect(takesFolders(personAt(ZACK))).toBe(false)
  })
})

describe('what a place holds', () => {
  it('the Data center: HOUZS Venture (by itself, its people missing a compulsory letter counted), then HR’s folders', () => {
    const cards = folderCards(ROOT, DOC, DRIVE)
    expect(cards.map(c => [c.name, c.kind, c.own])).toEqual([['HOUZS Venture', 'company', false], ['Carres', 'folder', true]])
    expect(cards[0]).toMatchObject({ line: '2 departments · 2 people', missing: 1 })
    expect(cards[1].line).toBe('1 folder')
  })

  it('HOUZS Venture: its departments, by People, each with its people and who misses a letter', () => {
    const cards = folderCards(HV, DOC, DRIVE)
    expect(cards.map(c => [c.name, c.line, c.missing])).toEqual([['Revenue', '1 person', 1], ['HR', '1 person', 0]])
  })

  it('a department: its people as folders — their title, their letters, a "!" while a compulsory letter is missing', () => {
    const [zack] = folderCards(deptAt(REV), DOC, DRIVE)
    expect(zack).toMatchObject({ at: personAt(ZACK), kind: 'person', name: 'Zack', line: 'Team Leader · 1 letter', missing: 1, own: false })
    expect(zack.missingWhy).toBe('Offer letter missing')
  })

  it('a person holds no folders; a folder HR made holds its own, and its files — deleted ones only when asked', () => {
    expect(folderCards(personAt(ZACK), DOC, DRIVE)).toEqual([])
    expect(placeFiles(folderAt(CARRES_FIN), DRIVE).map(f => f.id)).toEqual(['F1'])
    expect(placeFiles(folderAt(CARRES_FIN), DRIVE, true).map(f => f.id)).toEqual(['F1', 'F2'])
    expect(folderCards(folderAt(CARRES), DOC, DRIVE)[0].line).toBe('1 file')
    expect(folderCards(ROOT, DOC, EMPTY_DRIVE)).toHaveLength(1)
  })
})

describe('a folder’s name', () => {
  it('is one per place, what is there by itself included, in any case', () => {
    expect(folderNameRefusal('carres', ROOT, DOC, DRIVE)).toBe('carres is here already.')
    expect(folderNameRefusal('HOUZS venture', ROOT, DOC, DRIVE)).toMatch(/here already/)
    expect(folderNameRefusal('revenue', HV, DOC, DRIVE)).toMatch(/here already/)
    expect(folderNameRefusal('Zack', deptAt(REV), DOC, DRIVE)).toMatch(/here already/)
    expect(folderNameRefusal('Finance', ROOT, DOC, DRIVE)).toBeNull()
  })

  it('a rename may keep its own name', () => {
    expect(folderNameRefusal('Carres', ROOT, DOC, DRIVE, CARRES)).toBeNull()
  })

  it('has words, no slash, under 80', () => {
    expect(folderNameRefusal('  ', ROOT, DOC, DRIVE)).toBe('Name the folder.')
    expect(folderNameRefusal('a/b', ROOT, DOC, DRIVE)).toMatch(/slash/)
    expect(folderNameRefusal('x'.repeat(81), ROOT, DOC, DRIVE)).toMatch(/80/)
  })
})

describe('search', () => {
  it('finds people, departments, folders, files and letters anywhere — each with where it is', () => {
    expect(searchDrive('zack', DOC, DRIVE).map(h => [h.kind, h.path])).toEqual([
      ['place', 'HOUZS Venture › Revenue'],
      ['letter', 'HOUZS Venture › Revenue › Zack'],
    ])
    expect(searchDrive('fin', DOC, DRIVE).map(h => (h.kind === 'place' ? h.card.name : ''))).toEqual(['Finance'])
    expect(searchDrive('sop', DOC, DRIVE).map(h => [h.kind, h.path])).toEqual([['file', 'Carres › Finance']])
    expect(searchDrive('old', DOC, DRIVE)).toEqual([])
    expect(searchDrive('  ', DOC, DRIVE)).toEqual([])
    expect(searchDrive('revenue', DOC, DRIVE).map(h => (h.kind === 'place' ? h.card.at : ''))).toEqual([deptAt(REV)])
  })
})

describe('a file’s tile', () => {
  it('wears its kind’s colour', () => {
    expect(fileTone('a.pdf', null)).toBe('pdf')
    expect(fileTone('a.XLSX', null)).toBe('sheet')
    expect(fileTone('rates.csv', 'text/csv')).toBe('sheet')
    expect(fileTone('a.docx', null)).toBe('doc')
    expect(fileTone('scan.jpeg', 'image/jpeg')).toBe('image')
    expect(fileTone('a.zip', null)).toBe('other')
  })

  it('says its size', () => {
    expect([sizeLabel(null), sizeLabel(900), sizeLabel(980_000), sizeLabel(2_400_000), sizeLabel(24_000_000)]).toEqual(['', '900 B', '957 KB', '2.3 MB', '23 MB'])
  })
})
