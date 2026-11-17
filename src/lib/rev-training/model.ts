/**
 * The Revenue app's Free test and Library (2026-11-16, mig 20261117010000) — the shapes the database answers and the
 * app draws, read defensively (a field the database leaves out is never trusted to be there). Pure: no React, no
 * Supabase. The owner's answers: IR only; the Principal and the Revenue Director write them; a test may be taken
 * again; one answer, several answers, true / false; the Library's files and links in categories, "New" until opened.
 */

export type QuestionKind = 'single' | 'multiple' | 'truefalse'

export const KIND_LABEL: Readonly<Record<QuestionKind, string>> = {
  single: 'One answer',
  multiple: 'Several answers',
  truefalse: 'True or false',
}

/** A test in the list one takes them from — with one's own scores. */
export interface TestSummary {
  id: string
  title: string
  intro: string
  /** False only for a writer's draft (members never see one). */
  published: boolean
  questions: number
  attempts: number
  best: number | null
  last: number | null
  lastTotal: number | null
  lastAt: string | null
}

/** A test handed out to be taken: its questions and choices, never which are right. */
export interface TestToTake {
  id: string
  title: string
  intro: string
  questions: { id: string; kind: QuestionKind; prompt: string; choices: string[] }[]
}

/** What a hand-in answers: the score, then question by question what was picked and what was right. */
export interface TestResult {
  score: number
  total: number
  /** False when the taker has no Revenue staff record (a writer trying it): scored, not kept. */
  saved: boolean
  review: { id: string; chosen: number[]; correct: number[]; right: boolean; explain: string }[]
}

/** A question as its writer edits it. */
export interface DraftQuestion {
  kind: QuestionKind
  prompt: string
  choices: string[]
  correct: number[]
  explain: string
}

export interface DraftTest {
  id?: string
  title: string
  intro: string
  published: boolean
  questions: DraftQuestion[]
}

/** The writers' list. */
export interface AdminTest {
  id: string
  title: string
  published: boolean
  questions: number
  people: number
  attempts: number
  byName: string
  updatedAt: string
}

/** One person's scores on a test, for its writers. */
export interface TestScoreRow {
  staffId: string
  name: string
  attempts: number
  best: number | null
  last: number | null
  total: number | null
  lastAt: string | null
}

export interface LibraryItem {
  id: string
  title: string
  kind: 'file' | 'link'
  path: string | null
  fileName: string | null
  mime: string
  size: number | null
  url: string | null
  note: string
  byName: string
  createdAt: string
  seen: boolean
}

