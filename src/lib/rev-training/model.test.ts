import { describe, expect, it } from 'vitest'
import {
  answeredCount, changeKind, draftProblem, emptyQuestion, itemBadge, libFileRefusal, libPath, libraryFromRows, libraryUnseen, markSeen,
  percent, pick, removeChoice, resultFromRow, safeLink, scoreText, takeFromRow, testsFromRows, toggleCorrect, type DraftTest,
} from './model'

// 2026-11-16 — the Revenue app's Free test and Library (mig 20261117010000).

describe('picking answers', () => {
  it('one answer and true / false swap; several toggle, in order', () => {
    expect(pick('single', [1], 2)).toEqual([2])
    expect(pick('truefalse', [], 1)).toEqual([1])
    expect(pick('multiple', [3], 1)).toEqual([1, 3])
    expect(pick('multiple', [1, 3], 3)).toEqual([1])
  })
  it('counts the questions answered', () => {
    const test = { id: 't', title: '', intro: '', questions: [{ id: 'a', kind: 'single' as const, prompt: '', choices: [] }, { id: 'b', kind: 'single' as const, prompt: '', choices: [] }] }
    expect(answeredCount({ a: [0], b: [] }, test)).toBe(1)
  })
})

describe('writing a test', () => {
  const good: DraftTest = { title: 'Mattress basics', intro: '', published: true, questions: [
    { kind: 'single', prompt: 'Q', choices: ['A', 'B'], correct: [0], explain: '' },
    { kind: 'multiple', prompt: 'Q', choices: ['A', 'B', 'C'], correct: [0, 2], explain: '' },
    { kind: 'truefalse', prompt: 'Q', choices: ['True', 'False'], correct: [1], explain: '' },
  ] }
  it('says what stops a save, in the database\'s words', () => {
    expect(draftProblem(good)).toBeNull()
    expect(draftProblem({ ...good, title: ' ' })).toBe('Give the test a title.')
    expect(draftProblem({ ...good, questions: [] })).toBe('Add at least one question.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], prompt: '' }] })).toBe('Question 1: write the question.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], choices: ['A', ' '] }] })).toBe('Question 1: fill in every answer, or remove the empty one.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], choices: ['A'], correct: [0] }] })).toBe('Question 1: give 2 to 8 answers to pick from.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], correct: [] }] })).toBe('Question 1: mark the right answer.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], correct: [0, 1] }] })).toMatch(/only one answer can be right/)
  })
  it('a fresh question of each type', () => {
    expect(emptyQuestion().choices).toEqual(['', '', ''])
    expect(emptyQuestion('truefalse').choices).toEqual(['True', 'False'])
  })
  it('changes type keeping what fits', () => {
    const q = { kind: 'multiple' as const, prompt: 'Q', choices: ['A', 'B', 'C'], correct: [0, 2], explain: '' }
    expect(changeKind(q, 'single').correct).toEqual([0])
    expect(changeKind(q, 'truefalse')).toMatchObject({ choices: ['True', 'False'], correct: [] })
    expect(changeKind(changeKind(q, 'truefalse'), 'single').choices).toEqual(['', '', ''])
  })
  it('marks right answers and removes a choice without losing them', () => {
    const q = { kind: 'single' as const, prompt: 'Q', choices: ['A', 'B', 'C'], correct: [2], explain: '' }
    expect(toggleCorrect(q, 1).correct).toEqual([1])
    expect(removeChoice(q, 0)).toMatchObject({ choices: ['B', 'C'], correct: [1] })
    expect(removeChoice(q, 2).correct).toEqual([])
  })
})

describe('reading the database', () => {
  it('a test never carries its answers to the taker', () => {
    const take = takeFromRow({ id: 't', title: 'T', intro: '', questions: [{ id: 'q', kind: 'truefalse', prompt: 'P', choices: ['True', 'False'], correct: [1] }] })
    expect(take?.questions[0]).toEqual({ id: 'q', kind: 'truefalse', prompt: 'P', choices: ['True', 'False'] })
  })
  it('one\'s own scores; a test never taken reads a dash', () => {
    const [a] = testsFromRows([{ id: 't', title: 'T', questions: 5, attempts: 2, best: 4, last: 3, lastTotal: 5 }])
    expect([scoreText(a.best, a.lastTotal), scoreText(a.last, a.lastTotal)]).toEqual(['4 / 5', '3 / 5'])
    expect(scoreText(null, null)).toBe('—')
    expect(percent(4, 5)).toBe(80)
  })
  it('a hand-in\'s review', () => {
    const r = resultFromRow({ score: 1, total: 2, saved: true, review: [{ id: 'q', chosen: [0], correct: [1], right: false, explain: 'x' }] })
    expect(r).toEqual({ score: 1, total: 2, saved: true, review: [{ id: 'q', chosen: [0], correct: [1], right: false, explain: 'x' }] })
    expect(resultFromRow({})).toBeNull()
  })
})

describe('the Library', () => {
  const lib = libraryFromRows([
    { id: 'c1', name: 'Product', items: [{ id: 'i1', title: 'Price list', kind: 'file', fileName: 'price.pdf', seen: false }, { id: 'i2', title: 'Tour', kind: 'link', url: 'https://youtu.be/x', seen: true }] },
    { id: 'c2', name: 'Rules', items: [{ id: 'i3', title: 'Handbook', kind: 'file', fileName: 'h.docx', seen: false }] },
  ])
  it('counts what is still New, and an open takes it off', () => {
    expect(libraryUnseen(lib)).toBe(2)
    expect(libraryUnseen(markSeen(lib, 'i1'))).toBe(1)
    expect(libraryUnseen(null)).toBe(0)
  })
  it('badges a row by its file or its link', () => {
    expect(lib[0].items.map(itemBadge)).toEqual(['PDF', 'VIDEO'])
    expect(itemBadge({ kind: 'link', fileName: null, url: 'https://drive.google.com/x' })).toBe('LINK')
  })
  it('takes PDF, Office, pictures and videos up to 2 GB; anything else is a link', () => {
    expect(libFileRefusal({ name: 'a.pdf', size: 10 })).toBeNull()
    expect(libFileRefusal({ name: 'a.DOCX', size: 10 })).toBeNull()
    expect(libFileRefusal({ name: 'a.exe', size: 10 })).toMatch(/paste a link/)
    expect(libFileRefusal({ name: 'a.mp4', size: 3 * 1024 ** 3 })).toMatch(/2 GB/)
  })
  it('a path the database takes: library/<id>/<safe name>', () => {
    const p = libPath('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', 'Price list (Nov).pdf')
    expect(p).toBe('library/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/Price_list_Nov_.pdf')
    expect(p).toMatch(/^library\/[0-9a-f-]{36}\/[^/]+$/)
  })
  it('opens only an http(s) link', () => {
    expect(safeLink('https://youtu.be/x')).toBe('https://youtu.be/x')
    expect(safeLink('javascript:alert(1)')).toBeNull()
  })
})
