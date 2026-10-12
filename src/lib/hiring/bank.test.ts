import { describe, expect, it } from 'vitest'
import {
  BIN, HV, ROOT, bankFromRow, binDaysLeft, binFrom, binLeftLabel, binSections, canonicalAt, companiesOf, companyAt, crumbs, deptAt, departmentsOf,
  folderAt, folderCards, folderNameRefusal, heldIn, holdsPeople, moveTargets, parsePlace, pathLine, placeExists, placeFiles, placeOfTalent, savedIn,
  searchBank, takesFolders, talentAt, talentsIn, type BankTree,
} from './bank'
import type { HiringTalent } from './types'

// Hiring › Talent Bank as a Drive (2026-10-12): company › department › people, the companies and departments from the
// guest link's list and from folders HR makes, HR's folders holding people and files.

const CAR = '11111111-1111-4111-8111-111111111111'
const CMI = '22222222-2222-4222-8222-222222222222' // off the guest link's list
const OLD = '33333333-3333-4333-8333-333333333333' // off the list, nothing in it
const F_OHANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const F_OHANA_SALES = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const F_SENIOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'

const talent = (id: string, name: string, more: Partial<HiringTalent> = {}): HiringTalent => ({
  id, no: 'T-001', name, phone: '', email: '', position: 'Sales Executive', department: 'Revenue', fromRequest: null, notes: '',
  files: [], savedBy: 'Grace Lim', savedAt: '2026-10-12T08:00:00Z', events: [], ...more,
})

const T_ALI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const T_MEI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const T_AHMAD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
const T_SITI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'
const T_NEW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5'

const bank = bankFromRow({
  hq: ['Revenue', 'HR', 'Finance'],
  subs: [
    { id: CAR, code: 'CAR', name: 'Carres', departments: ['Marketing', 'Sales'], removed: false },
    { id: CMI, code: 'CMI', name: 'CMI', departments: [], removed: true },
    { id: OLD, code: 'OLD', name: 'Old Co', departments: ['Ops'], removed: true },
  ],
  folders: [
    { id: F_OHANA, name: 'Ohana', parent: 'root', createdAt: '2026-10-12T08:00:00Z', createdBy: 'Grace Lim' },
    { id: F_OHANA_SALES, name: 'Sales', parent: `folder:${F_OHANA}`, createdAt: '2026-10-12T08:00:00Z', createdBy: 'Grace Lim' },
    // Made when Sales was spelt "sales" on the list: read in the list's spelling.
    { id: F_SENIOR, name: 'Seniors', parent: `dept:${CAR}:sales`, createdAt: '2026-10-12T08:00:00Z', createdBy: 'Grace Lim' },
  ],
  files: [{ id: 'f1', name: 'Walk-in CVs.pdf', contentType: 'application/pdf', size: 2048, parent: `folder:${F_OHANA}`, addedAt: '2026-10-12T08:00:00Z', addedBy: 'Grace Lim' }],
  places: {
    [T_ALI]: 'dept:hv:Revenue',
    [T_MEI]: `dept:${CAR}:Sales`,
    [T_AHMAD]: `folder:${F_SENIOR}`,
    [T_SITI]: `dept:${CMI}:Cleaning`,
  },
})!

const tree: BankTree = {
  bank,
  talents: [
    talent(T_ALI, 'Ali', { notes: 'Strong closer', phone: '012-111 2222' }),
    talent(T_MEI, 'Mei', { position: 'Promoter' }),
    talent(T_AHMAD, 'Ahmad', { position: 'Senior Sales' }),
    talent(T_SITI, 'Siti', { position: 'Cleaner', department: 'Cleaning' }),
    // Saved after the bank was read: their department in HOUZS Venture until the next read.
    talent(T_NEW, 'Nurul', { department: 'finance' }),
  ],
}

