import type { Outcome, TrainingApi } from './api'
import {
  draftProblem, isWritten, type Answer, type AttemptView, type DraftQuestion, type DraftTest, type LibraryCategory, type ReviewItem,
  type TakeQuestion, type TestScoreRow,
} from './model'

/**
 * The design preview's Free test and Library (2026-11-16): sample tests of every question type and a Library of files
 * and links, kept in memory and scored the way `rev_test_submit` scores — a choice question gives its points when
 * exactly its right choices were picked; a written answer waits for a writer's mark (2026-11-17). Nothing leaves the page.
 */
const ok = <T,>(data: T): Promise<Outcome<T>> => Promise.resolve({ ok: true, data })
const no = <T,>(error: string): Promise<Outcome<T>> => Promise.resolve({ ok: false, error })

interface SheetQuestion extends DraftQuestion { id: string }
interface Attempt {
  id: string
  name: string
  sheet: SheetQuestion[]
  answers: Record<string, Answer>
  auto: number
  marks: Record<string, { points: number; comment: string }>
  score: number
  total: number
  pending: boolean
  markedByName: string
  markedAt: string | null
  at: string
}
interface Stored extends DraftTest {
  id: string
  qids: string[]
  updatedAt: string
  attempts: Attempt[]
}

const q = (kind: DraftQuestion['kind'], prompt: string, choices: string[], correct: number[], points = 1, explain = ''): DraftQuestion =>
  ({ kind, prompt, choices, correct, points, explain })

/** The review of an attempt, as `rev_test_review_json` makes it. */
function reviewOf(sheet: readonly SheetQuestion[], answers: Readonly<Record<string, Answer>>, marks: Attempt['marks']): ReviewItem[] {
  return sheet.map(s => {
    const a = answers[s.id]
    if (isWritten(s.kind)) {
      const text = typeof a === 'string' ? a : ''
      const m = marks[s.id]
      return { id: s.id, kind: s.kind, chosen: [], correct: [], right: false, text, points: s.points,
        awarded: text === '' ? 0 : m ? m.points : null, comment: m?.comment ?? '', pending: text !== '' && !m, explain: s.explain }
    }
    const chosen = Array.isArray(a) ? [...new Set(a.filter(x => x < s.choices.length))].sort((x, y) => x - y) : []
    const correct = [...s.correct].sort((x, y) => x - y)
    const right = chosen.join() === correct.join()
    return { id: s.id, kind: s.kind, chosen, correct, right, text: '', points: s.points, awarded: right ? s.points : 0, comment: '', pending: false, explain: s.explain }
  })
}

