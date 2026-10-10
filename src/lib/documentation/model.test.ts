import { describe, expect, it } from 'vitest'
import {
  ackLine, audienceGroups, audienceLabel, contentTypeOf, dataCenterPeople, deptLabel, documentationFromRow, fileExt, fileRefusal,
  letterStatus, letterTrail, missingCount, missingFor, nameFromFile, objectPath, previewKind, publishRefusal, publishSummary,
  publishedAudience, safeFileName, type DocPerson, type LetterType, type PersonLetter,
} from './model'

// People › Documentation (2026-10-11, HR revamp round 2): the arithmetic its
// four tabs draw — the handoff's own words and numbers.

const REV = 'd-rev', HR = 'd-hr'
const people: DocPerson[] = [
  { id: 'chea', name: 'Chea Huan', code: 'HV004', title: 'Team Leader', departmentId: REV },
  { id: 'zack', name: 'Zack', code: 'HV010', title: 'Senior Revenue Specialist', departmentId: REV },
  { id: 'grace', name: 'Grace Lim', code: 'HV030', title: 'HR Manager', departmentId: HR },
]
const types: LetterType[] = [
  { id: 'offer', name: 'Offer letter', compulsory: true, count: 1 },
  { id: 'inc', name: 'Increment letter', compulsory: false, count: 1 },
]
const letter = (over: Partial<PersonLetter>): PersonLetter => ({
  id: 'l1', ref: 'D-101', staffId: 'zack', staffName: 'Zack', typeId: 'offer', typeName: 'Offer letter', fileName: 'Offer_zack.pdf',
  contentType: 'application/pdf', size: 1, filedAt: '2026-10-01T02:00:00Z', filedBy: 'HR Manager', source: 'upload',
  readAt: null, acknowledgedAt: null, events: [], ...over,
})

describe('documentationFromRow', () => {
  it('reads the database’s answer and fills what is missing safely', () => {
    const doc = documentationFromRow({
      departments: [{ id: REV, name: 'Revenue Department', people: 32 }],
      people: [{ id: 'zack', name: 'Zack', code: 'HV010', title: null, departmentId: REV }],
      documents: [{ id: 'x', ref: 'L-101', name: 'Price list', fileName: 'Price.xlsx', departmentIds: [REV], departments: ['Revenue Department'], uploadedAt: '2026-10-01', uploadedBy: 'HR', deletedAt: null, events: [{ what: 'Uploaded', at: '2026-10-01', who: 'HR', note: 'Shared with Revenue Department' }] }],
      letterTypes: [{ id: 'offer', name: 'Offer letter', compulsory: true, count: '2' }],
      letters: [],
      publishTypes: [{ id: 'm', name: 'Memo', builtin: true }],
      published: [{ id: 'p', kind: 'Memo', title: 'Hi', publishedAt: '2026-10-06', audience: 'Revenue · everyone', recipients: 12, acknowledged: 9 }],
    })
    expect(doc?.departments[0].people).toBe(32)
    expect(doc?.documents[0].events[0].note).toBe('Shared with Revenue Department')
    expect(doc?.letterTypes[0].count).toBe(2)
    expect(doc?.published[0].subDepartments).toEqual([])
    expect(documentationFromRow(null)).toBeNull()
    expect(documentationFromRow([])).toBeNull()
  })
})

describe('words', () => {
  it('reads “Revenue Department” as the handoff writes it, every other name as it is', () => {
    expect(deptLabel('Revenue Department')).toBe('Revenue')
    expect(deptLabel('Director Office')).toBe('Director Office')
    expect(deptLabel('HR')).toBe('HR')
  })

  it('names a file’s kind in four letters at most', () => {
    expect(fileExt('Price_List_Oct2026.xlsx')).toBe('XLSX')
    expect(fileExt('HV_Employee_Handbook_v3.2.pdf')).toBe('PDF')
    expect(fileExt('noext')).toBe('')
  })

  it('takes a document’s default name from its file', () => {
    expect(nameFromFile('Akemi_Catalogue_2026.pdf')).toBe('Akemi Catalogue 2026')
  })
})