describe('reading the bank', () => {
  it('keeps what is well formed, every department in its list’s own spelling', () => {
    expect(bankFromRow(null)).toBeNull()
    expect(bank.hq).toEqual(['Revenue', 'HR', 'Finance'])
    expect(bank.folders.find(f => f.id === F_SENIOR)!.parent).toBe(`dept:${CAR}:Sales`)
    expect(bank.subs.map(s => [s.name, s.removed])).toEqual([['Carres', false], ['CMI', true], ['Old Co', true]])
  })

  it('reads addresses back, and nothing else', () => {
    expect(parsePlace(ROOT)?.kind).toBe('root')
    expect(parsePlace(HV)).toEqual({ kind: 'company', co: 'hv', dept: '', id: '' })
    expect(parsePlace(`dept:${CAR}:Business: Development`)).toEqual({ kind: 'dept', co: CAR, dept: 'Business: Development', id: '' })
    expect(parsePlace(talentAt(T_ALI))?.kind).toBe('talent')
    for (const bad of ['', 'company:carres', 'dept:hv:', 'folder:1', 'person:x']) expect(parsePlace(bad)).toBeNull()
  })

  it('places a talent the bank has not answered for yet in their department of HOUZS Venture', () => {
    expect(placeOfTalent(tree.talents[4], bank)).toBe('dept:hv:Finance')
    expect(placeOfTalent(tree.talents[1], bank)).toBe(`dept:${CAR}:Sales`)
  })
})

describe('the companies and their departments', () => {
  it('HOUZS Venture, the guest link’s list, and one taken off it only while something is in it', () => {
    expect(companiesOf(tree).map(c => [c.name, c.removed])).toEqual([['HOUZS Venture', false], ['Carres', false], ['CMI', true]])
  })

  it('a company’s departments: those it lists, then one somebody is still kept in', () => {
    expect(departmentsOf('hv', tree)).toEqual(['Revenue', 'HR', 'Finance'])
    expect(departmentsOf(CAR, tree)).toEqual(['Marketing', 'Sales'])
    expect(departmentsOf(CMI, tree)).toEqual(['Cleaning'])
  })
})

describe('the tree', () => {
  it('the bank: the companies first, then the folders HR made there', () => {
    expect(folderCards(ROOT, tree).map(c => [c.kind, c.name, c.line, c.own])).toEqual([
      ['company', 'HOUZS Venture', '3 departments · 2 people', false],
      ['company', 'Carres', '2 departments · 2 people', false],
      ['company', 'CMI', '1 department · 1 person · off the guest link', false],
      ['folder', 'Ohana', '1 folder · 1 file', true],
    ])
  })

  it('a company: its departments; a department: its people and its folders', () => {
    expect(folderCards(companyAt(CAR), tree).map(c => [c.name, c.line])).toEqual([['Marketing', '0 people'], ['Sales', '2 people · 1 folder']])
    expect(talentsIn(deptAt(CAR, 'Sales'), tree).map(t => t.name)).toEqual(['Mei'])
    expect(folderCards(deptAt(CAR, 'Sales'), tree).map(c => [c.name, c.line])).toEqual([['Seniors', '1 person']])
    expect(talentsIn(folderAt(F_SENIOR), tree).map(t => t.name)).toEqual(['Ahmad'])
    expect(placeFiles(folderAt(F_OHANA), bank).map(f => f.name)).toEqual(['Walk-in CVs.pdf'])
  })

  it('the path, back up to the bank', () => {
    expect(crumbs(talentAt(T_AHMAD), tree).map(c => c.name)).toEqual(['Talent Bank', 'Carres', 'Sales', 'Seniors', 'Ahmad'])
    expect(pathLine(folderAt(F_SENIOR), tree)).toBe('Carres › Sales › Seniors')
    expect(crumbs('folder:cccccccc-cccc-4ccc-8ccc-cccccccccccc', tree).map(c => c.name)).toEqual(['Talent Bank'])
  })

  it('what is a place, and what takes people or folders', () => {
    expect([placeExists(companyAt(OLD), tree), placeExists(deptAt(CAR, 'Operation'), tree), placeExists(deptAt(CAR, 'sales'), tree)]).toEqual([false, false, true])
    expect(canonicalAt(deptAt(CAR, 'sales'), tree)).toBe(deptAt(CAR, 'Sales'))
    expect([holdsPeople(ROOT), holdsPeople(HV), holdsPeople(folderAt(F_OHANA)), holdsPeople(talentAt(T_ALI))]).toEqual([false, true, true, false])
    expect([takesFolders(ROOT), takesFolders(talentAt(T_ALI))]).toEqual([true, false])
  })

  // 2026-10-12, "change name, and move together": a folder goes with everything in it — never inside itself.
  it('a folder may go anywhere but inside itself, the top included; everybody in a department anywhere outside it', () => {
    const forFolder = moveTargets(tree, { from: folderAt(F_OHANA), withRoot: true }).map(x => x.path)
    expect(forFolder[0]).toBe('Talent Bank')
    expect(forFolder).not.toContain('Ohana')
    expect(forFolder).not.toContain('Ohana › Sales')
    expect(moveTargets(tree, { from: deptAt(CAR, 'Sales') }).map(x => x.path)).not.toContain('Carres › Sales › Seniors')
    expect(heldIn(deptAt(CAR, 'Sales'), tree)).toEqual({ people: 1, folders: 1, files: 0, line: '1 person, 1 folder' })
    expect(heldIn(deptAt(CAR, 'Marketing'), tree).line).toBe('')
  })

  it('every place a person may be moved to, top down', () => {
    expect(moveTargets(tree).map(x => x.path)).toEqual([
      'HOUZS Venture', 'HOUZS Venture › Revenue', 'HOUZS Venture › HR', 'HOUZS Venture › Finance',
      'Carres', 'Carres › Marketing', 'Carres › Sales', 'Carres › Sales › Seniors',
      'CMI', 'CMI › Cleaning',
      'Ohana', 'Ohana › Sales',
    ])
  })
})

