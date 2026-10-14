import { describe, expect, it } from 'vitest'
import {
  BUILT_FORM_NAME,
  REPLACEMENT_BUILTIN_FIELDS,
  REPLACEMENT_FORM_NAME,
  addQuestion,
  applicationFormHtml,
  cleanedFields,
  formChanged,
  formFromRow,
  formMeta,
  moveQuestion,
  newQuestionId,
  templateContentType,
  templateObjectPath,
  templateRefusal,
  templateView,
  waitingFormRefusal,
  withOption,
  withType,
  withoutOption,
  wordPage,
  type WaitingField,
  type WaitingForm,
} from './waiting-form'

// v1 as mig 20261010140000 seeds it.
const BUILT_IN: WaitingField[] = [
  { id: 'newPerson', label: 'New member name', type: 'text', required: true, builtin: true, placeholder: 'Full name as per IC' },
  { id: 'contact', label: 'Phone number', type: 'phone', required: true, builtin: true, placeholder: 'e.g. 012-345 6789' },
  { id: 'target', label: 'Preferred sub-department', type: 'dropdown', required: true, builtin: true },
  { id: 'start', label: 'Preferred start date', type: 'date', required: true, builtin: true },
]
const V1: WaitingForm = { version: 1, fields: BUILT_IN, requireUpload: false, templatePath: null, templateName: BUILT_FORM_NAME, createdAt: '2026-10-10T14:00:00Z' }

describe('formFromRow', () => {
  it('reads member_waiting_form()', () => {
    const form = formFromRow({ version: 2, fields: [...BUILT_IN, { id: 'q_heard', label: 'Heard', type: 'dropdown', required: false, options: ['Referral', 7] }], requireUpload: true, templatePath: 'templates/a/x.pdf', templateName: 'x.pdf', createdAt: 't' })
    expect(form?.version).toBe(2)
    expect(form?.fields[4]).toEqual({ id: 'q_heard', label: 'Heard', type: 'dropdown', required: false, options: ['Referral'] })
    expect(form?.requireUpload).toBe(true)
    expect(form?.templatePath).toBe('templates/a/x.pdf')
  })

  it('refuses what is not a form, and names the built form when nothing was uploaded', () => {
    expect(formFromRow(null)).toBeNull()
    expect(formFromRow({ version: 0, fields: [] })).toBeNull()
    expect(formFromRow({ version: 1, fields: BUILT_IN, templatePath: '' })?.templateName).toBe(BUILT_FORM_NAME)
  })
})

describe('the questions', () => {
  it('adds an optional Text question at the end with an id of its own', () => {
    const next = addQuestion(BUILT_IN, 1000)
    expect(next).toHaveLength(5)
    expect(next[4]).toEqual({ id: 'qrs', label: 'New question', type: 'text', required: false })
    expect(newQuestionId([...next], 1000)).toBe('qrt')
  })

  it('moves one place, and nothing past either end', () => {
    expect(moveQuestion(BUILT_IN, 1, -1).map(f => f.id)).toEqual(['contact', 'newPerson', 'target', 'start'])
    expect(moveQuestion(BUILT_IN, 0, -1).map(f => f.id)).toEqual(['newPerson', 'contact', 'target', 'start'])
    expect(moveQuestion(BUILT_IN, 3, 1).map(f => f.id)).toEqual(['newPerson', 'contact', 'target', 'start'])
  })

  it('a dropdown starts with one option; a built-in keeps its kind', () => {
    const q: WaitingField = { id: 'q1', label: 'Heard', type: 'text', required: false }
    expect(withType(q, 'dropdown').options).toEqual(['Option 1'])
    expect(withType({ ...q, type: 'dropdown', options: ['A'] }, 'text').options).toEqual(['A'])
    expect(withType(BUILT_IN[0], 'date')).toBe(BUILT_IN[0])
  })

  it('adds an option once, trimmed, and removes one by place', () => {
    const q: WaitingField = { id: 'q1', label: 'Heard', type: 'dropdown', required: false, options: ['Referral'] }
    expect(withOption(q, '  Roadshow ').options).toEqual(['Referral', 'Roadshow'])
    expect(withOption(q, 'referral')).toBe(q)
    expect(withOption(q, '   ')).toBe(q)
    expect(withoutOption({ ...q, options: ['A', 'B', 'C'] }, 1).options).toEqual(['A', 'C'])
  })

  it('a save drops HR’s questions left without a label and trims the rest', () => {
    const fields = [...BUILT_IN, { id: 'q1', label: '  ', type: 'text' as const, required: false }, { id: 'q2', label: ' Own car ', type: 'yesno' as const, required: true }]
    expect(cleanedFields(fields).map(f => f.label)).toEqual(['New member name', 'Phone number', 'Preferred sub-department', 'Preferred start date', 'Own car'])
  })
})

