'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { HeadButton, HubCards, HubHead, hubStyles as hs } from '@/components/finv/Hub'
import { FinTable, type FinColumn } from '@/components/finv/FinTable'
import { fd } from '@/components/finv/DrawerParts'
import { cancelRequest, saveRequest } from '@/lib/payment-requests/actions'
import {
  STAFF_ALL,
  draftOf,
  draftPayload,
  payToWords,
  requestDay,
  rmOf,
  rowsOfStaffCard,
  staffCards,
  staffHero,
  whatOf,
  whereItIs,
  whoPaysWords,
  type PaymentRequest,
} from '@/lib/payment-requests/model'
import { ClaimDrawer } from './ClaimDrawer'
import NewRequestDialog from './NewRequestDialog'

// Claim (2026-10-29, PR ② of docs/module-spec-payment-requests.md — the agreed design's staff page): one's own requests
// only, claims and direct payments, in Payment voucher's hub — the head with + New request, the cards beside the list
// (All · Draft · With Finance · Rejected · Paid, as its filters), the table with its column tools, the drawer a row
// opens. The same page in every view (the Department view, Marketing's, HR's and Finance's own rows).

export const COLUMNS: FinColumn<PaymentRequest>[] = [
  { key: 'date', label: 'Date', kind: 'date', width: 112, value: (r) => requestDay(r), text: (r) => (requestDay(r) ? fd(requestDay(r)) : '—') },
  { key: 'what', label: 'What', kind: 'desc', fixed: true, width: 260, min: 140, value: (r) => whatOf(r).toLowerCase(), text: (r) => whatOf(r) },
  { key: 'where', label: 'Where it is', kind: 'chip', width: 200, value: (r) => whereItIs(r).text, text: (r) => whereItIs(r).text, chip: (r) => whereItIs(r) },
  { key: 'ref', label: 'Ref #', kind: 'no', width: 140, value: (r) => r.requestNo ?? '', text: (r) => r.requestNo ?? '—' },
  { key: 'payTo', label: 'Pay to', kind: 'text', width: 200, value: (r) => payToWords(r).toLowerCase(), text: (r) => payToWords(r) },
  { key: 'whoPays', label: 'Who pays', kind: 'text', width: 180, value: (r) => whoPaysWords(r).toLowerCase(), text: (r) => whoPaysWords(r) },
  { key: 'amount', label: 'Amount', kind: 'amount', fixed: true, width: 130, value: (r) => r.total, text: (r) => rmOf(r.total) },
]
/** On show until the account arranges its own: the agreed Date · What · Amount · Where it is. */
const DEFAULT_SHOWN = ['date', 'where'] as const

export default function ClaimHub({
  rows: initial,
  canCreate,
  viewingAs,
  readError,
}: {
  rows: PaymentRequest[]
  canCreate: boolean
  /** Viewing as somebody: their own requests are theirs — nothing of the real account's is shown, nothing written. */
  viewingAs: boolean
  readError: string | null
}) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [card, setCard] = useState<string>(STAFF_ALL)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  // The window: a new request, or the request it was opened on (kept as it was clicked — a refresh behind it changes nothing).
  const [editing, setEditing] = useState<{ request: PaymentRequest | null } | null>(null)
  const [cancelling, setCancelling] = useState<PaymentRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  // The server's rows, once a save or a refresh brings them.
  useEffect(() => setRows(initial), [initial])

  const cards = useMemo(() => staffCards(rows), [rows])
  const hero = staffHero(rows)
  const active = cards.find((c) => c.key === card) ?? cards[0]
  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () => rowsOfStaffCard(rows, card).filter((r) => !q || `${whatOf(r)} ${r.requestNo ?? ''} ${payToWords(r)} ${whoPaysWords(r)}`.toLowerCase().includes(q)),
    [rows, card, q],
  )
  const openRow = rows.find((r) => r.id === open) ?? null

  const put = (saved: PaymentRequest) => setRows((all) => (all.some((r) => r.id === saved.id) ? all.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...all]))

  const onSaved = (saved: PaymentRequest, sent: boolean) => {
    put(saved)
    setOpen(saved.id)
    flash(sent ? `${saved.requestNo ?? 'Request'} sent to Finance` : 'Saved as draft')
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

  const writes = canCreate && !viewingAs
  return (
    <div className={hs.root} data-fin-kit="">
      <HubHead
        roman="I."
        eyebrow="Your requests"
        title="Claim"
        actions={
          writes ? (
            <HeadButton primary onClick={() => setEditing({ request: null })}>
              + New request
            </HeadButton>
          ) : undefined
        }
      />

      <div className={hs.hub}>
        <HubCards heroLabel={hero.label} heroValue={hero.value} cards={cards} active={active.key} onSelect={setCard} />
        <FinTable
          layoutId="claims.mine"
          title={active.key === STAFF_ALL ? 'All requests' : active.label}
          rows={shown}
          rowKey={(r) => r.id}
          columns={COLUMNS}
          amountOf={(r) => r.total}
          faint={(r) => r.status === 'cancelled'}
          search={{ value: query, onChange: setQuery, placeholder: 'Search what, reference, pay to…' }}
          activeKey={open}
          onRowClick={(r) => {
            setStepError(null)
            setOpen(r.id)
          }}
          emptyText={
            viewingAs
              ? 'Viewing as somebody — their requests are theirs to see.'
              : readError ?? (rows.length === 0 ? 'No requests yet.' : 'No requests here.')
          }
          defaultShown={DEFAULT_SHOWN}
        />
      </div>

      <ClaimDrawer
        request={openRow}
        onClose={() => setOpen(null)}
        readOnly={!writes}
        onEdit={(r) => setEditing({ request: r })}
        onSubmit={(r) => void submitDraft(r)}
        onCancel={(r) => {
          setStepError(null)
          setCancelling(r)
        }}
        submitting={busy}
        error={cancelling ? null : stepError}
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
    </div>
  )
}