describe('naming a folder', () => {
  it('says what will not do, as the database does', () => {
    expect(folderNameRefusal(' ', ROOT, tree)).toBe('Name the folder.')
    expect(folderNameRefusal('x'.repeat(81), ROOT, tree)).toBe('Keep the name under 80 characters.')
    expect(folderNameRefusal('A/B', ROOT, tree)).toBe('A folder’s name cannot hold a slash.')
    expect(folderNameRefusal('houzs venture', ROOT, tree)).toBe('houzs venture is here already.')
    expect(folderNameRefusal('CARRES', ROOT, tree)).toBe('CARRES is here already.')
    expect(folderNameRefusal('CMI', ROOT, tree)).toBeNull()
    expect(folderNameRefusal('sales', companyAt(CAR), tree)).toBe('sales is here already.')
    expect(folderNameRefusal('ohana', ROOT, tree)).toBe('ohana is here already.')
    expect(folderNameRefusal('Ohana', ROOT, tree, F_OHANA)).toBeNull()
    expect(folderNameRefusal('Sales', folderAt(F_OHANA), tree, F_OHANA_SALES)).toBeNull()
  })
})

describe('saved from a request', () => {
  it('a guest’s request goes to its company and department; HOUZS Venture’s to the department picked', () => {
    expect(savedIn({ source: 'guest', requesterCompany: 'Carres', answers: { dept: 'Sales' } }, 'Revenue')).toEqual({ company: 'Carres', dept: 'Sales', label: 'Carres › Sales' })
    expect(savedIn({ source: 'portal', requesterCompany: null, answers: { dept: 'Revenue · IR' } }, '')).toEqual({ company: 'HOUZS Venture', dept: 'Revenue', label: 'HOUZS Venture › Revenue' })
    expect(savedIn({ source: 'portal', requesterCompany: null, answers: { dept: 'Revenue · IR' } }, 'Marketing').label).toBe('HOUZS Venture › Marketing')
  })
})

describe('search', () => {
  it('finds places, people by what they fit or a note, and files — each with where it is', () => {
    expect(searchBank('sales', tree).map(h => [h.kind, h.kind === 'place' ? h.card.name : h.kind === 'talent' ? h.talent.name : h.file.name, h.path])).toEqual([
      ['place', 'Sales', 'Carres'],
      ['place', 'Sales', 'Ohana'],
      ['talent', 'Ali', 'HOUZS Venture › Revenue'],
      ['talent', 'Ahmad', 'Carres › Sales › Seniors'],
      ['talent', 'Nurul', 'HOUZS Venture › Finance'],
    ])
    expect(searchBank('closer', tree).map(h => h.kind)).toEqual(['talent'])
    expect(searchBank('walk-in', tree).map(h => h.kind)).toEqual(['file'])
    expect(searchBank('  ', tree)).toEqual([])
  })
})

