import type { Outcome, TrainingApi } from './api'
import { draftProblem, type DraftTest, type LibraryCategory, type TestScoreRow } from './model'

/**
 * The design preview's Free test and Library (2026-11-16): a sample test of each question type and a Library of
 * files and links, kept in memory and scored the way `rev_test_submit` scores — a question is right when exactly its
 * right choices were picked. Nothing leaves the page.
 */
const ok = <T,>(data: T): Promise<Outcome<T>> => Promise.resolve({ ok: true, data })
const no = <T,>(error: string): Promise<Outcome<T>> => Promise.resolve({ ok: false, error })

interface Stored extends DraftTest {
  id: string
  qids: string[]
  updatedAt: string
  attempts: { score: number; total: number; at: string }[]
}

function sample(): Stored[] {
  const raw: Stored[] = [
    {
      id: 't-mattress', title: 'Mattress basics', intro: 'Five questions on the layers, the sizes and the warranty.',
      published: true, updatedAt: '2026-11-14T03:00:00Z', qids: [], attempts: [{ score: 3, total: 5, at: '2026-11-15T09:20:00Z' }],
      questions: [
        { kind: 'single', prompt: 'Which layer of a latex mattress gives the comfort?', choices: ['The top latex layer', 'The pocket springs', 'The base board'], correct: [0], explain: 'The springs carry the weight; the latex on top is what the customer feels.' },
        { kind: 'single', prompt: 'How wide is a Queen mattress?', choices: ['90 cm', '150 cm', '180 cm', '200 cm'], correct: [1], explain: 'Queen is 150 × 190 cm; King is 180 × 190 cm.' },
        { kind: 'multiple', prompt: 'Which of these come with a 10-year warranty? Pick every one.', choices: ['Akemi APEX', 'Dunlopillo Prestige', 'A pillow', 'A mattress protector'], correct: [0, 1], explain: 'Pillows and protectors carry one year.' },
        { kind: 'truefalse', prompt: 'A customer may take the deposit back after the fair if the order has not been made.', choices: ['True', 'False'], correct: [1], explain: 'The deposit is not refundable — say so before taking it.' },
        { kind: 'single', prompt: 'A customer says the mattress is too firm. What do you show first?', choices: ['A softer model of the same brand', 'A cheaper brand', 'A pillow'], correct: [0], explain: '' },
      ],
    },
    {
      id: 't-sofa', title: 'Sofa fabrics', intro: 'The fabric tiers and how to explain an upgrade.',
      published: true, updatedAt: '2026-11-10T03:00:00Z', qids: [], attempts: [],
      questions: [
        { kind: 'truefalse', prompt: 'A fabric upgrade is charged once per sofa.', choices: ['True', 'False'], correct: [0], explain: '' },
        { kind: 'multiple', prompt: 'Which are leather-look fabrics?', choices: ['Velvet', 'PU', 'Linen', 'Nappa-touch'], correct: [1, 3], explain: '' },
      ],
    },
  ]
  return raw.map(t => ({ ...t, qids: t.questions.map((_, i) => `${t.id}-q${i}`) }))
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

export function fixtureTrainingApi(): TrainingApi {
  const tests = sample()
  let lib = sampleLibrary()
  let n = 0
  const find = (id: string) => tests.find(t => t.id === id)
  return {
    tests: () => ok(tests.filter(t => t.published).map(t => {
      const best = t.attempts.length ? Math.max(...t.attempts.map(a => a.score)) : null
      const last = t.attempts[t.attempts.length - 1] ?? null
      return { id: t.id, title: t.title, intro: t.intro, published: t.published, questions: t.questions.length, attempts: t.attempts.length,
        best, last: last?.score ?? null, lastTotal: last?.total ?? null, lastAt: last?.at ?? null }
    })),
    take: id => {
      const t = find(id)
      return t ? ok({ id: t.id, title: t.title, intro: t.intro, questions: t.questions.map((q, i) => ({ id: t.qids[i], kind: q.kind, prompt: q.prompt, choices: q.choices })) })
        : no('That test is not open any more.')
    },
    submit: (id, answers) => {
      const t = find(id)
      if (!t) return no('That test is not open any more.')
      const review = t.questions.map((q, i) => {
        const chosen = [...new Set((answers[t.qids[i]] ?? []).filter(x => x < q.choices.length))].sort((a, b) => a - b)
        const correct = [...q.correct].sort((a, b) => a - b)
        return { id: t.qids[i], chosen, correct, right: chosen.join() === correct.join(), explain: q.explain }
      })
      const score = review.filter(r => r.right).length
      t.attempts.push({ score, total: review.length, at: new Date().toISOString() })
      return ok({ score, total: review.length, saved: true, review })
    },
    adminTests: () => ok(tests.map(t => ({ id: t.id, title: t.title, published: t.published, questions: t.questions.length,
      people: t.attempts.length ? 1 : 0, attempts: t.attempts.length, byName: 'PETER NG', updatedAt: t.updatedAt }))),
    adminTest: id => {
      const t = find(id)
      return t ? ok({ id: t.id, title: t.title, intro: t.intro, published: t.published, questions: t.questions.map(q => ({ ...q, choices: [...q.choices], correct: [...q.correct] })) })
        : no('That test is not there any more.')
    },
    saveTest: test => {
      const problem = draftProblem(test)
      if (problem) return no(problem)
      const clean = { ...test, title: test.title.trim(), questions: test.questions.map(q => ({ ...q, prompt: q.prompt.trim(), choices: q.kind === 'truefalse' ? ['True', 'False'] : q.choices.map(c => c.trim()) })) }
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
      const rows: TestScoreRow[] = [
        { staffId: 's1', name: 'JIA HUI TAN', attempts: t.attempts.length, best: t.attempts.length ? Math.max(...t.attempts.map(a => a.score)) : null,
          last: t.attempts[t.attempts.length - 1]?.score ?? null, total: t.questions.length, lastAt: t.attempts[t.attempts.length - 1]?.at ?? null },
        { staffId: 's2', name: 'DANIEL LIM', attempts: 2, best: t.questions.length, last: t.questions.length - 1, total: t.questions.length, lastAt: '2026-11-13T10:00:00Z' },
        { staffId: 's3', name: 'SHAWN WONG', attempts: 0, best: null, last: null, total: null, lastAt: null },
      ]
      return ok(rows.sort((a, b) => (b.best ?? -1) - (a.best ?? -1)))
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
