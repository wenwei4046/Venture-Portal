import { describe, expect, it } from 'vitest'
import {
  BIN, EMPTY_DRIVE, HV, ROOT, binDaysLeft, binFrom, binLeftLabel, binSections, copyName, crumbs, deptAt, driveFromRow, fileTone, folderAt, folderCards,
  folderNameRefusal, lockWords, moveTargets, parentOf, parsePlace, pathLine, personAt, personOf, placeExists, placeFiles, searchDrive, sizeLabel,
  takesFolders, type Drive,
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
  readAt: null, acknowledgedAt: null, withdrawnAt: null, hiddenAt: null, events: [], ...over,
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
    { id: CARRES, name: 'Carres', parent: ROOT, createdAt: '2026-10-12T01:00:00Z', createdBy: 'Amy', lock: null, memberView: null, memberSees: null },
    { id: CARRES_FIN, name: 'Finance', parent: folderAt(CARRES), createdAt: '2026-10-12T01:00:00Z', createdBy: 'Amy', lock: null, memberView: null, memberSees: null },
  ],
  files: [
    { id: 'F1', ref: 'F-101', fileName: 'SOP.pdf', contentType: 'application/pdf', size: 2_400_000, parent: folderAt(CARRES_FIN), uploadedAt: '2026-10-12T02:00:00Z', uploadedBy: 'Amy', deletedAt: null, events: [], lock: null, memberView: null, memberSees: null },
    { id: 'F2', ref: 'F-102', fileName: 'Old.xlsx', contentType: null, size: 900, parent: folderAt(CARRES_FIN), uploadedAt: '2026-10-12T02:00:00Z', uploadedBy: 'Amy', deletedAt: '2026-10-12T03:00:00Z', events: [], lock: null, memberView: null, memberSees: null },
  ],
  bin: [],
  readAt: '',
  canLock: false,
}