function sample(): Stored[] {
  const raw: Omit<Stored, 'qids'>[] = [
    {
      id: 't-mattress', title: 'Mattress basics', intro: 'Five questions on the layers, the sizes and the warranty.',
      published: true, updatedAt: '2026-11-14T03:00:00Z', attempts: [],
      questions: [
        q('single', 'Which layer of a latex mattress gives the comfort?', ['The top latex layer', 'The pocket springs', 'The base board'], [0], 1, 'The springs carry the weight; the latex on top is what the customer feels.'),
        q('single', 'How wide is a Queen mattress?', ['90 cm', '150 cm', '180 cm', '200 cm'], [1], 1, 'Queen is 150 × 190 cm; King is 180 × 190 cm.'),
        q('multiple', 'Which of these come with a 10-year warranty? Pick every one.', ['Akemi APEX', 'Dunlopillo Prestige', 'A pillow', 'A mattress protector'], [0, 1], 2, 'Pillows and protectors carry one year.'),
        q('truefalse', 'A customer may take the deposit back after the fair if the order has not been made.', ['True', 'False'], [1], 1, 'The deposit is not refundable — say so before taking it.'),
        q('paragraph', 'A customer says the mattress is too firm. How do you answer?', [], [], 5, 'Show a softer model of the same brand first; offer a topper.'),
      ],
    },
    {
      id: 't-sofa', title: 'Sofa fabrics', intro: 'The fabric tiers and how to explain an upgrade.',
      published: true, updatedAt: '2026-11-10T03:00:00Z', attempts: [],
      questions: [
        q('truefalse', 'A fabric upgrade is charged once per sofa.', ['True', 'False'], [0]),
        q('multiple', 'Which are leather-look fabrics?', ['Velvet', 'PU', 'Linen', 'Nappa-touch'], [1, 3], 2),
        q('short', 'Name one fabric that is easy to clean.', [], [], 2),
      ],
    },
  ]
  const tests = raw.map(t => ({ ...t, qids: t.questions.map((_, i) => `${t.id}-q${i}`) }))
  // A hand-in of the mattress test by somebody else, waiting for its paragraph's mark — and one of yours, marked.
  const m = tests[0]
  const sheet = m.questions.map((x, i) => ({ ...x, id: m.qids[i] }))
  const put = (id: string, name: string, answers: Record<string, Answer>, marks: Attempt['marks'], at: string, by = '') => {
    const review = reviewOf(sheet, answers, marks)
    const auto = review.filter(r => !isWritten(r.kind)).reduce((n, r) => n + (r.awarded ?? 0), 0)
    const pending = review.some(r => r.pending)
    m.attempts.push({ id, name, sheet, answers, auto, marks, score: review.reduce((n, r) => n + (r.awarded ?? 0), 0),
      total: sheet.reduce((n, s) => n + s.points, 0), pending, markedByName: pending ? '' : by, markedAt: pending ? null : at, at })
  }
  put('a-you', 'JIA HUI TAN', { [m.qids[0]]: [0], [m.qids[1]]: [2], [m.qids[2]]: [0, 1], [m.qids[3]]: [1], [m.qids[4]]: 'Ask what they sleep on now, then show the APEX soft.' },
    { [m.qids[4]]: { points: 3, comment: 'Good — also offer a topper.' } }, '2026-11-15T09:20:00Z', 'PETER NG')
  put('a-daniel', 'DANIEL LIM', { [m.qids[0]]: [0], [m.qids[1]]: [1], [m.qids[2]]: [0], [m.qids[3]]: [1], [m.qids[4]]: 'I would show them a softer one and say we have a 100-night trial.' },
    {}, '2026-11-16T11:05:00Z')
  return tests
}

function sampleLibrary(): LibraryCategory[] {
  const item = (id: string, title: string, kind: 'file' | 'link', name: string, at: string, seen: boolean, note = '') => ({
    id, title, kind, path: kind === 'file' ? `library/${id}/${name}` : null, fileName: kind === 'file' ? name : null,
    mime: '', size: kind === 'file' ? 1_850_000 : null, url: kind === 'link' ? name : null, note, byName: 'PETER NG', createdAt: at, seen,
  })
  return [
    { id: 'c-product', name: 'Product knowledge', items: [
      item('l1', 'November price list', 'file', 'price-list-nov.pdf', '2026-11-14T02:00:00Z', false, 'Use this one from 15 Nov.'),
      item('l2', 'Akemi range — what each model is for', 'file', 'akemi-range.pdf', '2026-11-03T02:00:00Z', true),
      item('l3', 'Showroom tour', 'link', 'https://www.youtube.com/watch?v=houzs', '2026-11-12T02:00:00Z', false),
    ] },
    { id: 'c-sales', name: 'Sales skills', items: [
      item('l4', 'Answering "it is too expensive"', 'file', 'objections.docx', '2026-10-28T02:00:00Z', true),
    ] },
    { id: 'c-rules', name: 'Company rules', items: [] },
  ]
}

const ME = 'JIA HUI TAN'

