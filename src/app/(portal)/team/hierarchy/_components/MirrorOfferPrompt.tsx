'use client'

import { useMemo, useState, useTransition } from 'react'
import type { MirrorOffer, MirrorOutcome } from '@/lib/hierarchy-mirror'
import { detachCommissionUpline, enrolAndCompleteMove } from '../actions'
import type { RankOption } from './HierarchyPanel'

/**
 * The way out, rendered where the refusal is read.
 *
 * A move on either hierarchy writes the reporting line and then tries to move
 * the commission upline with it. When that second half declines, the outcome
 * comes back with a `note` saying so — and, since 2026-09-07, sometimes with a
 * `MirrorOffer`: the named, one-step way to make the thing it declined
 * possible. This component is that step.
 *
 * It exists because the note on its own left the reader holding a sentence and
 * nowhere to act on it (user, 2026-09-07): they were told the new manager earns
 * no override, and then had to go and find a different page under a different
 * permission to do anything about it. So the prompt sits INSIDE the banner that
 * carries the note — the same box, directly under the sentence it answers —
 * rather than anywhere that would shift the table or the canvas under the
 * cursor that just dropped a card.
 *
 * Two offers, and the difference between them is the whole design:
 *
 *   enrol   the new manager holds no commission position. A rank belongs to a
 *           scheme, so the form asks for both, and the ACTION does the two
 *           writes together — enrol, then re-run the mover's mirror. Enrolling
 *           alone is the silent failure this feature exists to kill.
 *   detach  the move was a detach on one chart and the mover still earns under
 *           their old commission upline. One button, one deliberate click. It
 *           is never pre-checked, never bundled into the drag, never automatic:
 *           the two trees hold different people, and clearing a real commission
 *           relationship because the reporting chart lost one is bug B7.
 *
 * Nothing here pre-validates. `ChartPerson` carries a title as a NAME only —
 * no title id, no can-recruit flag — so this component cannot know whether the
 * ladder will accept the manager as an upline. It submits and renders whatever
 * comes back; the refusal arrives as a `note`, which is why the caller must
 * show the note on failure as loudly as on success.
 */
export interface OfferState {
  /** What the server attached to the note it returned. */
  offer: MirrorOffer
  /**
   * WHOSE move raised the offer — not the offer's subject.
   *
   * Both follow-up actions are about the mover: `enrolAndCompleteMove` re-runs
   * the mover's mirror after enrolling the manager, and
   * `detachCommissionUpline` clears the MOVER's upline. A detach offer names
   * the upline it would clear so the sentence can say who that is; calling the
   * action with that id instead would clear the wrong person's line.
   */
  moverId: string
}

/**
 * The offer to show after one has been accepted.
 *
 * A result may carry a FURTHER offer — the mover's line had drifted onto a
 * third person who is also not on commission — and that one replaces this one,
 * so the exchange can chain.
 *
 * Otherwise the rule is: a write that landed retires the offer, a write that
 * did not keeps it. That second half is not tidiness, it is the only way back.
 * The reporting line is already committed by the time an offer is rendered, so
 * a refused enrolment cannot be retried by repeating the gesture that raised
 * it — the manager picker already reads the new manager and re-picking them is
 * a no-op. If the ladder refuses the rank that was chosen, the form has to
 * still be there to choose another one.
 */
export function nextOffer(current: MirrorOffer, outcome: MirrorOutcome): MirrorOffer | null {
  if (outcome.offer) return outcome.offer
  return outcome.mirrored ? null : current
}

/**
 * A React `key` that changes when the offer's SUBJECT does.
 *
 * The scheme and rank pickers are `useState`-initialised once, and an offer can
 * chain — accepting one may return a further offer about a third person. Without
 * a key React keeps the same instance across that swap, so the second manager's
 * name appears above the first manager's rank still selected. Keying on who the
 * offer is about remounts the form, which is the reset.
 */
export function offerKey(state: OfferState): string {
  const subject =
    state.offer.kind === 'enrol' ? state.offer.staffId : state.offer.uplineId
  return `${state.offer.kind}:${state.moverId}:${subject}`
}

