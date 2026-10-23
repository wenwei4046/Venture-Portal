import { describe, expect, it } from 'vitest'
import {
  EMPTY_ADD,
  SIGNED_FORM_ACCEPT,
  WORD_DOC,
  WORD_DOCX,
  isDay,
  letterFile,
  letterKind,
  signedFormKind,
  signedFormRefusal,
  submitterGroups,
  waitingAddDetail,
  waitingAddInputFrom,
  waitingAddRefusal,
  waitingEditChanges,
  waitingEditChangesFrom,
  waitingEditPayload,
  waitingEditRefusal,
  type WaitingAddInput,
  type WaitingEditDraft,
} from './waiting-add'
import type { WaitingForm } from './waiting-form'

// Sales Groups › Waiting list's "+" (2026-10-11, the user): somebody straight
// onto the list. The user's answers: Submitted by is always the Revenue team;
// only name, phone and joining date are asked, HR's own questions may stay
// blank; the signed form follows Form settings.

const SUB = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const STAFF = '61b4c495-6b7d-442d-a391-31fe4cbe2d6a'
const input = (over: Partial<WaitingAddInput> = {}): WaitingAddInput => ({
  ...EMPTY_ADD,
  subDepartmentId: SUB,
  name: 'Daniel Lee',
  contact: '016-221 0457',
  start: '2026-11-02',
  submittedBy: STAFF,
  ...over,
})
const FORM: Pick<WaitingForm, 'fields' | 'version' | 'requireUpload'> = {
  version: 3,
  requireUpload: false,
  fields: [
    { id: 'newPerson', label: 'New member name', type: 'text', required: true, builtin: true },
    { id: 'contact', label: 'Phone number', type: 'phone', required: true, builtin: true },
    { id: 'target', label: 'Preferred sub-department', type: 'dropdown', required: true, builtin: true },
    { id: 'start', label: 'Preferred start date', type: 'date', required: true, builtin: true },
    { id: 'ic', label: 'IC number', type: 'text', required: true },
    { id: 'transport', label: 'Has own transport', type: 'yesno', required: false },
  ],
}

describe('reading what the window sent', () => {
  it('keeps strings where strings belong and nothing else', () => {
    expect(waitingAddInputFrom({ subDepartmentId: SUB, name: 'Daniel', contact: 7, start: '2026-11-02', submittedBy: STAFF, answers: { ic: '900101', x: 3 } })).toEqual({
      subDepartmentId: SUB, name: 'Daniel', contact: '', start: '2026-11-02', submittedBy: STAFF, answers: { ic: '900101' },
    })
    expect(waitingAddInputFrom(null)).toBeNull()
    expect(waitingAddInputFrom([1])).toBeNull()
    expect(waitingAddInputFrom('x')).toBeNull()
  })

  it('knows a day the calendar has', () => {
    expect([isDay('2026-11-02'), isDay('2026-02-30'), isDay('2/11/2026'), isDay('')]).toEqual([true, false, false, false])
  })
})

describe('what stops an add', () => {
  it('names every blank field in the window’s order, the way the member form does', () => {
    expect(waitingAddRefusal(input({ name: ' ', contact: '', submittedBy: '' }), FORM, false)).toBe('Fill in new member name, phone number, submitted by.')
    expect(waitingAddRefusal(input({ start: '' }), FORM, false)).toBe('Fill in joining date.')
  })

  it('asks for a real day, real ids and short answers', () => {
    expect(waitingAddRefusal(input({ start: '2026-02-30' }), FORM, false)).toBe('Pick the joining date.')
    expect(waitingAddRefusal(input({ submittedBy: 'ADRIAN' }), FORM, false)).toBe('Reload the page and try again.')
    expect(waitingAddRefusal(input({ subDepartmentId: 'fair' }), FORM, false)).toBe('Reload the page and try again.')
    expect(waitingAddRefusal(input({ answers: { ic: 'x'.repeat(501) } }), FORM, false)).toMatch(/too long/)
    expect(waitingAddRefusal(input({ name: 'x'.repeat(161) }), FORM, false)).toMatch(/160/)
  })

  it('lets HR’s own questions stay blank — a required one too', () => {
    expect(waitingAddRefusal(input(), FORM, false)).toBeNull()
  })

  // 2026-10-14, the user: some are ready any time — "just wait us to let them join".
  it('takes Any time ready for the joining date, and sends it as it is', () => {
    expect(waitingAddRefusal(input({ start: 'anytime' }), FORM, false)).toBeNull()
    expect(waitingAddRefusal(input({ start: 'whenever' }), FORM, false)).toBe('Pick the joining date.')
    expect(waitingAddDetail(input({ start: 'anytime' }), FORM, null).start).toBe('anytime')
  })

  it('asks for the signed form once Form settings does, and only then', () => {
    expect(waitingAddRefusal(input(), { ...FORM, requireUpload: true }, false)).toBe('Upload the signed application form — Form settings asks for it.')
    expect(waitingAddRefusal(input(), { ...FORM, requireUpload: true }, true)).toBeNull()
    expect(waitingAddRefusal(input(), null, false)).toBeNull()
  })
})

