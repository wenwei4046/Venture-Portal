import type { FormField } from './tasks'

// A choice's options (③d-2 — the user's answer 9: "a shared option list (Locations) as a dropdown — the person filling it
// in adds a missing option on the spot"; `Canvas Template Editor.dc.html`'s *Shared option list · Locations* — "used
// across the group · edit once, updates everywhere" — or *Own options for this field*). The lists are the database's
// (mkt_option_lists, mig 20261025191000); a field names one by `list`.

/** The shared lists, by their names. */
export type OptionLists = Readonly<Record<string, readonly string[]>>

/** An option's words at most, a list's options at most, a Multi-select's picks at most — as the database keeps them. */
export const OPTION_MAX = 40
export const LIST_MAX = 200
export const PICKS_MAX = 30

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const words = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [])

/** mkt_option_lists(): every list, by its name — anything else left out. */
export function optionListsFromRow(v: unknown): OptionLists {
  if (!isObj(v)) return {}
  return Object.fromEntries(Object.entries(v).filter(([name]) => /^[A-Z][A-Za-z ]{1,39}$/.test(name)).map(([name, opts]) => [name, words(opts)]))
}

/** A typed option as the list keeps it — its spaces tidied; '' when nothing is left or it is longer than an option may be. */
export function optionWords(typed: string): string {
  const o = typed.trim().replace(/\s+/g, ' ')
  return o.length <= OPTION_MAX ? o : ''
}

/** A typed option there already, in other letters: its own spelling — else null. */
export const optionThere = (opts: readonly string[], typed: string): string | null =>
  opts.find(o => o.toLowerCase() === optionWords(typed).toLowerCase()) ?? null

/** An answer as its picks: a Multi-select's list; one word (typed before ③d-2) is one pick; none, none. */
export function picksOf(v: unknown): string[] {
  if (Array.isArray(v)) return words(v)
  return typeof v === 'string' && v.trim() ? [v.trim()] : []
}

/** A choice's options to offer: its shared list's once it names one (a list not there — none), else its own; an answer
 * picked before that is no longer among them is still offered — its value is kept. */
export function choiceOptions(f: Pick<FormField, 'opts' | 'list'>, lists: OptionLists, answer: unknown): string[] {
  const opts = f.list ? [...(lists[f.list] ?? [])] : (f.opts ?? []).filter(o => o.trim())
  return [...opts, ...picksOf(answer).filter(p => !opts.includes(p))]
}

/** A Multi-select's picks, one toggled — in the order the options run. */
export function togglePick(picks: readonly string[], o: string, order: readonly string[]): string[] {
  const next = picks.includes(o) ? picks.filter(p => p !== o) : [...picks, o]
  return [...next].sort((a, b) => (order.indexOf(a) === -1 ? 1e6 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 1e6 : order.indexOf(b)))
}

/** An answer in words: a Multi-select's picks joined ("Showroom, LRT"), else as it is. */
export const answerWords = (v: unknown): string => (Array.isArray(v) ? picksOf(v).join(', ') : typeof v === 'string' ? v : '')

/** Two answers alike — a Multi-select's picks the same, in the same order. */
export function sameAnswer(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i])
  return a === b
}