describe('letters', () => {
  it('goes Delivered → Opened → Acknowledged with the memo it travelled as', () => {
    expect(letterStatus(letter({}))).toBe('delivered')
    expect(letterStatus(letter({ readAt: '2026-10-02' }))).toBe('opened')
    expect(letterStatus(letter({ readAt: '2026-10-02', acknowledgedAt: '2026-10-03' }))).toBe('ack')
  })

  it('tells the whole trail in time order, the person’s own steps included', () => {
    const l = letter({
      events: [
        { what: 'Uploaded', at: '2026-10-01T02:00:00Z', who: 'HR Manager', note: "Filed to Zack's record" },
        { what: 'Sent to Revenue app', at: '2026-10-01T02:00:00Z', who: 'System', note: '' },
        { what: 'Viewed', at: '2026-10-04T02:00:00Z', who: 'HR Manager', note: '' },
      ],
      readAt: '2026-10-02T02:00:00Z',
      acknowledgedAt: '2026-10-03T02:00:00Z',
    })
    expect(letterTrail(l).map(e => `${e.what} · ${e.who}`)).toEqual([
      'Uploaded · HR Manager', 'Sent to Revenue app · System', 'Opened in Revenue app · Zack', 'Acknowledged · Zack', 'Viewed · HR Manager',
    ])
  })

  it('flags who has no letter of a compulsory type, and counts them', () => {
    const letters = [letter({})]
    expect(missingFor('zack', letters, types)).toEqual([])
    expect(missingFor('chea', letters, types).map(t => t.name)).toEqual(['Offer letter'])
    expect(missingCount(types[0], people, letters)).toBe(2)
    expect(missingCount(types[1], people, letters)).toBe(0)
  })

  it('lists Data center’s people with their line, letter count and what is missing', () => {
    const rows = dataCenterPeople({ people, letters: [letter({})], letterTypes: types, departments: [{ id: REV, name: 'Revenue Department', people: 2 }, { id: HR, name: 'HR', people: 1 }] })
    expect(rows.map(r => [r.name, r.line, r.letters, r.missing])).toEqual([
      ['Chea Huan', 'Team Leader · Revenue', 0, 'Offer letter missing'],
      ['Zack', 'Senior Revenue Specialist · Revenue', 1, ''],
      ['Grace Lim', 'HR Manager · HR', 0, 'Offer letter missing'],
    ])
  })
})

describe('publish', () => {
  const departments = [{ id: REV, name: 'Revenue Department', people: 2 }, { id: HR, name: 'HR', people: 1 }]

  it('opens each picked department with its people, everybody ticked until unticked', () => {
    const groups = audienceGroups(departments, people, new Set([REV, HR]), new Set(['zack']))
    expect(groups.map(g => [g.department.id, g.all.length, g.picked.map(p => p.id)])).toEqual([[REV, 2, ['chea']], [HR, 1, ['grace']]])
    expect(audienceLabel(groups)).toBe('Revenue · Chea Huan  /  HR · everyone')
    expect(publishSummary(groups)).toBe('Goes to 2 people. Each one must tap Acknowledge in the Revenue app.')
    expect(publishSummary([])).toBe('Pick a department to choose who it goes to.')
  })

  it('refuses in the handoff’s order', () => {
    const all = audienceGroups(departments, people, new Set([REV]), new Set())
    const none = audienceGroups(departments, people, new Set([REV]), new Set(['chea', 'zack']))
    expect(publishRefusal({ title: '', body: 'x', hasFile: false, groups: all })).toBe('Add a title.')
    expect(publishRefusal({ title: 'T', body: 'x', hasFile: false, groups: none })).toBe('Tick at least one person.')
    expect(publishRefusal({ title: 'T', body: ' ', hasFile: false, groups: all })).toBe('Add a body or attach a file.')
    expect(publishRefusal({ title: 'T', body: '', hasFile: true, groups: [] })).toBe('Pick at least one department.')
    expect(publishRefusal({ title: 'T', body: '', hasFile: true, groups: all })).toBeNull()
  })

  it('says how many acknowledged, and what an older memo can', () => {
    const m = { id: 'p', kind: 'Memo', title: 'T', publishedAt: '', audience: 'Revenue · everyone', subDepartments: [], attachmentName: null, saved: false, recipients: 12, acknowledged: 9 }
    expect(ackLine(m)).toEqual({ line: '9 of 12 acknowledged', pct: 75 })
    expect(ackLine({ ...m, recipients: 0, acknowledged: 3 })).toEqual({ line: '3 acknowledged', pct: 0 })
    expect(publishedAudience({ ...m, audience: null, subDepartments: ['Fair', 'IR'] })).toBe('Fair, IR')
  })
})

describe('files', () => {
  it('knows the bucket’s kinds and its 25 MB', () => {
    expect(contentTypeOf('a.XLSX', '')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(contentTypeOf('scan.jpg', 'image/jpeg')).toBe('image/jpeg')
    expect(fileRefusal({ name: 'a.exe', size: 10 })).toMatch(/cannot be kept here/)
    expect(fileRefusal({ name: 'a.pdf', size: 26 * 1024 * 1024 })).toBe('That file is larger than 25 MB.')
    expect(fileRefusal({ name: 'a.pdf', size: 10 })).toBeNull()
  })

  it('names the object safely, under its folder', () => {
    expect(safeFileName('Offer letter (Zack) #1.pdf')).toBe('Offer_letter_Zack_1.pdf')
    expect(objectPath('documents', 'u1', 'Price list.xlsx')).toBe('documents/u1/Price_list.xlsx')
    expect(objectPath({ letterFor: 's1' }, 'u2', 'x.pdf')).toBe('letters/s1/u2/x.pdf')
    expect(objectPath('publish', 'u3', '../x.pdf')).toBe('publish/u3/x.pdf')
  })

  it('previews a PDF and a picture, nothing else', () => {
    expect(previewKind('a.pdf', null)).toBe('pdf')
    expect(previewKind('a.png', 'image/png')).toBe('image')
    expect(previewKind('a.heic', 'image/heic')).toBe('none')
    expect(previewKind('Price.xlsx', null)).toBe('none')
  })
})
