'use client'

import { Button } from '@/components/ds/Button'
import { DescriptionList } from '@/components/ds/Data'
import { Field, Textarea } from '@/components/ds/Field'
import type { WaitItem } from '@/lib/me/org'
import { BottomSheet, useLast } from './kit'

/**
 * What waits at your step (2026-10-17, the handoff's decision sheet): Amount · Reason · Balance · Route, a note
 * (needed to reject — the requester sees it), Reject · Approve (or "Approve · send to HR" when HR decides next).
 */
export function WaitSheet({ item, note, setNote, busy, onClose, onDecide }: {
  item: WaitItem | null
  note: string
  setNote: (v: string) => void
  busy: boolean
  onClose: () => void
  onDecide: (w: WaitItem, approve: boolean) => void
}) {
  const w = useLast(item)
  if (!w) return null
  return (
    <BottomSheet open={!!item} onClose={onClose} eyebrow={w.ref} title={w.who} description={`${w.title} · ${w.when}`}
      footer={<>
        <Button variant="secondary" disabled={!note.trim() || busy} onClick={() => onDecide(w, false)}>Reject</Button>
        <Button disabled={busy} onClick={() => onDecide(w, true)}>{w.toHR ? 'Approve · send to HR' : 'Approve'}</Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <DescriptionList labelWidth={90} items={[
          { label: 'Amount', value: w.amount },
          { label: 'Reason', value: w.reason },
          { label: 'Balance', value: w.balance || '—' },
          { label: 'Route', value: w.route },
        ]} />
        <Field label="Note" hint="Needed to reject. The requester sees it."><Textarea value={note} onChange={setNote} rows={2} /></Field>
      </div>
    </BottomSheet>
  )
}