describe('the request’s detail', () => {
  it('carries the built-ins trimmed, every own question with the form’s label, the version and the signed form', () => {
    const detail = waitingAddDetail(
      input({ name: ' Daniel Lee ', contact: ' 016-221 0457 ', answers: { transport: 'Yes', ic: ' 900101-01-1234 ', forged: 'x' } }),
      FORM,
      { name: 'Daniel signed.pdf', hash: 'a'.repeat(64) },
    )
    expect(detail).toEqual({
      newPerson: 'Daniel Lee',
      contact: '016-221 0457',
      start: '2026-11-02',
      answers: [
        { id: 'ic', label: 'IC number', value: '900101-01-1234' },
        { id: 'transport', label: 'Has own transport', value: 'Yes' },
      ],
      formVersion: 3,
      signedFormName: 'Daniel signed.pdf',
      signedFormHash: 'a'.repeat(64),
    })
  })

  it('sends blank answers as blank, and no form or version when there is none', () => {
    expect(waitingAddDetail(input(), FORM, null).answers).toEqual([
      { id: 'ic', label: 'IC number', value: '' },
      { id: 'transport', label: 'Has own transport', value: '' },
    ])
    expect(waitingAddDetail(input(), null, null)).toEqual({ newPerson: 'Daniel Lee', contact: '016-221 0457', start: '2026-11-02', answers: [] })
  })
})

describe('the signed application form', () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, 0, 0, 0, 0, 0, 0])

  it('is a PDF, PNG or JPG by its first bytes, whatever its name says', () => {
    expect(signedFormKind(bytes(37, 80, 68, 70, 45), 'application/pdf')).toEqual({ mime: 'application/pdf', extension: 'pdf' })
    expect(signedFormKind(bytes(137, 80, 78, 71, 13, 10, 26, 10), '')).toEqual({ mime: 'image/png', extension: 'png' })
    expect(signedFormKind(bytes(255, 216, 255), 'image/jpeg')).toEqual({ mime: 'image/jpeg', extension: 'jpg' })
    expect(signedFormKind(bytes(80, 75, 3, 4), 'application/pdf')).toBeNull()
    // A type the browser declared must agree with the bytes.
    expect(signedFormKind(bytes(37, 80, 68, 70, 45), 'image/png')).toBeNull()
  })

  it('is 100 MB or smaller (sent ahead of its action since 2026-10-23), and not empty', () => {
    expect(signedFormRefusal({ size: 3 * 1024 * 1024 + 1 })).toBeNull()
    expect(signedFormRefusal({ size: 100 * 1024 * 1024 })).toBeNull()
    expect(signedFormRefusal({ size: 100 * 1024 * 1024 + 1 })).toBe('The signed form must be 100 MB or smaller.')
    expect(signedFormRefusal({ size: 0 })).toMatch(/empty/)
  })
})

