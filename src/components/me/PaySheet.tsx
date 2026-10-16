'use client'

import { Button } from '@/components/ds/Button'
import { slipFile, slipLines, slipNote, slipSub, slipTitle } from '@/lib/me/pay'
import type { MePayslip } from '@/lib/me/types'
import { BottomSheet, useLast } from './kit'

/** A month's payslip (2026-10-17, the handoff's Payslip sheet): the table, its note, Download PDF · Close. */
export function PaySheet({ slip, onClose, onSaved }: { slip: MePayslip | null; onClose: () => void; onSaved: (m: string) => void }) {
  const p = useLast(slip)
  if (!p) return null
  const download = () => {
    // A GET download of one's own slip, drawn by the server (app/(portal)/my-payslip/[month]/route.tsx).
    const a = document.createElement('a')
    a.href = `/my-payslip/${p.month}`
    a.download = slipFile(p)
    document.body.appendChild(a)
    a.click()
    a.remove()
    onSaved(`Saved · ${slipFile(p)}`)
  }
  return (
    <BottomSheet open={!!slip} onClose={onClose} eyebrow="Payslip" title={slipTitle(p)} description={slipSub(p)}
      footer={<><Button variant="secondary" onClick={download}>Download PDF</Button><Button onClick={onClose}>Close</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, overflow: 'hidden' }}>
          {slipLines(p).map((l, i) => {
            const band = l.kind === 'band'
            return (
              <div key={`${l.label}${i}`} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '9px 12px', borderTop: i ? '1px solid var(--ds-border)' : 0,
                background: band ? 'var(--ds-surface-2)' : l.kind === 'net' ? 'var(--ds-accent-soft)' : 'transparent',
                fontSize: band ? 11 : l.kind === 'net' ? 15 : 13, fontWeight: l.kind === 'total' || l.kind === 'net' ? 500 : 400,
              }}>
                <span style={{ color: band ? 'var(--ds-ink-3)' : 'var(--ds-ink)' }}>{l.label}</span>
                <span style={{ fontFamily: 'var(--ds-font-body)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{l.value}</span>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ds-ink-2)', lineHeight: 1.45 }}>{slipNote(p)}</div>
      </div>
    </BottomSheet>
  )
}
