'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { compareByLadder, ladderAllows, ladderRefusal } from '@/lib/ladder'
import { lineRefusal } from '@/lib/hierarchy-boundary'
import { headsLabel, reportsToHeads } from '@/lib/department-heads'
import { ErrorNote } from '@/components/RowForm'
import LedgerRow from '@/components/LedgerRow'
import { setReportsTo, undoHierarchyMove, type UndoMoveInput } from '../actions'
import type { ChartPerson } from './TeamOrgChart'

/** No filter on this facet. */
const ALL = '__all__'
/** Only the people the facet is blank for — the rows this table exists to fix. */
const NONE = '__none__'

/**
 * The chart, as rows.
 *
 * The user asked for the hierarchy to be toggleable between the graph and a
 * staff list (2026-09-07). This is not a read-only mirror of the canvas — it
 * edits the same fact the canvas does, through the same action:
 * `setReportsTo`. Since 2026-09-10 that fact is the only line there is:
 * inside a commission department who somebody reports to is who earns the
 * override on their sales, and the position follows in the database.
 *
 * It used to edit a second one. A Rank column set what a month pays somebody
 * from, and it went on 2026-09-08 with the rest of the commission display on
 * this page — because a rank is NOT what a month pays. Somebody who misses
 * their monthly quota earns at a different rate from the one their rank
 * implies, so a row reading "Rank B · 8%" was true only in the months quota
 * was hit. Ranks are set on `/revenue/[sub]/hierarchy`, where a period is in
 * scope.
 *
 * Why a table at all, when the graph exists: a canvas answers "what does this
 * tree look like" and is the wrong shape for "give the eleven people with no
 * manager one". Dragging is a poor bulk edit. The rows read in ladder order —
 * the most senior title first, the same title together, names A→Z — so the
 * list is the org chart written down rather than a differently-sorted roster.
 *
 * The Manager picker offers only people the ladder would ACCEPT: anybody whose
 * title stands at or above this person's, minus their own descendants. A
 * refusal the user cannot trigger is a refusal they never have to read.
 *
 * Search and the two facet filters narrow the ROWS only. Everything the edit
 * controls read — the manager options, the descendant walk — still runs over
 * the whole `people` prop, because hiding a row is a statement about what the
 * reader wants to look at, not about who exists.
 * Filtering to Marketing and finding their Head of Department gone from every
 * Reports-to picker would be a different, and wrong, table.
 */
