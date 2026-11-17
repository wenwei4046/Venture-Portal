import { describe, expect, it } from 'vitest'
import {
  answered, answeredCount, attemptFromRow, changeKind, draftProblem, emptyQuestion, itemBadge, libFileRefusal, libPath, libraryFromRows,
  libraryUnseen, markSeen, marksProblem, percent, pick, pointsText, removeChoice, resultFromRow, safeLink, scoreText, takeFromRow,
  testsFromRows, toggleCorrect, waitingPoints, type DraftTest, type ReviewItem,
} from './model'

// 2026-11-16 — the Revenue app's Free test and Library (mig 20261117010000); 2026-11-17 — points per question and
// written answers marked by hand.

describe('picking and writing answers', () => {
  it('one answer and true / false swap; several toggle, in order', () => {
    expect(pick('single', [1], 2)).toEqual([2])
    expect(pick('truefalse', [], 1)).toEqual([1])
    expect(pick('multiple', [3], 1)).toEqual([1, 3])
    expect(pick('multiple', [1, 3], 3)).toEqual([1])
  })
  it('counts a question answered by a choice or by words, never by blanks', () => {
    const q = (id: string, kind: 'single' | 'short') => ({ id, kind, prompt: '', choices: [], points: 1 })
    const test = { id: 't', title: '', intro: '', questions: [q('a', 'single'), q('b', 'single'), q('c', 'short'), q('d', 'short')] }
    expect(answeredCount({ a: [0], b: [], c: 'latex', d: '   ' }, test)).toBe(2)
    expect(answered(undefined)).toBe(false)
  })
})

describe('writing a test', () => {
  const good: DraftTest = { title: 'Mattress basics', intro: '', published: true, questions: [
    { kind: 'single', prompt: 'Q', choices: ['A', 'B'], correct: [0], points: 2, explain: '' },
    { kind: 'multiple', prompt: 'Q', choices: ['A', 'B', 'C'], correct: [0, 2], points: 1, explain: '' },
    { kind: 'truefalse', prompt: 'Q', choices: ['True', 'False'], correct: [1], points: 1, explain: '' },
    { kind: 'short', prompt: 'Q', choices: [], correct: [], points: 3, explain: '' },
    { kind: 'paragraph', prompt: 'Q', choices: [], correct: [], points: 10, explain: '' },
  ] }
  it('says what stops a save, in the database\'s words', () => {
    expect(draftProblem(good)).toBeNull()
    expect(draftProblem({ ...good, title: ' ' })).toBe('Give the test a title.')
    expect(draftProblem({ ...good, questions: [] })).toBe('Add at least one question.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], prompt: '' }] })).toBe('Question 1: write the question.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], points: 0 }] })).toBe('Question 1: give it 1 to 100 points.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], points: Number.NaN }] })).toBe('Question 1: give it 1 to 100 points.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], points: 101 }] })).toBe('Question 1: give it 1 to 100 points.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], choices: ['A', ' '] }] })).toBe('Question 1: fill in every answer, or remove the empty one.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], choices: ['A'], correct: [0] }] })).toBe('Question 1: give 2 to 8 answers to pick from.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], correct: [] }] })).toBe('Question 1: mark the right answer.')
    expect(draftProblem({ ...good, questions: [{ ...good.questions[0], correct: [0, 1] }] })).toMatch(/only one answer can be right/)
  })
  it('a fresh question of each type, with the points it is given', () => {
    expect(emptyQuestion().choices).toEqual(['', '', ''])
    expect(emptyQuestion('truefalse').choices).toEqual(['True', 'False'])
    expect(emptyQuestion('paragraph', 5)).toMatchObject({ choices: [], correct: [], points: 5 })
  })
  it('changes type keeping what fits', () => {
    const q = { kind: 'multiple' as const, prompt: 'Q', choices: ['A', 'B', 'C'], correct: [0, 2], points: 2, explain: '' }
    expect(changeKind(q, 'single').correct).toEqual([0])
    expect(changeKind(q, 'truefalse')).toMatchObject({ choices: ['True', 'False'], correct: [] })
    expect(changeKind(changeKind(q, 'truefalse'), 'single').choices).toEqual(['', '', ''])
    expect(changeKind(q, 'short')).toMatchObject({ kind: 'short', choices: [], correct: [], points: 2 })
    expect(changeKind(changeKind(q, 'paragraph'), 'multiple').choices).toEqual(['', '', ''])
  })
  it('marks right answers and removes a choice without losing them', () => {
    const q = { kind: 'single' as const, prompt: 'Q', choices: ['A', 'B', 'C'], correct: [2], points: 1, explain: '' }
    expect(toggleCorrect(q, 1).correct).toEqual([1])
    expect(removeChoice(q, 0)).toMatchObject({ choices: ['B', 'C'], correct: [1] })
    expect(removeChoice(q, 2).correct).toEqual([])
  })
})