export interface LibraryCategory {
  id: string
  name: string
  items: LibraryItem[]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const ints = (v: unknown): number[] => arr(v).map(num).filter((n): n is number => n !== null && Number.isInteger(n))
const kindOf = (v: unknown): QuestionKind => (v === 'multiple' || v === 'truefalse' ? v : 'single')

/** `rev_tests_mine()`. */
export function testsFromRows(data: unknown): TestSummary[] {
  return arr(data).map(obj).filter(r => str(r.id)).map(r => ({
    id: str(r.id), title: str(r.title), intro: str(r.intro), published: r.published !== false,
    questions: num(r.questions) ?? 0, attempts: num(r.attempts) ?? 0, best: num(r.best), last: num(r.last),
    lastTotal: num(r.lastTotal), lastAt: str(r.lastAt) || null,
  }))
}

/** `rev_test_take(id)`. */
export function takeFromRow(data: unknown): TestToTake | null {
  const r = obj(data)
  if (!str(r.id)) return null
  return {
    id: str(r.id), title: str(r.title), intro: str(r.intro),
    questions: arr(r.questions).map(obj).filter(q => str(q.id)).map(q => ({
      id: str(q.id), kind: kindOf(q.kind), prompt: str(q.prompt), choices: arr(q.choices).map(str),
    })),
  }
}

/** `rev_test_submit(id, answers)`. */
export function resultFromRow(data: unknown): TestResult | null {
  const r = obj(data)
  const total = num(r.total)
  if (total === null) return null
  return {
    score: num(r.score) ?? 0, total, saved: r.saved === true,
    review: arr(r.review).map(obj).map(x => ({ id: str(x.id), chosen: ints(x.chosen), correct: ints(x.correct), right: x.right === true, explain: str(x.explain) })),
  }
}

/** `rev_tests_admin()`. */
export function adminTestsFromRows(data: unknown): AdminTest[] {
  return arr(data).map(obj).filter(r => str(r.id)).map(r => ({
    id: str(r.id), title: str(r.title), published: r.published === true, questions: num(r.questions) ?? 0,
    people: num(r.people) ?? 0, attempts: num(r.attempts) ?? 0, byName: str(r.byName), updatedAt: str(r.updatedAt),
  }))
}

/** `rev_test_admin(id)`: the test as its editor holds it. */
export function draftFromRow(data: unknown): DraftTest | null {
  const r = obj(data)
  if (!str(r.id)) return null
  return {
    id: str(r.id), title: str(r.title), intro: str(r.intro), published: r.published === true,
    questions: arr(r.questions).map(obj).map(q => ({
      kind: kindOf(q.kind), prompt: str(q.prompt), choices: arr(q.choices).map(str), correct: ints(q.correct), explain: str(q.explain),
    })),
  }
}

/** `rev_test_results(id)`. */
export function scoresFromRows(data: unknown): TestScoreRow[] {
  return arr(data).map(obj).filter(r => str(r.staffId)).map(r => ({
    staffId: str(r.staffId), name: str(r.name), attempts: num(r.attempts) ?? 0, best: num(r.best), last: num(r.last),
    total: num(r.total), lastAt: str(r.lastAt) || null,
  }))
}

/** `rev_library()`. */
export function libraryFromRows(data: unknown): LibraryCategory[] {
  return arr(data).map(obj).filter(c => str(c.id)).map(c => ({
    id: str(c.id), name: str(c.name),
    items: arr(c.items).map(obj).filter(i => str(i.id)).map(i => ({
      id: str(i.id), title: str(i.title), kind: i.kind === 'link' ? 'link' as const : 'file' as const,
      path: str(i.path) || null, fileName: str(i.fileName) || null, mime: str(i.mime), size: num(i.size), url: str(i.url) || null,
      note: str(i.note), byName: str(i.byName), createdAt: str(i.createdAt), seen: i.seen === true,
    })),
  }))
}

/** How many of the Library's items the reader has not opened yet — Profile's row and the page's tabs. */
export function libraryUnseen(cats: readonly LibraryCategory[] | null): number {
  return cats ? cats.reduce((n, c) => n + c.items.filter(i => !i.seen).length, 0) : 0
}

/** The Library with one item opened. */
export function markSeen(cats: readonly LibraryCategory[], id: string): LibraryCategory[] {
  return cats.map(c => (c.items.some(i => i.id === id) ? { ...c, items: c.items.map(i => (i.id === id ? { ...i, seen: true } : i)) } : c))
}

/** A, B, C … for a choice. */
export const letter = (i: number): string => String.fromCharCode(65 + i)

/** "3 / 5" — or the dash when it has not been taken. */
export function scoreText(score: number | null, total: number | null): string {
  return score === null || total === null ? '—' : `${score} / ${total}`
}

/** A whole percentage of a score. */
export function percent(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 100) : 0
}

/** Pick or unpick a choice: one answer (and true / false) swaps; several toggles. */
export function pick(kind: QuestionKind, chosen: readonly number[], i: number): number[] {
  if (kind !== 'multiple') return [i]
  return chosen.includes(i) ? chosen.filter(x => x !== i) : [...chosen, i].sort((a, b) => a - b)
}

/** How many questions have an answer picked. */
export function answeredCount(answers: Readonly<Record<string, readonly number[]>>, test: TestToTake): number {
  return test.questions.filter(q => (answers[q.id]?.length ?? 0) > 0).length
}

/** A fresh question of a type. */
export function emptyQuestion(kind: QuestionKind = 'single'): DraftQuestion {
  return kind === 'truefalse'
    ? { kind, prompt: '', choices: ['True', 'False'], correct: [], explain: '' }
    : { kind, prompt: '', choices: ['', '', ''], correct: [], explain: '' }
}

