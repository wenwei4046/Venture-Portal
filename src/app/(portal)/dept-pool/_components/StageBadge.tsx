// Visual stage indicator for dept_payment_requests. Shows where a request sits
// in the 4-stage flow (submit → Principal #1 → Finance PV → Principal #2 →
// paid) so dept_manager can see what they're waiting on without clicking
// through to approvals.

type Stage =
  | 'pending_principal_expense'
  | 'rejected_expense'
  | 'pending_finance_pv'
  | 'pending_principal_pv'
  | 'completed'
  | 'cancelled'

const STAGE_CONFIG: Record<
  Stage,
  { step: string; label: string; tone: 'pending' | 'success' | 'danger' | 'muted' }
> = {
  pending_principal_expense: {
    step: '1/3',
    label: 'Awaiting Principal approval',
    tone: 'pending',
  },
  pending_finance_pv: {
    step: '2/3',
    label: 'Awaiting Finance (generate PV)',
    tone: 'pending',
  },
  pending_principal_pv: {
    step: '3/3',
    label: 'Awaiting Principal (approve PV)',
    tone: 'pending',
  },
  completed: { step: '✓', label: 'Paid', tone: 'success' },
  rejected_expense: { step: '✕', label: 'Rejected by Principal', tone: 'danger' },
  cancelled: { step: '—', label: 'Cancelled', tone: 'muted' },
}

const TONE_CLASSES: Record<
  'pending' | 'success' | 'danger' | 'muted',
  string
> = {
  pending: 'bg-accent-bg text-accent border-accent-border',
  success: 'bg-ledger-bg text-ledger border-ledger',
  danger: 'bg-danger-bg text-danger border-danger',
  muted: 'bg-surface text-muted border-hairline',
}

interface Props {
  status: string
}

export default function StageBadge({ status }: Props) {
  const cfg = STAGE_CONFIG[status as Stage]
  if (!cfg) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border bg-surface text-muted border-hairline text-xs font-sans">
        {status}
      </span>
    )
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-sans ${TONE_CLASSES[cfg.tone]}`}
      title={cfg.label}
    >
      <span className="font-mono text-[10px] tabular opacity-70">{cfg.step}</span>
      <span className="font-serif italic">{cfg.label}</span>
    </span>
  )
}
