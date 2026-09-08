'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { compareByLadder, ladderAllows, ladderRefusal } from '@/lib/ladder'
import { boundaryRefusal } from '@/lib/hierarchy-boundary'
import { ratePct } from '@/lib/commission/ranks'
import { ErrorNote } from '@/components/RowForm'
import LedgerRow from '@/components/LedgerRow'
import type { MirrorOutcome } from '@/lib/hierarchy-mirror'
import { setReportsTo, setStaffRank, undoHierarchyMove, type UndoMoveInput } from '../actions'
import type { ChartPerson } from './TeamOrgChart'
import type { RankOption, SalesPerson } from './HierarchyPanel'
import MirrorOfferPrompt, { nextOffer, offerKey, type OfferState } from './MirrorOfferPrompt'

/** No filter on this facet. */
const ALL = '__all__'
/** Only the people the facet is blank for — the rows this table exists to fix. */
const NONE = '__none__'

/**
 * The chart, as rows.
 *
 * The user asked for the hierarchy to be toggleable between the graph and a
 * staff list with ranking (2026-09-07), and for a change made in either to
 * write both hierarchies. So this is not a read-only mirror of the canvas —
 * it edits the same two facts the canvas does, through the same two actions:
 *
 *   Manager  `setReportsTo` — which also moves their commission upline.
 *   Rank     `setStaffRank` — which is what a month pays from.
 *
 * Why a table at all, when the graph exists: a canvas answers "what does this
 * tree look like" and is the wrong shape for "set the rank of the eleven
 * people who have none". Dragging is a poor bulk edit. The rows read in ladder
 * order — the most senior title first, the same title together, names A→Z —
 * so the list is the org chart written down rather than a differently-sorted
 * roster.
 *
 * The Manager picker offers only people the ladder would ACCEPT: anybody whose
 * title stands at or above this person's, minus their own descendants. A
 * refusal the user cannot trigger is a refusal they never have to read.
 *
 * Search and the two facet filters narrow the ROWS only. Everything the edit
 * controls read — the manager options, the descendant walk, the commission
 * positions — still runs over the whole `people` prop, because hiding a row is
 * a statement about what the reader wants to look at, not about who exists.
 * Filtering to Marketing and finding their Head of Department gone from every
 * Reports-to picker would be a different, and wrong, table.
 */