describe('reading hr_drive()', () => {
  it('keeps what it can read and skips what has no id', () => {
    const d = driveFromRow({
      folders: [{ id: CARRES, name: 'Carres', parent: 'root', createdAt: 'x', createdBy: 'Amy', lock: null, memberView: null, memberSees: null }, { name: 'no id' }],
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

  it('a folder may go anywhere — a person’s folder too, since 2026-10-14', () => {
    expect([ROOT, HV, deptAt(REV), folderAt(CARRES), personAt(ZACK)].map(takesFolders)).toEqual([true, true, true, true, true])
    expect(takesFolders('person:nope')).toBe(false)
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

// Move to… and the Bin (2026-10-13 — the user: "Data center 也加 Bin 和 Move to…", the Talent Bank's rules).
describe('Move to…', () => {
  it('every place a folder may go, top down — the Data center itself first, each person’s folder (2026-10-14), never itself or inside it', () => {
    expect(moveTargets(DOC, DRIVE, folderAt(CARRES)).map(x => [x.path, x.depth])).toEqual([
      ['Data center', 0],
      ['HOUZS Venture', 1],
      ['HOUZS Venture › Revenue', 2],
      ['HOUZS Venture › Revenue › Zack', 3],
      ['HOUZS Venture › HR', 2],
      ['HOUZS Venture › HR › Amy', 3],
    ])
    const fin = moveTargets(DOC, DRIVE, folderAt(CARRES_FIN)).map(x => x.at)
    expect(fin).toContain(folderAt(CARRES))
    expect(fin).not.toContain(folderAt(CARRES_FIN))
    expect(fin).toContain(personAt(ZACK))
    // A file excludes nothing: every place, its own folder too.
    expect(moveTargets(DOC, DRIVE, '').map(x => x.at)).toContain(folderAt(CARRES_FIN))
  })
})

describe('the Bin', () => {
  const OLD = '77777777-7777-4777-8777-777777777777'
  const when = { deletedAt: '2026-10-12T08:00:00Z', deletedBy: 'Amy', expiresAt: '2026-11-11T08:00:00Z' }
  const read = driveFromRow({
    folders: [{ id: CARRES, name: 'Carres', parent: 'root', createdAt: 'x', createdBy: 'Amy', lock: null, memberView: null, memberSees: null }],
    files: [],
    bin: [
      { id: 'b1', kind: 'folder', name: 'Old', at: `folder:${CARRES}`, folderId: OLD, ...when },
      { id: 'b2', kind: 'file', name: 'Draft.pdf', at: `folder:${OLD}`, fileId: 'F7', ref: 'F-107', contentType: 'application/pdf', size: '2048', ...when },
      { id: 'b3', kind: 'file', name: 'Rates.xlsx', at: `dept:${REV}`, fileId: 'F8', ...when },
      { id: 'b4', kind: 'letter', name: 'Not a Bin kind', at: 'root', ...when },
      { kind: 'file', name: 'No id', at: 'root', ...when },
    ],
  })!

  it('reads the Bin as it came, nothing malformed; the read’s time is the server’s to say', () => {
    expect(read.bin.map(b => [b.id, b.kind, b.at])).toEqual([
      ['b1', 'folder', `folder:${CARRES}`],
      ['b2', 'file', `folder:${OLD}`],
      ['b3', 'file', `dept:${REV}`],
    ])
    expect(read.bin[1]).toMatchObject({ fileId: 'F7', ref: 'F-107', contentType: 'application/pdf', size: 2048, deletedBy: 'Amy' })
    expect(read.readAt).toBe('')
    expect(driveFromRow({ folders: [] })!.bin).toEqual([])
    expect(EMPTY_DRIVE.bin).toEqual([])
  })

  it('says where each was — through a folder in the Bin too', () => {
    expect(read.bin.map(b => binFrom(b, DOC, read))).toEqual(['Carres', 'Carres › Old', 'HOUZS Venture › Revenue'])
  })

  it('counts the days left and draws as a place does: folders, then files', () => {
    expect(binDaysLeft(read.bin[0], Date.parse('2026-10-13T08:00:00Z'))).toBe(29)
    expect(binLeftLabel(binDaysLeft(read.bin[0], Date.parse('2026-11-11T07:00:00Z')))).toBe('1 day left')
    const s = binSections(read.bin)
    expect([s.folders.map(b => b.id), s.files.map(b => b.id)]).toEqual([['b1'], ['b2', 'b3']])
  })

  it('is not a place of the tree', () => {
    expect(parsePlace(BIN)).toBeNull()
    expect(placeExists(BIN, DOC, read)).toBe(false)
  })
})

// A person’s own (2026-10-14, mig 20261014190000): what HR keeps in a person’s folder, its lock and its share.
describe('a person’s own, View only me', () => {
  const CONTRACTS = '88888888-8888-4888-8888-888888888888'
  const NESTED = '99999999-9999-4999-8999-999999999999'
  const read = driveFromRow({
    me: { canLock: true },
    folders: [
      { id: CONTRACTS, name: 'Contracts', parent: personAt(ZACK), createdAt: 'x', createdBy: 'Alvin', memberView: true, memberSees: true,
        lock: { by: 'Alvin', mine: true, at: '2026-10-14T01:00:00Z' } },
      { id: NESTED, name: '2026', parent: folderAt(CONTRACTS), createdAt: 'x', createdBy: 'Alvin', memberView: null, memberSees: false, lock: null },
    ],
    files: [
      { id: 'F9', ref: 'F-109', fileName: 'IC.pdf', parent: personAt(ZACK), uploadedAt: 'x', uploadedBy: 'Alvin', memberView: false, memberSees: false },
      { id: 'FX', ref: 'F-110', fileName: 'junk', parent: personAt(ZACK), memberView: 'yes', memberSees: 1, lock: 'x' },
    ],
  })!

  it('reads each one’s lock, its share and whether its person sees it — and whether the reader may lock', () => {
    expect(read.canLock).toBe(true)
    expect(read.folders[0]).toMatchObject({ lock: { by: 'Alvin', mine: true }, memberView: true, memberSees: true })
    expect(read.folders[1]).toMatchObject({ lock: null, memberView: null, memberSees: false })
    expect(read.files[0]).toMatchObject({ lock: null, memberView: false, memberSees: false })
    // Anything malformed reads as nothing set.
    expect(read.files[1]).toMatchObject({ lock: null, memberView: null, memberSees: null })
    expect(driveFromRow({})?.canLock).toBe(false)
  })

  it('a person’s folder holds HR’s folders; their card counts them beside their letters', () => {
    const doc = { ...DOC, letters: [] }
    expect(folderCards(personAt(ZACK), doc, read).map(c => [c.name, c.own, c.memberSees])).toEqual([['Contracts', true, true]])
    expect(folderCards(deptAt(REV), doc, read).find(c => c.at === personAt(ZACK))?.line).toBe('Team Leader · 0 letters · 1 folder · 2 files')
    expect(placeFiles(personAt(ZACK), read).map(f => f.id)).toEqual(['F9', 'FX'])
    expect(crumbs(folderAt(NESTED), doc, read).map(c => c.name)).toEqual(['Data center', 'HOUZS Venture', 'Revenue', 'Zack', 'Contracts', '2026'])
  })

  it('knows whose folder a place is in — or nobody’s', () => {
    expect(personOf(personAt(ZACK), read)).toBe(ZACK)
    expect(personOf(folderAt(NESTED), read)).toBe(ZACK)
    expect(personOf(folderAt(CARRES), DRIVE)).toBeNull()
    expect(personOf(HV, read)).toBeNull()
    expect(personOf('nonsense', read)).toBeNull()
  })

  it('says a lock in words, and names a copy as Drive does', () => {
    expect(lockWords({ by: 'Alvin', mine: true, at: '' })).toBe('Only you and above')
    expect(lockWords({ by: 'Alvin', mine: false, at: '' })).toBe('Only Alvin and above')
    expect(copyName('Offer.pdf')).toBe('Copy of Offer.pdf')
    expect(copyName('x'.repeat(300))).toHaveLength(200)
  })

  it('a folder name in a person’s folder is once per place, as anywhere', () => {
    expect(folderNameRefusal('contracts ', personAt(ZACK), DOC, read)).toBe('contracts is here already.')
    expect(folderNameRefusal('Payslips', personAt(ZACK), DOC, read)).toBeNull()
  })
})