export default function StaffTable({ people }: { people: ChartPerson[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // Whether the last thing they did was refused or half-done: the banner's
  // TONE, and nothing else.
  const [warn, setWarn] = useState(false)
  /**
   * The way back from the move just made, or null.
   *
   * One move deep and cleared by the next gesture, exactly as on the
   * chart — the rule and the reasons live in `lib/hierarchy-undo.ts`. The
   * table has its own copy because the two surfaces do not share state,
   * not because they disagree about anything.
   */
  const [undo, setUndo] = useState<UndoMoveInput | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [dept, setDept] = useState(ALL)
  const [title, setTitle] = useState(ALL)

  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])

  // The two dropdowns' options come out of the roster itself rather than a
  // constant, so a department added on People Management shows up here without
  // this file being touched.
  const departments = useMemo(() => facetOf(people, p => p.department), [people])
  const titles = useMemo(() => facetOf(people, p => p.title), [people])

  const filtering = query.trim() !== '' || dept !== ALL || title !== ALL

  // Filter first, sort after. `compareByLadder` is the table's whole ordering
  // argument — the most senior title first, the same title together, names
  // A→Z — and whatever survives a filter has to still read that way. `.filter`
  // hands back a fresh array, so the in-place `.sort` never touches the prop.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter(p => {
        if (q !== '' && !p.name.toLowerCase().includes(q)) return false
        if (!facetMatches(dept, p.department)) return false
        if (!facetMatches(title, p.title)) return false
        return true
      })
      .sort(compareByLadder)
  }, [people, query, dept, title])

  // Everybody under a given person, so the picker cannot offer somebody their
  // own report as a manager. Walked once for the whole table rather than per
  // row: the roster is small, but the walk is O(n) per person and this is a
  // render path.
  const descendants = useMemo(() => {
    const children = new Map<string, string[]>()
    for (const p of people) {
      for (const parentId of p.reportsTo ? [p.reportsTo] : p.leadIds) {
        const list = children.get(parentId)
        if (list) list.push(p.id)
        else children.set(parentId, [p.id])
      }
    }
    const out = new Map<string, Set<string>>()
    for (const p of people) {
      const set = new Set<string>()
      const stack = [...(children.get(p.id) ?? [])]
      while (stack.length > 0) {
        const id = stack.pop()!
        if (set.has(id)) continue
        set.add(id)
        stack.push(...(children.get(id) ?? []))
      }
      out.set(p.id, set)
    }
    return out
  }, [people])

  function clearFilters() {
    setQuery('')
    setDept(ALL)
    setTitle(ALL)
  }

  function run(id: string, work: () => Promise<string>) {
    setError(null)
    setNote(null)
    setWarn(false)
    setUndo(null)
    setBusy(id)
    startTransition(async () => {
      try {
        setNote(await work())
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that')
      } finally {
        setBusy(null)
      }
    })
  }

  function changeManager(person: ChartPerson, managerId: string | null) {
    if (person.reportsTo === managerId) return
    const manager = managerId ? byId.get(managerId) : null
    if (manager && !ladderAllows(person.levelRank, manager.levelRank)) {
      setError(
        ladderRefusal(
          { name: person.name, title: person.title, level: person.levelName },
          { name: manager.name, title: manager.title, level: manager.levelName },
        ),
      )
      return
    }
    // The manager they already have stays in the list even when a rule now
    // refuses them — a controlled <select> whose value matches no option lies
    // about who somebody reports to. So a refused line CAN be re-picked here,
    // and this is where it is caught rather than sent to the server.
    const refused = manager ? lineRefusal(person, manager) : null
    if (refused) {
      setError(refused)
      return
    }
    const was = person.reportsTo
    run(person.id, async () => {
      const result = await setReportsTo(person.id, managerId)
      if (!result.ok) throw new Error(result.reason)
      // A member picking a director lands at the derived department line.
      // Directors themselves keep their ordinary company reporting line.
      const landed = result.reportsTo
      if (was !== landed) setUndo({ staffId: person.id, reportsTo: was, movedTo: landed })
      const heads = headsLabel(
        person.leadIds.map(id => byId.get(id)?.name).filter((name): name is string => !!name),
      )
      const moved = landed
        ? `${person.name} now reports to ${byId.get(landed)?.name ?? manager?.name ?? 'their manager'}.`
        : heads
          ? `${person.name} now stands at the top of a tree, reporting to ${heads} — the department's director.`
          : `${person.name} now reports to nobody.`
      // Inside a commission department the line IS the override, so a detach
      // there is a money change and is said in full.
      if (!person.commissionDept || person.isDepartmentHead) return moved
      return landed
        ? `${moved} The override on their sales goes to ${byId.get(landed)?.name ?? manager?.name ?? 'their manager'} from this month.`
        : `${moved} Nobody earns an override on their sales from this month.`
    })
  }

  function undoLastMove() {
    const was = undo
    if (!was) return
    run(was.staffId, async () => {
      const outcome = await undoHierarchyMove(was)
      // A refusal and a half-undo both warn; only everything going back
      // reads as the plain confirmation it is.
      setWarn(!outcome.undone)
      return outcome.note
    })
  }


  return (
    <div className="mb-12">
      <ErrorNote error={error} />
      {note ? (
        <div
          className={`rounded-md p-3 mb-4 text-sm font-sans border ${
            warn
              ? 'bg-alert-bg border-alert/40 text-alert'
              : 'bg-accent-bg border-accent-border text-accent'
          }`}
        >
          {note}
          {undo ? (
            <button
              type="button"
              disabled={pending}
              onClick={undoLastMove}
              className="ml-2 underline hover:no-underline disabled:opacity-50 disabled:no-underline"
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Same idiom as the roster's filter bar on People Management — one list,
          narrowed. It stacks on a phone and beside the panel on a wide screen,
          because this column is only ever half the page. */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search a name…"
          aria-label="Search staff by name"
          className="flex-1 sm:max-w-xs px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border font-sans"
        />
        <select
          value={dept}
          onChange={e => setDept(e.target.value)}
          aria-label="Filter by department"
          className="px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent-border font-sans"
        >
          <option value={ALL}>All departments</option>
          {departments.values.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
          {departments.hasNone ? <option value={NONE}>— No department</option> : null}
        </select>
        <select
          value={title}
          onChange={e => setTitle(e.target.value)}
          aria-label="Filter by title"
          className="px-3 py-2 bg-paper border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent-border font-sans"
        >
          <option value={ALL}>All titles</option>
          {titles.values.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {titles.hasNone ? <option value={NONE}>— No title</option> : null}
        </select>
      </div>

      {/* The count is the filter's receipt: without it a short table is
          indistinguishable from a small company. `aria-live` because the
          number changes under a reader who is typing, not clicking. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 px-3 py-2 bg-surface border border-hairline rounded-control font-mono text-mono-xs text-muted">
        <span aria-live="polite">
          <b className="text-num-ink font-semibold">{rows.length}</b>
          {filtering ? ` of ${people.length} ` : ' '}
          {people.length === 1 && !filtering ? 'person' : 'people'}
        </span>
        {filtering ? (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto font-sans text-sm text-accent hover:text-accent-hover transition-colors"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif italic text-graphite text-sm">
            No matches for those filters.
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 border border-hairline rounded-control px-4 py-2 font-sans text-sm text-graphite hover:text-ink transition-colors"
          >
            Clear filters to see all
          </button>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="m-hide">Title</th>
                <th className="m-hide">Department</th>
                <th className="w-56">Reports to</th>
                {/* `.m-hide` on its own only removes a column below 768px — the
                    chevron that brings Title and Department back as a panel comes
                    from LedgerRow, and it needs this cell to sit under. Without
                    the pair, the two columns simply vanish on a phone. */}
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const manager = p.reportsTo ? byId.get(p.reportsTo) : null
                const broken = manager ? !ladderAllows(p.levelRank, manager.levelRank) : false
                const mine = descendants.get(p.id) ?? new Set<string>()
                const saving = pending && busy === p.id

                return (
                  <LedgerRow key={p.id} className={broken ? 'bg-danger-bg/40' : undefined}>
                    <td>
                      <span className="text-ink">{p.name}</span>
                      {p.code ? (
                        <span className="ml-2 font-mono text-mono-xs text-muted">{p.code}</span>
                      ) : null}
                    </td>
                    <td className="m-hide" data-label="Title">
                      <span className="font-serif italic text-sm text-graphite">
                        {p.title ?? <span className="text-muted">—</span>}
                      </span>
                      {p.levelRank !== null ? (
                        <span
                          className="ml-2 font-mono not-italic text-[10px] text-muted"
                          title={`Level ${p.levelRank} · ${p.levelName}`}
                        >
                          L{p.levelRank}
                        </span>
                      ) : null}
                    </td>
                    <td className="m-hide" data-label="Department">
                      <span className="font-serif italic text-sm text-graphite">
                        {p.department ?? <span className="text-muted">—</span>}
                      </span>
                    </td>
                    <td data-label="Reports to">
                      <select
                        value={p.reportsTo ?? ''}
                        disabled={saving}
                        onChange={e => changeManager(p, e.target.value || null)}
                        aria-label={`${p.name} reports to`}
                        className="w-full max-w-52 px-2 py-1 bg-paper border border-hairline rounded-control text-sm text-ink disabled:opacity-50"
                      >
                        <option value="">— top of a tree —</option>
                        {people
                          .filter(
                            m =>
                              m.id !== p.id &&
                              !mine.has(m.id) &&
                              // The manager they ALREADY have is always offered,
                              // even when the ladder would now refuse them. A
                              // controlled <select> whose value matches no option
                              // renders the first one, so filtering them out made
                              // every broken row claim to report to nobody —
                              // directly under a warning saying the opposite.
                              (m.id === p.reportsTo ||
                                // Three rules, one exemption: the ladder, the
                                // department boundary, and — inside a commission
                                // department — a title that may hold downlines.
                                // `lib/hierarchy-boundary.ts` has the last two.
                                (ladderAllows(p.levelRank, m.levelRank) && !lineRefusal(p, m))),
                          )
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                              {m.id === p.reportsTo && broken ? ' — breaks the ladder' : ''}
                            </option>
                          ))}
                      </select>
                      {broken ? (
                        <div className="mt-1 font-serif italic text-[11px] text-danger">
                          the ladder would refuse this line
                        </div>
                      ) : null}
                      {reportsToHeads(p) ? (
                        <div
                          className="mt-1 font-serif italic text-[11px] text-muted"
                          title="The top of a tree reports to the sub-department's Revenue Director — set on Revenue, a reporting line only, no override."
                        >
                          reports to {headsLabel(p.leadIds.map(id => byId.get(id)?.name).filter((name): name is string => !!name))} · the department&rsquo;s director
                        </div>
                      ) : null}
                    </td>
                  </LedgerRow>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 font-serif italic text-muted text-xs max-w-3xl leading-relaxed">
        The rows read the ladder top down — the most senior title first, the same title together,
        names A→Z. Revenue Directors can report to company managers at the same or a higher
        L level; their reporting lines carry no commission override. For other Revenue members,
        <em> Reports to</em> is also who earns the override on their sales, and the picker offers
        only titles that may hold downlines. What a
        month actually pays somebody is not a column here: it belongs to a run, and it is read on
        Revenue.
      </p>
    </div>
  )
}

/**
 * The distinct values of one nullable field, A→Z, plus whether anybody has
 * none of it. The blank bucket is worth offering here in a way it would not be
 * on a finished roster: this table is where an unplaced person gets a title
 * and a manager, so "show me the ones with no title" is the actual worklist.
 */
function facetOf(
  people: ChartPerson[],
  pick: (p: ChartPerson) => string | null,
): { values: string[]; hasNone: boolean } {
  const set = new Set<string>()
  let hasNone = false
  for (const p of people) {
    const value = pick(p)
    if (value) set.add(value)
    else hasNone = true
  }
  return { values: [...set].sort((a, b) => a.localeCompare(b)), hasNone }
}

/** Does one person's field satisfy a facet dropdown's current choice? */
function facetMatches(choice: string, value: string | null): boolean {
  if (choice === ALL) return true
  if (choice === NONE) return !value
  return value === choice
}
