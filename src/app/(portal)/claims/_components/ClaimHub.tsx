'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { BulkBar, BulkButton, HeadButton, HubCards, HubHead, hubStyles as hs } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { fd } from '@/components/finv/DrawerParts'
import { approveRequests, cancelRequest, saveRequest } from '@/lib/payment-requests/actions'
import {
  STAFF_ALL,
  approveCards,
  approveHero,
  approveLede,
  draftOf,
  draftPayload,
  payToWords,
  requestDay,
  rmOf,
  rowsOfApproveCard,
  rowsOfStaffCard,
  staffCards,
  staffHero,
  waitsForMe,
  whatOf,
  whereItIs,
  whereItIsNote,
  whoPaysWords,
  type ApprovalRead,
  type PaymentRequest,
} from '@/lib/payment-requests/model'
import { ClaimDrawer } from './ClaimDrawer'
import NewRequestDialog from './NewRequestDialog'
import { SendBackSheet } from './SendBackSheet'
import c from './claim.module.css'

// Claim (2026-10-29, PR ② of docs/module-spec-payment-requests.md — the agreed design's staff page): one's own requests
// only, claims and direct payments, in Payment voucher's hub — the head with + New request, the cards beside the list
// (All · Draft · With Finance · Rejected · Paid, as its filters), the table with its column tools, the drawer a row
// opens. The same page in every view (the Department view, Marketing's, HR's and Finance's own rows).
// PR ③: for a Claim & approve holder it is Claim & approve (the mockup's ②) — cards To approve · All {department} ·
// Mine, Select to approve or reject several at once, the drawer's Approve — send to Finance and Reject….

export const COLUMNS: FinColumn<PaymentRequest>[] = [
  { key: 'date', label: 'Date', kind: 'date', width: 112, value: (r) => requestDay(r), text: (r) => (requestDay(r) ? fd(requestDay(r)) : '—') },
  { key: 'what', label: 'What', kind: 'desc', fixed: true, width: 260, min: 140, value: (r) => whatOf(r).toLowerCase(), text: (r) => whatOf(r) },
  { key: 'where', label: 'Where it is', kind: 'chip', width: 200, value: (r) => whereItIs(r).text, text: (r) => whereItIs(r).text, chip: (r) => whereItIs(r) },
  // Who approves it, approved it or sent it back (PR ③) — the mockup's line under the chip.
  { key: 'note', label: 'By whom', kind: 'text', width: 200, value: (r) => (whereItIsNote(r) ?? '').toLowerCase(), text: (r) => whereItIsNote(r) ?? '—' },
  { key: 'ref', label: 'Ref #', kind: 'no', width: 140, value: (r) => r.requestNo ?? '', text: (r) => r.requestNo ?? '—' },
  { key: 'payTo', label: 'Pay to', kind: 'text', width: 200, value: (r) => payToWords(r).toLowerCase(), text: (r) => payToWords(r) },
  { key: 'whoPays', label: 'Who pays', kind: 'text', width: 180, value: (r) => whoPaysWords(r).toLowerCase(), text: (r) => whoPaysWords(r) },
  { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.total, text: (r) => rmOf(r.total) },
]
/** On show until the account arranges its own: the agreed Date · What · Amount · Where it is (and by whom). */
const DEFAULT_SHOWN = ['date', 'where', 'note'] as const

const KIND_WORD = { claim: 'Claim', direct_pay: 'Direct pay' } as const

/** Claim & approve's list: the mockup's Sent · From · What · Amount · Pay, and where each is. */
export const APPROVE_COLUMNS: FinColumn<PaymentRequest>[] = [
  { key: 'sent', label: 'Sent', kind: 'date', width: 112, value: (r) => requestDay(r), text: (r) => (requestDay(r) ? fd(requestDay(r)) : '—') },
  { key: 'from', label: 'From', kind: 'name', fixed: true, width: 170, min: 120, value: (r) => r.requesterName.toLowerCase(), text: (r) => r.requesterName },
  { key: 'what', label: 'What', kind: 'desc', fixed: true, width: 240, min: 140, value: (r) => whatOf(r).toLowerCase(), text: (r) => whatOf(r) },
  { key: 'pay', label: 'Pay', kind: 'text', width: 100, value: (r) => KIND_WORD[r.kind], text: (r) => KIND_WORD[r.kind] },
  ...COLUMNS.filter((col) => ['where', 'note', 'ref', 'payTo', 'whoPays'].includes(col.key)),
  { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.total, text: (r) => rmOf(r.total) },
]
const APPROVE_SHOWN = ['sent', 'pay', 'where', 'note'] as const

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

