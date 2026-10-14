'use client'

import { useState } from 'react'
import { Button } from '@/components/ds/Button'
import { PanelHead, SidePanel } from '@/components/ds/Overlay'
import type { AttRequest } from '@/lib/attendance/types'

/**
 * A request's attachment, viewed (the handoff's `attOpen`, `HR
 * Attendance.dc.html` lines 196–217): 480px over the whole window, the page
 * on a 3:4 sheet that zooms 50–200% in quarter steps, Download at the foot.
 * The file itself is not kept by the portal yet, so the sheet says so.
 */
export function RequestAttachmentPanel({ req, kind, when, onClose, onDownload }: { req: AttRequest; kind: string; when: string; onClose: () => void; onDownload: () => void }) {
  const [zoom, setZoom] = useState(1)
  const sick = req.leaveCode === 'SL' || req.leaveCode === 'HL'
  return (
    <SidePanel open onClose={onClose} width={480}>
      <PanelHead eyebrow={`${req.ref} · attachment`} mono title={req.attachment ?? 'Attachment'} breakAll sub={`${req.who} · ${kind} · ${when}`} onClose={onClose} />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20, background: 'var(--ds-surface-2)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 400, aspectRatio: '3/4', boxSizing: 'border-box', borderRadius: 6, background: 'var(--ds-surface)', border: '1px solid var(--ds-border)', boxShadow: '0 2px 10px rgb(51 36 27 / .08)', display: 'grid', placeItems: 'center', transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--ds-ink-3)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{sick ? 'MC' : 'DOC'}</span>
            <span style={{ fontSize: 12.5 }}>Preview not available</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--ds-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Button variant="secondary" size="sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</Button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, width: 44, textAlign: 'center' }}>{`${Math.round(zoom * 100)}%`}</span>
          <Button variant="secondary" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.25))}>+</Button>
        </div>
        <Button variant="secondary" size="sm" onClick={onDownload}>Download</Button>
      </div>
    </SidePanel>
  )
}