describe('waitingFormRefusal — member_save_waiting_form’s checks', () => {
  it('lets v1 and HR’s own questions through', () => {
    expect(waitingFormRefusal(BUILT_IN)).toBeNull()
    expect(waitingFormRefusal([...BUILT_IN, { id: 'q1', label: 'Heard', type: 'dropdown', required: false, options: ['Referral', 'Roadshow'] }])).toBeNull()
  })

  it('keeps the four built-in questions, required, of their kind', () => {
    expect(waitingFormRefusal(BUILT_IN.slice(0, 3).concat({ id: 'q1', label: 'x', type: 'text', required: false }))).toBe('The four built-in questions cannot be removed')
    expect(waitingFormRefusal(BUILT_IN.map(f => (f.id === 'start' ? { ...f, type: 'text' as const } : f)))).toBe('The built-in questions stay required and keep their kind')
    expect(waitingFormRefusal(BUILT_IN.map(f => (f.id === 'contact' ? { ...f, required: false } : f)))).toBe('The built-in questions stay required and keep their kind')
    expect(waitingFormRefusal([...BUILT_IN, { id: 'q1', label: 'x', type: 'text', required: false, builtin: true }])).toBe('Only the four built-in questions are built in')
  })

  it('asks for labels, ids of their own and real dropdowns', () => {
    expect(waitingFormRefusal([...BUILT_IN, { id: 'q1', label: ' ', type: 'text', required: false }])).toBe('Every question needs a label of at most 120 characters')
    expect(waitingFormRefusal([...BUILT_IN, { id: 'start', label: 'Again', type: 'date', required: true, builtin: true }])).toBe('Every question needs its own id')
    expect(waitingFormRefusal([...BUILT_IN, { id: 'q1', label: 'Heard', type: 'dropdown', required: false, options: [] }])).toBe('“Heard” needs from 1 to 30 different options')
    expect(waitingFormRefusal([...BUILT_IN, { id: 'q1', label: 'Heard', type: 'dropdown', required: false, options: ['A', 'a'] }])).toBe('“Heard” needs from 1 to 30 different options')
    expect(waitingFormRefusal(BUILT_IN.slice(0, 3))).toBe('A form has from 4 to 40 questions')
  })
})

describe('the form as saved', () => {
  it('knows when the draft says something new', () => {
    expect(formChanged(V1, { fields: BUILT_IN, requireUpload: false, useBuiltForm: false })).toBe(false)
    expect(formChanged(V1, { fields: BUILT_IN, requireUpload: true, useBuiltForm: false })).toBe(true)
    expect(formChanged(V1, { fields: moveQuestion(BUILT_IN, 0, 1), requireUpload: false, useBuiltForm: false })).toBe(true)
    expect(formChanged({ ...V1, templatePath: 'templates/a/x.pdf' }, { fields: BUILT_IN, requireUpload: false, useBuiltForm: true })).toBe(true)
  })

  it('says how many fields, which version and whether the signed form is required', () => {
    expect(formMeta(V1)).toBe('4 fields · form v1')
    expect(formMeta({ ...V1, version: 3, requireUpload: true })).toBe('4 fields · form v3 · signed form required')
  })
})

