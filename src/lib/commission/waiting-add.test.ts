import { describe, expect, it } from 'vitest'
import {
  EMPTY_ADD,
  isDay,
  signedFormKind,
  signedFormRefusal,
  submitterGroups,
  waitingAddDetail,
  waitingAddInputFrom,
  waitingAddRefusal,
  type WaitingAddInput,
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

  it('is 3 MB or smaller, and not empty', () => {
    expect(signedFormRefusal({ size: 3 * 1024 * 1024 })).toBeNull()
    expect(signedFormRefusal({ size: 3 * 1024 * 1024 + 1 })).toBe('The signed form must be 3 MB or smaller.')
    expect(signedFormRefusal({ size: 0 })).toMatch(/empty/)
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