// The Bin (2026-10-13 — the user: "make a bin, then that bin will last for 30 days. file that last for more than 30days
// in bin, will auto delete").
describe('the Bin', () => {
  const F_INTERNS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'
  const when = { deletedAt: '2026-10-12T08:00:00Z', deletedBy: 'Grace Lim', expiresAt: '2026-11-11T08:00:00Z' }
  const withBin = bankFromRow({
    hq: ['Revenue'],
    subs: [{ id: CAR, code: 'CAR', name: 'Carres', departments: ['Sales'], removed: false }],
    folders: [{ id: F_OHANA, name: 'Ohana', parent: 'root', createdAt: '2026-10-12T08:00:00Z', createdBy: 'Grace Lim' }],
    files: [],
    places: {},
    bin: [
      // A folder HR deleted inside Ohana, then a person who was in it — named through the Bin.
      { id: 'x1', kind: 'folder', name: 'Interns', at: `folder:${F_OHANA}`, folderId: F_INTERNS, ...when },
      { id: 'x2', kind: 'talent', name: 'Sam', at: `folder:${F_INTERNS}`, talentId: T_ALI, ...when },
      // In the list's own spelling, as the tree's departments are.
      { id: 'x3', kind: 'file', name: 'Old CVs.pdf', at: `dept:${CAR}:sales`, contentType: 'application/pdf', size: 1024, ...when },
      { id: 'x4', kind: 'talent_file', name: 'IC.jpg', at: null, talentId: T_MEI, talentName: 'Mei', fileType: 'IC', ...when },
      { id: 'x5', kind: 'file', name: 'Top.pdf', at: 'root', ...when },
      { id: 'x6', kind: 'nonsense', name: 'Bad', at: 'root', ...when },
      { kind: 'file', name: 'No id', at: 'root', ...when },
    ],
  })!
  const binTree: BankTree = { bank: withBin, talents: [] }

  it('reads the Bin: each item kept as it came, the address in its list’s spelling, nothing malformed', () => {
    expect(withBin.bin.map(b => [b.id, b.kind, b.at])).toEqual([
      ['x1', 'folder', `folder:${F_OHANA}`],
      ['x2', 'talent', `folder:${F_INTERNS}`],
      ['x3', 'file', `dept:${CAR}:Sales`],
      ['x4', 'talent_file', ''],
      ['x5', 'file', 'root'],
    ])
    expect(withBin.bin[3]).toMatchObject({ talentName: 'Mei', fileType: 'IC', contentType: null, size: null })
    expect(withBin.bin[2]).toMatchObject({ contentType: 'application/pdf', size: 1024, deletedBy: 'Grace Lim', expiresAt: '2026-11-11T08:00:00Z' })
    expect(bankFromRow({ hq: [] })!.bin).toEqual([])
    // When it was read is the server's to say (`loadTalentBank`), not the row's.
    expect(withBin.readAt).toBe('')
  })

  it('says where each was — a folder in the Bin too, a person’s file by the person', () => {
    expect(withBin.bin.map(b => binFrom(b, binTree))).toEqual(['Ohana', 'Ohana › Interns', 'Carres › Sales', 'Mei', 'Talent Bank'])
  })

  it('counts the days left — 1 on the last day — and says them', () => {
    const item = withBin.bin[0]
    expect(binDaysLeft(item, Date.parse('2026-10-12T08:00:00Z'))).toBe(30)
    expect(binDaysLeft(item, Date.parse('2026-10-13T08:00:00Z'))).toBe(29)
    expect(binDaysLeft(item, Date.parse('2026-11-11T07:00:00Z'))).toBe(1)
    expect(binDaysLeft(item, Date.parse('2026-11-12T00:00:00Z'))).toBe(0)
    expect(binDaysLeft({ expiresAt: '' }, 0)).toBe(0)
    expect([binLeftLabel(29), binLeftLabel(1)]).toEqual(['29 days left', '1 day left'])
  })

  it('draws as a place does: folders, people, then files — a person’s among them', () => {
    const s = binSections(withBin.bin)
    expect([s.folders, s.people, s.files].map(x => x.map(b => b.id))).toEqual([['x1'], ['x2'], ['x3', 'x4', 'x5']])
  })

  it('is not a place of the tree: the address keeps it, the tree does not draw it', () => {
    expect(parsePlace(BIN)).toBeNull()
    expect(placeExists(BIN, binTree)).toBe(false)
    expect(canonicalAt(BIN, binTree)).toBe(BIN)
  })
})