export default function ClaimHub({
  rows: initial,
  canCreate,
  viewingAs,
  readError,
  approval = null,
  me = '',
}: {
  rows: PaymentRequest[]
  canCreate: boolean
  /** Viewing as somebody: their own requests are theirs — nothing of the real account's is shown, nothing written. */
  viewingAs: boolean
  readError: string | null
  /** A Claim & approve holder's department (`payment_requests_for_approval`) — the page is Claim & approve. */
  approval?: ApprovalRead | null
  /** The reader's name, as the department's approvers list it. */
  me?: string
}) {
  const router = useRouter()
  const approving = approval !== null
  const [rows, setRows] = useState(initial)
  const [card, setCard] = useState<string>(approving ? 'to_approve' : STAFF_ALL)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  // The window: a new request, or the request it was opened on (kept as it was clicked — a refresh behind it changes nothing).
  const [editing, setEditing] = useState<{ request: PaymentRequest | null } | null>(null)
  const [cancelling, setCancelling] = useState<PaymentRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  // Claim & approve's Select, and the requests a Reject… is sending back.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sendingBack, setSendingBack] = useState<PaymentRequest[] | null>(null)

  // The server's rows, once a save or a refresh brings them.
  useEffect(() => setRows(initial), [initial])

  const cards = useMemo(() => (approval ? approveCards(approval, rows) : staffCards(rows)), [approval, rows])
  const hero = approval ? approveHero(approval) : staffHero(rows)
  const active = cards.find((x) => x.key === card) ?? cards[0]
  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      (approval ? rowsOfApproveCard(approval, rows, card) : rowsOfStaffCard(rows, card)).filter(
        (r) => !q || `${whatOf(r)} ${r.requestNo ?? ''} ${r.requesterName} ${payToWords(r)} ${whoPaysWords(r)}`.toLowerCase().includes(q),
      ),
    [approval, rows, card, q],
  )
  // One's own as the Claim page holds them; the department's as Claim & approve reads them.
  const all = useMemo(() => {
    const mine = new Map(rows.map((r) => [r.id, r]))
    return [...rows, ...(approval?.requests ?? []).filter((r) => !mine.has(r.id))]
  }, [rows, approval])
  const openRow = all.find((r) => r.id === open) ?? null

  // A notice's tap lands on /claims?open=<id>: that request's drawer, under the card that lists it.
  useEffect(() => {
    const asked = new URL(window.location.href).searchParams.get('open')
    const r = asked ? all.find((x) => x.id === asked) : null
    if (!r) return
    setOpen(r.id)
    if (approval) setCard(waitsForMe(r) ? 'to_approve' : r.mine ? 'mine' : 'department')
    else setCard(STAFF_ALL)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const put = (saved: PaymentRequest) => setRows((list) => (list.some((r) => r.id === saved.id) ? list.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...list]))

  const onSaved = (saved: PaymentRequest, sent: boolean) => {
    put(saved)
    setOpen(saved.id)
    flash(sent ? `${saved.requestNo ?? 'Request'} ${saved.status === 'pending_approval' ? 'sent for approval' : 'sent to Finance'}` : 'Saved as draft')
    router.refresh()
  }

  const submitDraft = async (r: PaymentRequest) => {
    const payload = draftPayload(draftOf(r), [], [])
    if (!payload || busy) return
    setBusy(true)
    setStepError(null)
    try {
      const res = await saveRequest(r.id, payload, true)
      if (!res.ok) return setStepError(res.reason)
      onSaved(res.data, true)
    } catch {
      setStepError('The request could not be sent. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!cancelling || busy) return
    setBusy(true)
    setStepError(null)
    try {
      const res = await cancelRequest(cancelling.id)
      if (!res.ok) return setStepError(res.reason)
      put(res.data)
      setCancelling(null)
      flash('Request cancelled')
      router.refresh()
    } catch {
      setStepError('The request could not be cancelled. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const decided = (words: string) => {
    flash(words)
    setSelected(new Set())
    setSelecting(false)
    setOpen(null)
    router.refresh()
  }

  const approve = async (list: PaymentRequest[]) => {
    if (busy || list.length === 0) return
    setBusy(true)
    setStepError(null)
    try {
      const res = await approveRequests(list.map((r) => r.id))
      if (!res.ok) {
        setStepError(res.reason)
        if (!open) flash(res.reason)
        return
      }
      decided(`${plural(res.data.approved, 'request')} approved — with Finance now`)
    } catch {
      setStepError('They could not be approved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const writes = canCreate && !viewingAs
  const decides = !!approval?.canApprove && !viewingAs
  const ticked = shown.filter((r) => selected.has(r.id))
  const toggle = (r: PaymentRequest) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(r.id)) next.delete(r.id)
      else if (waitsForMe(r)) next.add(r.id)
      return next
    })
  const toggleAll = (list: PaymentRequest[]) =>
    setSelected((prev) => (list.every((r) => prev.has(r.id)) ? new Set() : new Set(list.map((r) => r.id))))

  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead
        roman="I."
        eyebrow={approval ? `${approval.departmentName} · requests` : 'Your requests'}
        title={approval ? 'Claim & approve' : 'Claim'}
        actions={
          writes ? (
            <HeadButton primary onClick={() => setEditing({ request: null })}>
              + New request
            </HeadButton>
          ) : undefined
        }
      />
      {approval ? <p className={c.lede}>{approveLede(approval, me)}</p> : null}

      <div className={hs.hub}>
        <HubCards
          heroLabel={hero.label}
          heroValue={hero.value}
          cards={cards}
          active={active.key}
          onSelect={(k) => {
            setCard(k)
            setSelected(new Set())
            setSelecting(false)
          }}
        />
        <FinTable
          key={approval ? 'approve' : 'mine'}
          layoutId={approval ? 'claims.approve' : 'claims.mine'}
          title={approval ? active.label : active.key === STAFF_ALL ? 'All requests' : active.label}
          rows={shown}
          rowKey={(r) => r.id}
          columns={approval ? APPROVE_COLUMNS : COLUMNS}
          amountOf={(r) => r.total}
          faint={(r) => r.status === 'cancelled'}
          search={{ value: query, onChange: setQuery, placeholder: approval ? 'Search who, what, reference…' : 'Search what, reference, pay to…' }}
          activeKey={open}
          onRowClick={(r) => {
            setStepError(null)
            setOpen(r.id)
          }}
          tools={
            decides && card === 'to_approve' && shown.length > 0 ? (
              <button
                type="button"
                className={hs.toolBtn}
                data-on={selecting ? 'true' : undefined}
                onClick={() => {
                  setSelecting((v) => !v)
                  setSelected(new Set())
                }}
              >
                {selecting ? 'Done' : 'Select'}
              </button>
            ) : null
          }
          select={selecting ? { on: true, isSelected: (r) => selected.has(r.id), canSelect: waitsForMe, onToggle: toggle, onToggleAll: toggleAll } : null}
          emptyText={
            viewingAs
              ? 'Viewing as somebody — their requests are theirs to see.'
              : readError ??
                (approval && card === 'to_approve'
                  ? 'Nothing waits for your approval.'
                  : (approval ? shown.length : rows.length) === 0 && card !== 'to_approve'
                    ? 'No requests yet.'
                    : 'No requests here.')
          }
          defaultShown={approval ? APPROVE_SHOWN : DEFAULT_SHOWN}
        />
      </div>

      {selecting && ticked.length > 0 ? (
        <BulkBar text={`${ticked.length} selected · ${rmOf(ticked.reduce((t, r) => t + r.total, 0))}`} sub="Approved ones go to Finance · one reason for all you reject">
          <BulkButton onClick={() => setSelected(new Set())}>Clear</BulkButton>
          <BulkButton disabled={busy} onClick={() => setSendingBack(ticked)}>
            Reject…
          </BulkButton>
          <BulkButton primary disabled={busy} onClick={() => void approve(ticked)}>
            {busy ? 'Approving…' : `Approve ${ticked.length} →`}
          </BulkButton>
        </BulkBar>
      ) : null}

      <ClaimDrawer
        request={openRow}
        onClose={() => setOpen(null)}
        readOnly={!writes && !decides}
        onEdit={(r) => setEditing({ request: r })}
        onSubmit={(r) => void submitDraft(r)}
        onCancel={(r) => {
          setStepError(null)
          setCancelling(r)
        }}
        submitting={busy}
        error={cancelling || sendingBack ? null : stepError}
        decide={decides ? { onApprove: (r) => void approve([r]), onSendBack: (r) => setSendingBack([r]) } : null}
      />

      {writes ? <NewRequestDialog open={editing !== null} onClose={() => setEditing(null)} request={editing?.request ?? null} onSaved={onSaved} /> : null}

      <FinDialog open={cancelling !== null} onClose={() => !busy && setCancelling(null)} title="Cancel this request?" sub={cancelling?.requestNo ?? 'Draft'} locked={busy}>
        <DialogConfirm
          text={`Finance will not pay it${cancelling ? ` — ${rmOf(cancelling.total)}` : ''}. Its receipts stay with it.`}
          confirmLabel={busy ? 'Cancelling…' : 'Cancel request'}
          danger
          busy={busy}
          error={stepError}
          onCancel={() => setCancelling(null)}
          onConfirm={() => void cancel()}
        />
      </FinDialog>

      {decides ? (
        <SendBackSheet
          requests={sendingBack}
          onClose={() => setSendingBack(null)}
          onDone={(n) => {
            setSendingBack(null)
            decided(`${plural(n, 'request')} sent back to fix`)
          }}
        />
      ) : null}
    </div>
  )
}