describe('reading the database', () => {
  it('a test never carries its answers to the taker — only its points', () => {
    const take = takeFromRow({ id: 't', title: 'T', intro: '', questions: [{ id: 'q', kind: 'truefalse', prompt: 'P', choices: ['True', 'False'], correct: [1], points: 3 }] })
    expect(take?.questions[0]).toEqual({ id: 'q', kind: 'truefalse', prompt: 'P', choices: ['True', 'False'], points: 3 })
  })
  it('one\'s own scores: the best marked one, the last waiting or not', () => {
    const [a] = testsFromRows([{ id: 't', title: 'T', questions: 5, points: 12, written: true, attempts: 2, best: 9, bestTotal: 12, last: 4, lastTotal: 12, lastPending: true, lastId: 'a1' }])
    expect([a.points, a.written, scoreText(a.best, a.bestTotal), a.lastPending, a.lastId]).toEqual([12, true, '9 / 12', true, 'a1'])
    expect(scoreText(null, null)).toBe('—')
    expect(percent(9, 12)).toBe(75)
    expect([pointsText(1), pointsText(5)]).toEqual(['1 point', '5 points'])
  })
  it('a hand-in\'s review, written answers waiting', () => {
    const r = resultFromRow({ attemptId: 'a1', score: 2, total: 7, pending: true, saved: true, review: [
      { id: 'q1', kind: 'single', chosen: [0], correct: [0], right: true, points: 2, awarded: 2, pending: false, explain: 'x' },
      { id: 'q2', kind: 'paragraph', text: 'Because…', points: 5, awarded: null, pending: true, comment: '' },
    ] })
    expect(r?.review.map(x => [x.kind, x.awarded, x.pending, x.text])).toEqual([['single', 2, false, ''], ['paragraph', null, true, 'Because…']])
    expect(waitingPoints(r!.review)).toBe(5)
    expect(resultFromRow({})).toBeNull()
  })
  it('an attempt as kept: the test as taken, the marks and who gave them', () => {
    const a = attemptFromRow({ id: 'a1', testId: 't', title: 'T', name: 'ANN', at: '2026-11-17T01:00:00Z', score: 6, total: 7, pending: false,
      markedByName: 'PETER NG', questions: [{ id: 'q2', kind: 'paragraph', prompt: 'Why?', choices: [], points: 5 }],
      review: [{ id: 'q2', kind: 'paragraph', text: 'Because…', points: 5, awarded: 4, comment: 'Good', pending: false }] })
    expect([a?.score, a?.markedByName, a?.questions[0].points, a?.review[0].awarded, a?.review[0].comment]).toEqual([6, 'PETER NG', 5, 4, 'Good'])
  })
})

describe('marking written answers', () => {
  const r = (id: string, kind: ReviewItem['kind'], text: string, points: number): ReviewItem =>
    ({ id, kind, chosen: [], correct: [], right: false, text, points, awarded: null, comment: '', pending: text !== '', explain: '' })
  const review = [r('a', 'short', 'Latex', 3), r('b', 'paragraph', 'Because…', 5), r('c', 'short', '', 2), r('d', 'single', '', 1)]
  it('every written answer its points, 0 to its question\'s; a blank one and a choice question need none', () => {
    expect(marksProblem(review, { a: { points: '3', comment: '' }, b: { points: '0', comment: '' } })).toBeNull()
    expect(marksProblem(review, { a: { points: '3', comment: '' } })).toBe('Give every written answer its points.')
    expect(marksProblem(review, { a: { points: '', comment: 'x' }, b: { points: '1', comment: '' } })).toBe('Give every written answer its points.')
    expect(marksProblem(review, { a: { points: '4', comment: '' }, b: { points: '1', comment: '' } })).toBe('A written answer gets at most its question\'s 3 points.')
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
  it('takes PDF, Office, CSV, pictures and videos up to 2 GB; anything else is a link', () => {
    expect(libFileRefusal({ name: 'a.pdf', size: 10 })).toBeNull()
    expect(libFileRefusal({ name: 'a.DOCX', size: 10 })).toBeNull()
    expect(libFileRefusal({ name: 'sales.csv', size: 10 })).toBeNull()
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