export default function MirrorOfferPrompt({
  state,
  ranksByScheme,
  preferredSchemeId,
  onOutcome,
  onError,
}: {
  state: OfferState
  /**
   * The ranks a scheme offers, as the page already built them for the Rank
   * column: keyed by scheme id, and `{}` for an account with no `revenue`.
   *
   * `null` means this SURFACE has no rank options to give — the org canvas is
   * not passed them — and an enrol offer then renders nothing rather than an
   * empty picker. An empty picker is the worse failure of the two: it looks
   * like a control that is broken instead of one that is absent.
   */
  ranksByScheme: Record<string, RankOption[]> | null
  /**
   * The scheme to default to — the MOVER's own. An override differential
   * belongs to one scheme, so a manager enrolled into a different one would be
   * refused by the very mirror this offer is trying to complete.
   */
  preferredSchemeId: string | null
  /** What the action returned. Always carries a note; render it either way. */
  onOutcome: (outcome: MirrorOutcome) => void
  /** Only for a THROW — bad ids, somebody off the active roster. */
  onError: (message: string) => void
}) {
  const [pending, startTransition] = useTransition()

  const schemes = useMemo(() => schemeChoices(ranksByScheme), [ranksByScheme])
  const [schemeId, setSchemeId] = useState<string>(
    () =>
      (preferredSchemeId && ranksByScheme?.[preferredSchemeId] ? preferredSchemeId : null) ??
      schemes[0]?.id ??
      '',
  )
  const [rankId, setRankId] = useState('')

  const ranks = ranksByScheme?.[schemeId] ?? []

  function accept(work: () => Promise<MirrorOutcome>) {
    startTransition(async () => {
      try {
        onOutcome(await work())
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Could not do that')
      }
    })
  }

  if (state.offer.kind === 'detach') {
    return (
      <div className="mt-3 pt-3 border-t border-hairline flex flex-wrap items-center gap-3">
        <span className="chip alert">
          <span className="dot" aria-hidden />
          COMMISSION UPLINE UNCHANGED
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => accept(() => detachCommissionUpline(state.moverId))}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Clearing…' : 'Also clear their commission upline'}
        </button>
      </div>
    )
  }

  // An enrol offer this surface cannot act on. The note above it still says
  // what happened and names the manager; inventing a control with nothing
  // behind it would be worse than the sentence alone.
  if (!ranksByScheme) return null

  const staffName = state.offer.staffName
  const canSubmit = schemeId !== '' && rankId !== '' && !pending

  return (
    <div className="mt-3 pt-3 border-t border-hairline">
      <div className="flex flex-wrap items-end gap-3">
        <span className="chip alert mb-1.5">
          <span className="dot" aria-hidden />
          NOT ON THE LADDER
        </span>

        {schemes.length > 1 ? (
          <label className="flex flex-col gap-1">
            <span className="font-mono text-mono-xs text-muted uppercase tracking-wide">
              Sub-department
            </span>
            <select
              value={schemeId}
              disabled={pending}
              onChange={e => {
                setSchemeId(e.target.value)
                // A rank belongs to ONE scheme. Carrying the old choice across
                // would submit a pairing `setPosition` is going to refuse.
                setRankId('')
              }}
              aria-label={`Sub-department for ${staffName}`}
              className="px-2 py-1 bg-paper border border-hairline rounded-control text-sm text-ink disabled:opacity-50"
            >
              {schemes.map(s => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="font-mono text-mono-xs text-muted uppercase tracking-wide">Rank</span>
          <select
            value={rankId}
            disabled={pending || ranks.length === 0}
            onChange={e => setRankId(e.target.value)}
            aria-label={`Rank for ${staffName}`}
            className="px-2 py-1 bg-paper border border-hairline rounded-control text-sm text-ink disabled:opacity-50"
          >
            <option value="">— pick a rank —</option>
            {ranks.map(r => (
              <option key={r.id} value={r.id}>
                {r.label} · {r.rateLabel}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() =>
            accept(() =>
              enrolAndCompleteMove({
                managerId: state.offer.kind === 'enrol' ? state.offer.staffId : '',
                schemeId,
                rankId,
                moverId: state.moverId,
              }),
            )
          }
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Putting them on the ladder…' : `Put ${staffName} on the ladder`}
        </button>
      </div>

      {ranks.length === 0 ? (
        <p className="mt-2 font-serif italic text-xs">
          No ranks are set up for that sub-department yet, so there is no rung to put them on. Add
          one under Revenue → Rules → Ranks first.
        </p>
      ) : null}
    </div>
  )
}

/**
 * The schemes an enrolment may join, in a shape a picker can render.
 *
 * The label is the honest part. `ranksByScheme` is keyed by scheme id and this
 * page never loads the schemes' NAMES — `listSubDepartments()` is where those
 * live, and threading them down here means editing the page, which this change
 * does not. With one sub-department the picker is never rendered at all (the
 * caller defaults it silently), so the shortened id is only ever read the day a
 * second scheme exists. It is left visibly an id rather than dressed up as a
 * name, and recorded as work still owed.
 */
function schemeChoices(
  ranksByScheme: Record<string, RankOption[]> | null,
): Array<{ id: string; label: string }> {
  if (!ranksByScheme) return []
  return Object.keys(ranksByScheme)
    .sort((a, b) => a.localeCompare(b))
    .map(id => ({ id, label: `Sub-department ${id.slice(0, 8)}` }))
}