// 2026-10-20, the user: "want word file as well" — HR's uploads ("+" and the waiting drawer) take a Word file too.
describe('the signed form HR attaches — a Word file too', () => {
  const ascii = (s: string) => Array.from(s, c => c.charCodeAt(0))
  const utf16 = (s: string) => Array.from(s).flatMap(c => [c.charCodeAt(0), 0])
  const file = (...parts: number[][]) => new Uint8Array(parts.flat())
  const ZIP = [0x50, 0x4b, 0x03, 0x04, 20, 0, 6, 0]
  const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]
  const docx = file(ZIP, ascii('[Content_Types].xml'), [1, 2, 3], ascii('word/document.xml'), [9, 9])
  const doc = file(OLE, [0, 0, 0], utf16('Root Entry'), [0, 0], utf16('WordDocument'), [0, 0], utf16('1Table'))

  it('knows a .docx by the ZIP holding word/document.xml, and an old .doc by its WordDocument stream', () => {
    expect(letterKind(docx, '')).toEqual({ mime: WORD_DOCX, extension: 'docx' })
    expect(letterKind(doc, '')).toEqual({ mime: WORD_DOC, extension: 'doc' })
    // Browsers leave Word's type blank, or say what they please: the bytes decide.
    expect(letterKind(docx, 'application/octet-stream')).toEqual({ mime: WORD_DOCX, extension: 'docx' })
    expect(letterKind(doc, 'application/msword')).toEqual({ mime: WORD_DOC, extension: 'doc' })
  })

  it('takes what the member app takes, as it takes it', () => {
    expect(letterKind(file([37, 80, 68, 70, 45, 0]), 'application/pdf')).toEqual({ mime: 'application/pdf', extension: 'pdf' })
    expect(letterKind(file([137, 80, 78, 71, 13, 10, 26, 10, 0]), '')).toEqual({ mime: 'image/png', extension: 'png' })
    expect(letterKind(file([37, 80, 68, 70, 45, 0]), 'image/png')).toBeNull()
  })

  it('is not any ZIP or OLE file: a spreadsheet, a slide deck, a plain archive', () => {
    expect(letterKind(file(ZIP, ascii('xl/workbook.xml')), '')).toBeNull()
    expect(letterKind(file(ZIP, ascii('ppt/presentation.xml')), '')).toBeNull()
    expect(letterKind(file(ZIP, ascii('photos/ic.jpg')), '')).toBeNull()
    expect(letterKind(file(OLE, utf16('Workbook')), '')).toBeNull()
    expect(letterKind(file(ascii('word/document.xml')), '')).toBeNull()
    expect(letterKind(file(ascii('<html><body>a letter</body></html>')), 'application/msword')).toBeNull()
  })

  it('refuses a Word file holding macros', () => {
    expect(letterKind(file(ZIP, ascii('word/document.xml'), ascii('word/vbaProject.bin')), '')).toBe('macros')
    expect(letterKind(file(OLE, utf16('WordDocument'), [0, 0], utf16('Macros'), [0, 0], utf16('_VBA_PROJECT')), '')).toBe('macros')
  })

  it('says why in words', () => {
    expect(letterFile(docx, '')).toEqual({ ok: true, kind: { mime: WORD_DOCX, extension: 'docx' } })
    expect(letterFile(file(ZIP, ascii('xl/workbook.xml')), '')).toEqual({ ok: false, reason: 'The signed form must be a PDF, Word, PNG or JPG file.' })
    expect(letterFile(file(ZIP, ascii('word/document.xml'), ascii('word/vbaProject.bin')), '')).toEqual({
      ok: false,
      reason: 'This Word file holds macros — save it as a plain Word document (.docx) or a PDF, then upload it.',
    })
  })

  it('offers Word in the file picker', () => {
    expect(SIGNED_FORM_ACCEPT.split(',')).toEqual(['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'])
  })
})

describe('Submitted by', () => {
  it('lists the Revenue team, this sub-department first, each person once, by name', () => {
    const groups = submitterGroups(
      [
        { name: 'IR', people: [{ staffId: 'alvin', name: 'ALVIN', titleName: 'Specialist' }, { staffId: 'both', name: 'BOTH', titleName: null }] },
        { name: 'Fair', people: [{ staffId: 'stanley', name: 'STANLEY', titleName: 'Team Leader' }, { staffId: 'both', name: 'BOTH' }, { staffId: 'adrian', name: 'ADRIAN', titleName: null }] },
        { name: 'Empty', people: [] },
      ],
      'Fair',
    )
    expect(groups).toEqual([
      { group: 'Fair', people: [{ id: 'adrian', name: 'ADRIAN', title: null }, { id: 'both', name: 'BOTH', title: null }, { id: 'stanley', name: 'STANLEY', title: 'Team Leader' }] },
      { group: 'IR', people: [{ id: 'alvin', name: 'ALVIN', title: 'Specialist' }] },
    ])
  })
})

