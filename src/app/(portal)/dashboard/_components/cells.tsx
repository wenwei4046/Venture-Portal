import { formatMoneyBare } from '@/lib/utils'

// The treasury Overview's small cells, shared by the page (drawn on the
// server) and its sheet tables (drawn in the browser) — no directive, so each
// side takes its own copy.

/** What kind of request a row is — a label, not a status, so no colour. */
export function RequestChip({ type }: { type: string }) {
  return <span className="chip whitespace-nowrap">{requestLabel(type)}</span>
}

export function requestLabel(type: string): string {
  return type.replace(/_/g, ' ')
}

/** A decided request: approved in green, anything else (rejected) in red. */
export function DecisionChip({ decision }: { decision: string }) {
  return (
    <span className={`${decision === 'approved' ? 'chip ledger' : 'chip danger'} whitespace-nowrap`}>
      <span className="dot" />
      {decision}
    </span>
  )
}

/** A net position: a dash at zero, green and signed when HV owes, red in
 *  brackets when HV is owed. */
export function SignedFigure({ value }: { value: number }) {
  if (value === 0) return <>—</>
  if (value > 0) {
    return <span className="text-ledger font-semibold">+{formatMoneyBare(value)}</span>
  }
  return <span className="text-danger font-semibold neg">{formatMoneyBare(value)}</span>
}

/** The words a net position is filtered by — the figure as it reads. */
export function signedText(value: number): string {
  if (value === 0) return '—'
  return value > 0 ? `+${formatMoneyBare(value)}` : formatMoneyBare(value)
}

// A position is a word on a wash: green when HV owes the subsidiary, amber
// when the subsidiary owes HV, plain when they are even.
export function PositionLabel({ position }: { position: 'creditor' | 'debtor' | 'even' }) {
  if (position === 'creditor') {
    return (
      <span className="chip ledger" title="HV owes this subsidiary">
        <span className="dot" />
        creditor
      </span>
    )
  }
  if (position === 'debtor') {
    return (
      <span className="chip alert" title="Subsidiary owes HV">
        <span className="dot" />
        debtor
      </span>
    )
  }
  return (
    <span className="chip">
      <span className="dot" />
      even
    </span>
  )
}

/** Which way an instalment's money goes: in from a borrower, out to a lender. */
export function DirectionChip({ kind }: { kind: 'collect' | 'pay' }) {
  return kind === 'collect' ? (
    <span className="chip ledger whitespace-nowrap">
      <span className="dot" />↓ collect
    </span>
  ) : (
    <span className="chip accent whitespace-nowrap">
      <span className="dot" />↑ pay
    </span>
  )
}

export function directionLabel(kind: 'collect' | 'pay'): string {
  return kind === 'collect' ? '↓ collect' : '↑ pay'
}
