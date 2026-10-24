import { describe, expect, it } from 'vitest'
import {
  NEW_LETTER_TYPE,
  failedWords,
  filedWords,
  letterChoicesFromRow,
  lettersCount,
  lettersRefusal,
  lettersToFile,
  pendingLetter,
  startingLetters,
  suggestedLetterType,
  type LetterChoice,
} from './attach'

// Letters filed with an employment status (2026-10-24 — the user: "新员工进来的时候，他 put 那个 status，然后能够 attach 他的
// offer letter。当然包括 letter 的 type，当他一选了之后，就自动 attach 进 document data center 里面").

const TYPES: LetterChoice[] = [
  { id: 'offer', name: 'Offer letter', compulsory: true },
  { id: 'warn', name: 'Warning letter', compulsory: false },
  { id: 'cfs', name: 'Contract for Service', compulsory: false },
]
const file = (name: string, size = 10) => new File(['x'.repeat(size)], name, { type: 'application/pdf' })

describe('the letter types', () => {
  it('reads hr_letter_type_choices() and leaves out anything malformed', () => {
    expect(letterChoicesFromRow([
      { id: 'offer', name: 'Offer letter', compulsory: true },
      { id: 'warn', name: 'Warning letter', compulsory: false },
      { id: 'x', name: '  ' },
      { name: 'No id' },
      null,
    ])).toEqual([
      { id: 'offer', name: 'Offer letter', compulsory: true },
      { id: 'warn', name: 'Warning letter', compulsory: false },
    ])
    expect(letterChoicesFromRow(null)).toEqual([])
  })

  it('starts a new person on a row for each compulsory type, its file to choose', () => {
    const rows = startingLetters(TYPES)
    expect(rows.map(r => [r.typeId, r.file])).toEqual([['offer', null]])
    expect(new Set([...rows, pendingLetter()].map(r => r.key)).size).toBe(2)
  })

  it('suggests a type only when exactly one name says it', () => {
    expect(suggestedLetterType(TYPES, /contract/i)).toBe('cfs')
    expect(suggestedLetterType(TYPES, /agreement/i)).toBe('')
    expect(suggestedLetterType(TYPES, /letter/i)).toBe('')
  })
})

describe('what a form files', () => {
  it('files the rows with a file — a compulsory row left empty is not a letter', () => {
    const rows = [pendingLetter('offer'), { ...pendingLetter('warn'), file: file('warning.pdf') }]
    expect(lettersToFile(rows).map(r => r.typeId)).toEqual(['warn'])
    expect(lettersCount(rows)).toBe(1)
    expect(lettersRefusal(rows)).toBeNull()
  })

  it('asks for a type, or a new type’s name, for each file', () => {
    expect(lettersRefusal([{ ...pendingLetter(), file: file('offer.pdf') }])).toBe('Choose the letter type for offer.pdf.')
    expect(lettersRefusal([{ ...pendingLetter(NEW_LETTER_TYPE), newType: '  ', file: file('agreement.pdf') }])).toBe('Name the new letter type for agreement.pdf.')
    expect(lettersRefusal([{ ...pendingLetter(NEW_LETTER_TYPE), newType: 'Agreement letter', file: file('agreement.pdf') }])).toBeNull()
  })

  it('refuses a file the Data center would', () => {
    const exe = new File(['x'], 'setup.exe', { type: '' })
    expect(lettersRefusal([{ ...pendingLetter('offer'), file: exe }])).toBe('That kind of file cannot be kept here — a PDF, an Office file, an image, a video or a zip.')
  })
})

describe('what it says', () => {
  it('names the letter filed, or how many', () => {
    expect(filedWords(['Offer letter'], 'ANA LIM')).toBe("Offer letter filed to ANA LIM's record")
    expect(filedWords(['Offer letter', 'Agreement letter'], 'ANA LIM')).toBe("2 letters filed to ANA LIM's record")
    expect(filedWords([], 'ANA LIM')).toBeNull()
    expect(filedWords(['Offer letter'], ' ')).toBe('Offer letter filed to their record')
  })

  it('says each letter that was not filed, and why', () => {
    expect(failedWords([{ key: 'a', name: 'Offer letter', reason: 'The file did not arrive. Please upload it again.' }]))
      .toBe('Offer letter was not filed: The file did not arrive. Please upload it again.')
    expect(failedWords([])).toBeNull()
  })
})