describe('Submitted by — the whole department (2026-10-20)', () => {
  it('ends with everybody else in the department, under its name — a Revenue Director placed nowhere too', () => {
    const groups = submitterGroups(
      [
        { name: 'IR', people: [{ staffId: 'alvin', name: 'ALVIN', titleName: 'Revenue Specialist' }] },
        { name: 'Fair', people: [{ staffId: 'stanley', name: 'STANLEY', titleName: 'Team Leader' }] },
      ],
      'Fair',
      {
        name: 'Revenue Department',
        people: [
          { staffId: 'stanley', name: 'STANLEY', titleName: 'Team Leader' },
          { staffId: 'peter', name: 'PETER', titleName: 'Revenue Director' },
          { staffId: 'kris', name: 'KRIS', titleName: 'Revenue Director' },
          { staffId: 'alvin', name: 'ALVIN', titleName: 'Revenue Specialist' },
        ],
      },
    )
    expect(groups).toEqual([
      { group: 'Fair', people: [{ id: 'stanley', name: 'STANLEY', title: 'Team Leader' }] },
      { group: 'IR', people: [{ id: 'alvin', name: 'ALVIN', title: 'Revenue Specialist' }] },
      {
        group: 'Revenue Department',
        people: [
          { id: 'kris', name: 'KRIS', title: 'Revenue Director' },
          { id: 'peter', name: 'PETER', title: 'Revenue Director' },
        ],
      },
    ])
  })

  it('draws no department group when everybody in it is placed already, or the roster could not be read', () => {
    const fair = [{ name: 'Fair', people: [{ staffId: 'stanley', name: 'STANLEY' }] }]
    expect(submitterGroups(fair, 'Fair', { name: 'Revenue Department', people: [{ staffId: 'stanley', name: 'STANLEY' }] })).toEqual([
      { group: 'Fair', people: [{ id: 'stanley', name: 'STANLEY', title: null }] },
    ])
    expect(submitterGroups(fair, 'Fair', null)).toEqual(submitterGroups(fair, 'Fair'))
  })
})

describe('Edit, in the applicant’s drawer (2026-10-20)', () => {
  const was: WaitingEditDraft = { name: 'JOAN QUEK XIAO', contact: '018-776-0020', start: 'anytime', submittedBy: STAFF }
  const KRIS = '7b6f1f0e-2a8d-4b1a-9a52-5c8a1e2b3c4d'

  it('sends only what changed — a name or phone compared trimmed', () => {
    expect(waitingEditChanges(was, { ...was })).toEqual({})
    expect(waitingEditChanges(was, { ...was, name: '  JOAN QUEK XIAO ', contact: ' 018-776-0020' })).toEqual({})
    expect(waitingEditChanges(was, { ...was, contact: ' 018-776-0021 ', submittedBy: KRIS })).toEqual({ contact: '018-776-0021', submittedBy: KRIS })
    expect(waitingEditChanges(was, { ...was, start: '2026-12-01' })).toEqual({ start: '2026-12-01' })
  })

  it('refuses nothing changed, a blank field by its words, a long one, a day the calendar has not', () => {
    expect(waitingEditRefusal({})).toBe('Nothing has changed.')
    expect(waitingEditRefusal({ name: '', contact: ' ' })).toBe('Fill in new member name, mobile number.')
    expect(waitingEditRefusal({ name: 'x'.repeat(161) })).toBe('Keep the name under 160 characters.')
    expect(waitingEditRefusal({ contact: '0'.repeat(61) })).toBe('Keep the phone number under 60 characters.')
    expect(waitingEditRefusal({ start: '2026-02-30' })).toBe('Pick the joining date.')
    expect(waitingEditRefusal({ start: '' })).toBe('Pick the joining date.')
    expect(waitingEditRefusal({ submittedBy: 'KRIS' })).toBe('Reload the page and try again.')
    expect(waitingEditRefusal({ start: 'anytime', submittedBy: KRIS, name: 'JOAN QUEK' })).toBeNull()
  })

  it('reads on the server only the four fields, as strings', () => {
    expect(waitingEditChangesFrom({ name: ' JOAN ', note: 'x', staff_id: KRIS })).toEqual({ name: 'JOAN' })
    expect(waitingEditChangesFrom({ contact: 12 })).toBeNull()
    expect(waitingEditChangesFrom(['name'])).toBeNull()
    expect(waitingEditChangesFrom(null)).toBeNull()
    expect(waitingEditChangesFrom({})).toEqual({})
  })

  it('hands the database the request’s own words for each', () => {
    expect(waitingEditPayload({ name: 'JOAN', contact: '011', start: 'anytime', submittedBy: KRIS })).toEqual({
      newPerson: 'JOAN',
      contact: '011',
      start: 'anytime',
      staffId: KRIS,
    })
    expect(waitingEditPayload({ start: '2026-12-01' })).toEqual({ start: '2026-12-01' })
  })
})