/** A question moved to another type: its choices kept where they can be, its right answers trimmed to fit. */
export function changeKind(q: DraftQuestion, kind: QuestionKind): DraftQuestion {
  if (kind === q.kind) return q
  if (kind === 'truefalse') return { ...q, kind, choices: ['True', 'False'], correct: [] }
  const choices = q.kind === 'truefalse' ? ['', '', ''] : q.choices
  const correct = q.kind === 'truefalse' ? [] : kind === 'single' ? q.correct.slice(0, 1) : q.correct
  return { ...q, kind, choices, correct }
}

/** Mark a choice right (one answer: the only right one; several: toggled). */
export function toggleCorrect(q: DraftQuestion, i: number): DraftQuestion {
  return { ...q, correct: pick(q.kind, q.correct, i) }
}

/** Take a choice away, keeping the right answers on the same choices. */
export function removeChoice(q: DraftQuestion, i: number): DraftQuestion {
  return { ...q, choices: q.choices.filter((_, k) => k !== i), correct: q.correct.filter(k => k !== i).map(k => (k > i ? k - 1 : k)) }
}

/** What stops a test being saved — the database's words, said first in the app — or null. */
export function draftProblem(t: DraftTest): string | null {
  if (!t.title.trim()) return 'Give the test a title.'
  if (t.title.trim().length > 120) return 'Keep the title to 120 characters.'
  if (!t.questions.length) return 'Add at least one question.'
  if (t.questions.length > 100) return 'A test takes up to 100 questions.'
  for (const [n, q] of t.questions.entries()) {
    const at = `Question ${n + 1}`
    if (!q.prompt.trim()) return `${at}: write the question.`
    if (q.kind !== 'truefalse') {
      if (q.choices.some(c => !c.trim())) return `${at}: fill in every answer, or remove the empty one.`
      if (q.choices.length < 2 || q.choices.length > 8) return `${at}: give 2 to 8 answers to pick from.`
    }
    if (!q.correct.length) return `${at}: mark the right answer.`
    if (q.kind !== 'multiple' && q.correct.length > 1) return `${at}: only one answer can be right — or make it a several-answers question.`
  }
  return null
}

/** The Library's file types (the owner: PDF, pictures, Word — and the rest of Office, as Documentation keeps). */
const LIB_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // CSV (the owner, 2026-11-17: "CSV 需要").
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
}

/** The bucket's own limit (2 GB). */
export const LIB_MAX_BYTES = 2 * 1024 * 1024 * 1024

export const LIB_ACCEPT = Object.keys(LIB_TYPES).map(e => `.${e}`).join(',')

export function libContentType(fileName: string): string | null {
  return LIB_TYPES[fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()] ?? null
}

/** Why a file cannot go into the Library — or null. */
export function libFileRefusal(file: { name: string; size: number }): string | null {
  if (!libContentType(file.name)) return 'Add a PDF, a Word, Excel, CSV or PowerPoint file, a picture or a video — or paste a link.'
  if (file.size > LIB_MAX_BYTES) return 'That file is larger than 2 GB.'
  return null
}

/** Where a file goes in the bucket: `library/<id>/<safe name>` (the database checks the same shape). */
export function libPath(id: string, fileName: string): string {
  const cleaned = fileName.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+/, '')
  return `library/${id}/${(cleaned || 'file').slice(-120)}`
}

/** What a row's badge says: the file's ending, or LINK. */
export function itemBadge(item: Pick<LibraryItem, 'kind' | 'fileName' | 'url'>): string {
  if (item.kind === 'link') return /youtu\.?be/.test(item.url ?? '') ? 'VIDEO' : 'LINK'
  const ext = (item.fileName ?? '').split('.').pop() ?? ''
  return ext.toUpperCase().slice(0, 4) || 'FILE'
}

/** A size people read: 820 KB, 4.2 MB. */
export function sizeText(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/** A link a person may open: http(s) only. */
export function safeLink(url: string | null): string | null {
  return url && /^https?:\/\/\S+$/i.test(url) ? url : null
}

/** The database's words for a refusal; anything else, a plain sentence. */
export function refusal(error: { message?: string; code?: string } | null, fallback: string): string {
  const msg = error?.message ?? ''
  return error && (error.code === '42501' || error.code === '22023' || error.code === '23505' || error.code === 'P0002') && msg ? msg : fallback
}
