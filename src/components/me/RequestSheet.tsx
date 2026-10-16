'use client'

import { Button } from '@/components/ds/Button'
import { DescriptionList, StatusChip, type Tone } from '@/components/ds/Data'
import { requestFacts, requestTitle, requestWhen, trailOf, type TrailState } from '@/lib/me/requests'
import type { AttRequest } from '@/lib/attendance/types'
import type { MeData } from '@/lib/me/types'
import { BottomSheet, useLast } from './kit'

/**
 * A request of yours (2026-10-17, the handoff's request sheet): its facts and its audit trail — You · Sent ↑, then
 * each step ✓ approved, ● waiting, × rejected, · next or skipped. Cancel request while it waits.
 */

const MARK: Record<TrailState, { mark: string; bg: string; fg: string; border: string; tone: Tone; label: string }> = {
  sent: { mark: '↑', bg: 'var(--ds-surface-2)', fg: 'var(--ds-ink)', border: '0', tone: 'neutral', label: 'Sent' },
  approved: { mark: '✓', bg: 'var(--ds-accent)', fg: 'var(--ds-on-accent)', border: '0', tone: 'success', label: 'Approved' },
  waiting: { mark: '●', bg: 'var(--ds-surface)', fg: 'var(--ds-accent)', border: '1.5px solid var(--ds-accent)', tone: 'warning', label: 'Waiting' },
  rejected: { mark: '×', bg: 'var(--ds-danger-bg)', fg: 'var(--ds-danger)', border: '0', tone: 'danger', label: 'Rejected' },
  queued: { mark: '·', bg: 'var(--ds-surface)', fg: 'var(--ds-ink-3)', border: '1.5px solid var(--ds-border-strong)', tone: 'neutral', label: 'Next' },
  skipped: { mark: '·', bg: 'var(--ds-surface)', fg: 'var(--ds-ink-3)', border: '1.5px solid var(--ds-border-strong)', tone: 'neutral', label: 'Skipped' },
}

export function RequestSheet({ request, data, myName, busy, onClose, onCancel }: {
  request: AttRequest | null
  data: MeData
  myName: string
  busy: boolean
  onClose: () => void
  onCancel: (r: AttRequest) => void
}) {
  const r = useLast(request)
  if (!r) return null
  return (
    <BottomSheet open={!!request} onClose={onClose} eyebrow={r.ref} title={requestTitle(r, data.leaveTypes)} description={requestWhen(r)}
      footer={<>{r.status === 'pending' ? <Button variant="secondary" disabled={busy} onClick={() => onCancel(r)}>Cancel request</Button> : null}<Button onClick={onClose}>Close</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DescriptionList items={requestFacts(r, data)} labelWidth={90} />
        <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ds-ink-3)' }}>Audit trail</div>
        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--ds-border)', borderRadius: 12, overflow: 'hidden' }}>
          {trailOf(r, myName).map((st, i) => {
            const v = MARK[st.state]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderTop: i ? '1px solid var(--ds-border)' : 0 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, flex: 'none', background: v.bg, color: v.fg, border: v.border, boxSizing: 'border-box' }}>{v.mark}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{st.role} · {st.who}</div>
                  <div style={{ fontSize: 12, color: 'var(--ds-ink-2)', marginTop: 2 }}>{st.at}</div>
                </div>
                <StatusChip tone={v.tone}>{v.label}</StatusChip>
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