describe('Upload form', () => {
  it('takes what the bucket takes, under the Server Action’s limit', () => {
    expect(templateContentType('Form.DOCX')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(templateContentType('scan.webp')).toBeNull()
    expect(templateRefusal({ name: 'form.pdf', size: 120_000 })).toBeNull()
    expect(templateRefusal({ name: 'form.gif', size: 10 })).toBe('Upload a PDF, Word, HTML, PNG or JPEG file.')
    expect(templateRefusal({ name: 'form.pdf', size: 4_000_000 })).toBe('The form must be smaller than 3.8 MB.')
    expect(templateRefusal({ name: 'form.pdf', size: 0 })).toBe('Choose a file to upload.')
  })

  it('files each upload in a folder of its own under templates/', () => {
    expect(templateObjectPath('HOUZS Waiting list (v2).pdf', 'abc')).toBe('templates/abc/HOUZS Waiting list -v2-.pdf')
    expect(templateObjectPath('../../etc', 'abc')).toBe('templates/abc/etc')
  })
})

// View, on the uploaded form's right-click menu (2026-10-14).
describe('View — how HR’s file is drawn', () => {
  it('draws every kind the bucket takes, and says an old .doc cannot be', () => {
    expect(templateView('Form.PDF')).toBe('pdf')
    expect(templateView('scan.png')).toBe('image')
    expect(templateView('scan.JPG')).toBe('image')
    expect(templateView('scan.jpeg')).toBe('image')
    expect(templateView('Revenue_Team_Waiting_List_Form_04.09.2026 (2).docx')).toBe('word')
    expect(templateView('form.html')).toBe('html')
    expect(templateView('form.doc')).toBe('none')
    expect(templateView('form')).toBe('none')
  })

  it('puts a Word file’s words on a white page, its title escaped', () => {
    const page = wordPage('<p>REVENUE TEAM WAITING LIST FORM</p><table><tr><td>Name</td></tr></table>', 'A & B <form>.docx')
    expect(page).toMatch(/^<!doctype html>/)
    expect(page).toContain('<title>A &amp; B &lt;form&gt;.docx</title>')
    expect(page).toContain('<body><p>REVENUE TEAM WAITING LIST FORM</p><table><tr><td>Name</td></tr></table></body>')
    expect(page).toContain('td,th{border:1px solid rgb(0 0 0)')
  })
})

// Round 2's README 18.5 (2026-10-11): the Replacement list's own form — member_save_replacement_form's checks.
describe('the replacement form', () => {
  const R = [...REPLACEMENT_BUILTIN_FIELDS]

  it('lets v1 — the five built-ins and HR’s Handover done? — through', () => {
    expect(waitingFormRefusal([...R, { id: 'q_handover', label: 'Handover done?', type: 'yesno', required: false }], 'replacement')).toBeNull()
  })

  it('keeps the five built-ins — Reason too — required, of their kind', () => {
    expect(waitingFormRefusal(R.filter(f => f.id !== 'reason').concat({ id: 'q1', label: 'x', type: 'text', required: false }), 'replacement'))
      .toBe('The five built-in questions cannot be removed')
    expect(waitingFormRefusal(R.map(f => (f.id === 'reason' ? { ...f, required: false } : f)), 'replacement')).toBe('The built-in questions stay required and keep their kind')
    expect(waitingFormRefusal([...R, { id: 'q1', label: 'x', type: 'text', required: false, builtin: true }], 'replacement')).toBe('Only the five built-in questions are built in')
    expect(waitingFormRefusal(R.slice(0, 4), 'replacement')).toBe('A form has from 5 to 40 questions')
    // The waiting list's built-ins are not the replacement's.
    expect(waitingFormRefusal(BUILT_IN, 'replacement')).toBe('A form has from 5 to 40 questions')
  })

  it('reads member_replacement_form(), named after the replacement form when nothing was uploaded', () => {
    expect(formFromRow({ version: 1, fields: R, requireUpload: false, templatePath: null, templateName: '' }, 'replacement')?.templateName).toBe(REPLACEMENT_FORM_NAME)
  })

  it('builds its own black-and-white form: a line for the member leaving, boxes for the arrangement', () => {
    const html = applicationFormHtml({ version: 2, fields: R, templateName: REPLACEMENT_FORM_NAME }, 'Fair', ['Fair', 'IR'], 'replacement')
    expect(html).toContain('<h1>HOUZS Venture · Replacement form</h1>')
    expect(html).toContain('Member leaving *</div><div class="line"></div>')
    expect(html).toContain('<span>&#9744; Leave the company</span>')
    expect(html).toContain('<span>&#9744; Release the position</span>')
    expect(html).toContain('Member leaving — signature')
    expect(html).not.toContain('&#9744; Fair')
  })
})

describe('applicationFormHtml — the black-and-white form', () => {
  it('lists every question in order, a box per option, the sub-departments for the built-in one', () => {
    const html = applicationFormHtml(
      { ...V1, fields: [...BUILT_IN, { id: 'q1', label: 'Own <car>', type: 'yesno', required: false }] },
      'Fair',
      ['Fair', 'IR'],
    )
    expect(html).toContain('<title>HOUZS Revenue - Waiting list application.html</title>')
    expect(html).toContain('Revenue Department · Fair · Form v1')
    expect(html).toContain('New member name *')
    expect(html).toContain('<span>&#9744; Fair</span><span>&#9744; IR</span>')
    expect(html).toContain('Own &lt;car&gt;</div><div class="opts"><span>&#9744; Yes</span><span>&#9744; No</span>')
    expect(html.indexOf('New member name')).toBeLessThan(html.indexOf('Preferred start date'))
  })

  // 2026-10-14, the user: some are ready any time — the paper offers it beside the date.
  it('offers Any time ready beside the start date — the waiting list’s only', () => {
    const html = applicationFormHtml({ ...V1, fields: [...BUILT_IN] }, 'Fair', ['Fair', 'IR'])
    expect(html).toMatch(/Preferred start date \*<\/div><div class="when"><div class="line short">.*<\/div><span>&#9744; Any time ready<\/span><\/div>/)
    expect(html.match(/Any time ready/g)).toHaveLength(1)
    const replacement = applicationFormHtml({ version: 1, fields: [...REPLACEMENT_BUILTIN_FIELDS], templateName: REPLACEMENT_FORM_NAME }, 'Fair', ['Fair', 'IR'], 'replacement')
    expect(replacement).not.toContain('Any time ready')
  })
})