export function fixtureTrainingApi(): TrainingApi {
  const tests = sample()
  let lib = sampleLibrary()
  let n = 0
  const find = (id: string) => tests.find(t => t.id === id)
  const findAttempt = (id: string) => {
    for (const t of tests) { const a = t.attempts.find(x => x.id === id); if (a) return { t, a } }
    return null
  }
  const view = (t: Stored, a: Attempt): AttemptView => ({
    id: a.id, testId: t.id, title: t.title, name: a.name, at: a.at, score: a.score, total: a.total, pending: a.pending,
    markedByName: a.markedByName, markedAt: a.markedAt,
    questions: a.sheet.map((s): TakeQuestion => ({ id: s.id, kind: s.kind, prompt: s.prompt, choices: s.choices, points: s.points })),
    review: reviewOf(a.sheet, a.answers, a.marks),
  })
  return {
    tests: () => ok(tests.filter(t => t.published).map(t => {
      const mine = t.attempts.filter(a => a.name === ME)
      const marked = mine.filter(a => !a.pending)
      const best = marked.length ? marked.reduce((b, a) => (a.score > b.score ? a : b)) : null
      const last = mine[mine.length - 1] ?? null
      return { id: t.id, title: t.title, intro: t.intro, published: t.published, questions: t.questions.length,
        points: t.questions.reduce((s, x) => s + x.points, 0), written: t.questions.some(x => isWritten(x.kind)), attempts: mine.length,
        best: best?.score ?? null, bestTotal: best?.total ?? null, lastId: last?.id ?? null, last: last?.score ?? null,
        lastTotal: last?.total ?? null, lastPending: last?.pending ?? false, lastAt: last?.at ?? null }
    })),
    take: id => {
      const t = find(id)
      return t ? ok({ id: t.id, title: t.title, intro: t.intro, questions: t.questions.map((x, i) => ({ id: t.qids[i], kind: x.kind, prompt: x.prompt, choices: x.choices, points: x.points })) })
        : no('That test is not open any more.')
    },
    submit: (id, answers) => {
      const t = find(id)
      if (!t) return no('That test is not open any more.')
      const sheet = t.questions.map((x, i) => ({ ...x, id: t.qids[i] }))
      const clean = Object.fromEntries(sheet.map(s => [s.id, isWritten(s.kind)
        ? (typeof answers[s.id] === 'string' ? (answers[s.id] as string).trim() : '')
        : (Array.isArray(answers[s.id]) ? answers[s.id] : [])]))
      const review = reviewOf(sheet, clean, {})
      const score = review.reduce((s, r) => s + (r.awarded ?? 0), 0)
      const total = sheet.reduce((s, x) => s + x.points, 0)
      const pending = review.some(r => r.pending)
      const attemptId = `a-${++n}`
      t.attempts.push({ id: attemptId, name: ME, sheet, answers: clean, auto: score, marks: {}, score, total, pending, markedByName: '', markedAt: null, at: new Date().toISOString() })
      return ok({ attemptId, score, total, pending, saved: true, review })
    },
    attempt: id => { const f = findAttempt(id); return f ? ok(view(f.t, f.a)) : no('That attempt is not there.') },
    toMark: () => ok(tests.flatMap(t => t.attempts.filter(a => a.pending).map(a => ({ id: a.id, testId: t.id, title: t.title, name: a.name, at: a.at, score: a.score, total: a.total })))
      .sort((x, y) => x.at.localeCompare(y.at))),
    mark: (id, marks) => {
      const f = findAttempt(id)
      if (!f) return no('That attempt is not there.')
      for (const s of f.a.sheet) {
        if (!isWritten(s.kind) || !String(f.a.answers[s.id] ?? '')) continue
        const m = marks[s.id]
        if (!m || !Number.isInteger(m.points) || m.points < 0) return no('Give every written answer its points.')
        if (m.points > s.points) return no(`A written answer gets at most its question's ${s.points} points.`)
      }
      f.a.marks = Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, { points: m.points, comment: m.comment.trim() }]))
      const review = reviewOf(f.a.sheet, f.a.answers, f.a.marks)
      f.a.score = review.reduce((s, r) => s + (r.awarded ?? 0), 0)
      f.a.pending = false
      f.a.markedByName = 'PETER NG'
      f.a.markedAt = new Date().toISOString()
      return ok(view(f.t, f.a))
    },
    adminTests: () => ok(tests.map(t => ({ id: t.id, title: t.title, published: t.published, questions: t.questions.length,
      points: t.questions.reduce((s, x) => s + x.points, 0), people: new Set(t.attempts.map(a => a.name)).size, attempts: t.attempts.length,
      toMark: t.attempts.filter(a => a.pending).length, byName: 'PETER NG', updatedAt: t.updatedAt }))),
    adminTest: id => {
      const t = find(id)
      return t ? ok({ id: t.id, title: t.title, intro: t.intro, published: t.published, questions: t.questions.map(x => ({ ...x, choices: [...x.choices], correct: [...x.correct] })) })
        : no('That test is not there any more.')
    },
    saveTest: test => {
      const problem = draftProblem(test)
      if (problem) return no(problem)
      const clean = { ...test, title: test.title.trim(), questions: test.questions.map(x => ({ ...x, prompt: x.prompt.trim(),
        choices: x.kind === 'truefalse' ? ['True', 'False'] : isWritten(x.kind) ? [] : x.choices.map(c => c.trim()),
        correct: isWritten(x.kind) ? [] : x.correct })) }
      const t = test.id ? find(test.id) : undefined
      if (t) {
        Object.assign(t, clean, { updatedAt: new Date().toISOString(), qids: clean.questions.map((_, i) => `${t.id}-q${i}-${++n}`) })
        return ok(t.id)
      }
      const id = `t-new-${++n}`
      tests.unshift({ ...clean, id, updatedAt: new Date().toISOString(), qids: clean.questions.map((_, i) => `${id}-q${i}`), attempts: [] })
      return ok(id)
    },
    publishTest: (id, on) => { const t = find(id); if (t) t.published = on; return t ? ok(true as const) : no('That test is not there any more.') },
    deleteTest: id => { const i = tests.findIndex(t => t.id === id); if (i >= 0) tests.splice(i, 1); return ok(true as const) },
    scores: id => {
      const t = find(id)
      if (!t) return no('That test is not there any more.')
      const total = t.questions.reduce((s, x) => s + x.points, 0)
      const rows: TestScoreRow[] = ['JIA HUI TAN', 'DANIEL LIM', 'SHAWN WONG'].map((name, k) => {
        const mine = t.attempts.filter(a => a.name === name)
        const marked = mine.filter(a => !a.pending)
        const last = mine[mine.length - 1]
        return { staffId: `s${k + 1}`, name, attempts: mine.length, best: marked.length ? Math.max(...marked.map(a => a.score)) : null,
          last: last?.score ?? null, total: last?.total ?? (mine.length ? total : null), lastId: last?.id ?? null,
          lastPending: last?.pending ?? false, lastAt: last?.at ?? null }
      })
      return ok(rows.sort((a, b) => (b.attempts ? 1 : 0) - (a.attempts ? 1 : 0) || (b.best ?? -1) - (a.best ?? -1)))
    },
    library: () => ok(lib.map(c => ({ ...c, items: c.items.map(i => ({ ...i })) }))),
    open: id => {
      lib = lib.map(c => ({ ...c, items: c.items.map(i => (i.id === id ? { ...i, seen: true } : i)) }))
      const item = lib.flatMap(c => c.items).find(i => i.id === id)
      // The preview opens nothing: its files and links are samples.
      return item ? ok({ href: 'about:blank', kind: item.kind }) : no('That is not in the Library any more.')
    },
    saveCategory: (id, name) => {
      const v = name.trim()
      if (!v) return no('Name the category (up to 60 characters).')
      if (lib.some(c => c.id !== id && c.name.toLowerCase() === v.toLowerCase())) return no(`There is a category called ${v} already.`)
      if (id) { lib = lib.map(c => (c.id === id ? { ...c, name: v } : c)); return ok(id) }
      const cid = `c-new-${++n}`
      lib = [...lib, { id: cid, name: v, items: [] }]
      return ok(cid)
    },
    deleteCategory: id => {
      if (lib.find(c => c.id === id)?.items.length) return no('Move or delete what is in this category first.')
      lib = lib.filter(c => c.id !== id)
      return ok(true as const)
    },
    upload: file => ok(`library/preview-${++n}/${file.name}`),
    addItem: input => {
      const id = `l-new-${++n}`
      const name = input.path?.split('/').pop() ?? null
      lib = lib.map(c => (c.id === input.categoryId ? { ...c, items: [{ id, title: input.title.trim(), kind: input.kind, path: input.path ?? null, fileName: name,
        mime: '', size: input.kind === 'file' ? 240_000 : null, url: input.url ?? null, note: input.note ?? '', byName: 'You', createdAt: new Date().toISOString(), seen: false }, ...c.items] } : c))
      return ok(id)
    },
    editItem: input => {
      const item = lib.flatMap(c => c.items).find(i => i.id === input.id)
      if (!item) return no('That is not in the Library any more.')
      const moved = { ...item, title: input.title.trim(), note: input.note ?? '', url: item.kind === 'link' ? input.url ?? item.url : null }
      lib = lib.map(c => ({ ...c, items: c.id === input.categoryId ? [moved, ...c.items.filter(i => i.id !== input.id)] : c.items.filter(i => i.id !== input.id) }))
      return ok(true as const)
    },
    deleteItem: id => { lib = lib.map(c => ({ ...c, items: c.items.filter(i => i.id !== id) })); return ok(true as const) },
  }
}