export default function StaffTable({
  people,
  salespeople,
  ranksByScheme,
  canSetRank,
}: {
  people: ChartPerson[]
  salespeople: SalesPerson[]
  ranksByScheme: Record<string, RankOption[]>
  /** False for an account with no `revenue` permission — the column reads. */
  canSetRank: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // A refusal the reader can act on, and whether the last thing they did left
  // the two lines still disagreeing. `warn` only changes the banner's TONE —
  // the note is rendered either way, because both offer actions report on a
  // money write even when it succeeded.
  const [offer, setOffer] = useState<OfferState | null>(null)
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
  const position = useMemo(
    () => new Map(salespeople.map(s => [s.staffId, s])),
    [salespeople],
  )

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
      if (!p.reportsTo) continue
      const list = children.get(p.reportsTo)
      if (list) list.push(p.id)
      else children.set(p.reportsTo, [p.id])
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
    setOffer(null)
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
    // Only when there is genuinely nothing to do — the reporting line already
    // points there AND so does the commission line. A reports-to no-op over a
    // commission upline that disagrees still has to make the round trip: the
    // server is the only thing that can raise the offer to clear it, and this
    // page has no other gesture that reaches a commission line.
    if (person.reportsTo === managerId && person.commUplineId === managerId) return
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
    // about who somebody reports to. So a crossing line CAN be re-picked here,
    // and this is where it is caught rather than sent to the server.
    const crossing = manager ? boundaryRefusal(person, manager) : null
    if (crossing) {
      setError(crossing)
      return
    }
    const was = { reportsTo: person.reportsTo, commUplineId: person.commUplineId }
    run(person.id, async () => {
      const outcome = await setReportsTo(person.id, managerId)
      // Whether the mirror ran decides how much an undo may put back. A
      // commission upline the move never wrote is not this button's to move.
      setUndo({
        staffId: person.id,
        reportsTo: was.reportsTo,
        commUplineId: was.commUplineId,
        mirrored: outcome.mirrored,
        movedTo: managerId,
      })
      // The refusal may arrive with a way out attached. `offer` is only ever
      // built by a server that checked for `revenue` first, so its presence is
      // the permission gate — but the rank picker under it is NOT, which is why
      // the options come from the `seesMoney`-gated prop rather than from here.
      if (outcome.offer) setOffer({ offer: outcome.offer, moverId: person.id })
      const moved = manager
        ? `${person.name} now reports to ${manager.name}.`
        : `${person.name} now reports to nobody.`
      // The commission half. Silent when there was nothing to mirror; loud
      // when the two lines have been left disagreeing.
      return outcome.note
        ? `${moved} ${outcome.note}`
        : outcome.mirrored
          ? manager
            ? `${moved} Their commission upline moved with them.`
            // See TeamOrgChart: a cleared upline is a money change, not a move.
            : `${moved} Their commission upline was cleared with them, so nobody earns an override on their sales now.`
          : moved
    })
  }

  /**
   * What came back from accepting an offer.
   *
   * The note is shown whether or not the write landed — unlike `setReportsTo`,
   * where a clean mirror says nothing, these two ARE the write the reader
   * asked for, and a silent success on a money write started by a one-click
   * offer is the silence this feature exists to kill. `mirrored` picks the
   * tone and nothing else.
   */
  function acceptOutcome(outcome: MirrorOutcome) {
    setError(null)
    setNote(outcome.note)
    setWarn(!outcome.mirrored)
    // The offer wrote the commission half the move could not, so the
    // snapshot taken before that move no longer describes what is there.
    setUndo(null)
    setOffer(current => {
      if (!current) return null
      const next = nextOffer(current.offer, outcome)
      return next ? { offer: next, moverId: current.moverId } : null
    })
    router.refresh()
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

  function changeRank(person: ChartPerson, rankId: string) {
    const held = position.get(person.id)
    if (!held || held.rankId === rankId) return
    const rank = (ranksByScheme[held.schemeId] ?? []).find(r => r.id === rankId)
    run(person.id, async () => {
      await setStaffRank(person.id, rankId)
      return `${person.name} is now paid from ${rank ? `${rank.label} · ${rank.rateLabel}` : 'their new rank'}.`
    })
  }

  return (
    <div className="mb-12">
      <ErrorNote error={error} />
      {note || offer ? (
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
          {/* Inside the banner on purpose: the prompt answers the sentence
              above it, and anything that opened below the filter bar would
              push every row down under the cursor that just used one. */}
          {offer ? (
            <MirrorOfferPrompt
              key={offerKey(offer)}
              state={offer}
              ranksByScheme={canSetRank ? ranksByScheme : null}
              preferredSchemeId={position.get(offer.moverId)?.schemeId ?? null}
              onOutcome={acceptOutcome}
              onError={message => {
                setError(message)
                setNote(null)
              }}
            />
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
                <th className="w-48">Rank</th>
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
                const held = position.get(p.id)
                const ranks = held ? (ranksByScheme[held.schemeId] ?? []) : []
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
                                // Two rules, one exemption. The second is the
                                // department boundary: a commission
                                // department's reporting line is also its
                                // commission upline, so it may not leave —
                                // `lib/hierarchy-boundary.ts`.
                                (ladderAllows(p.levelRank, m.levelRank) &&
                                  m.commissionDept === p.commissionDept)),
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
                    </td>
                    <td data-label="Rank">
                      {!held ? (
                        <span className="font-serif italic text-sm text-muted">
                          not on commission
                        </span>
                      ) : !canSetRank || ranks.length === 0 ? (
                        <span className="font-serif italic text-sm text-graphite">
                          {p.rankLabel ?? '—'}
                          {p.rankRate !== null ? (
                            <span className="ml-1.5 font-mono not-italic text-[10px] text-muted">
                              {ratePct(p.rankRate)}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <select
                          value={held.rankId ?? ''}
                          disabled={saving}
                          onChange={e => changeRank(p, e.target.value)}
                          aria-label={`${p.name} rank`}
                          className="w-full max-w-44 px-2 py-1 bg-paper border border-hairline rounded-control text-sm text-ink disabled:opacity-50"
                        >
                          {held.rankId ? null : <option value="">— pick a rank —</option>}
                          {ranks.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.label} · {r.rateLabel}
                            </option>
                          ))}
                        </select>
                      )}
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
        names A→Z. Changing <em>Reports to</em> moves their commission upline with them where this
        account may write both; where it may not, the row says so. When the new manager holds no
        commission position, the banner offers to put them on the ladder and finish the move in one
        step — a rank belongs to a scheme, so it asks for both.
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
