'use client'

import { Button } from '@/components/ds/Button'
import { DescriptionList } from '@/components/ds/Data'
import { docFacts, type DocRow, type DocTab } from '@/lib/me/docs'
import { BottomSheet, useLast } from './kit'

/** A document's sheet (2026-10-17, the handoff's doc sheet): From · Date · Kept and its note; View · Download. */
export function DocSheet({ doc, tab, onClose, onView, onDownload }: {
  doc: DocRow | null
  tab: DocTab
  onClose: () => void
  onView: (d: DocRow) => void
  onDownload: (d: DocRow) => void
}) {
  const d = useLast(doc)
  if (!d) return null
  const f = docFacts(d, tab)
  return (
    <BottomSheet open={!!doc} onClose={onClose} eyebrow={f.eyebrow} title={d.title} description={`${d.ext} · ${d.size}`}
      footer={<><Button variant="secondary" onClick={() => onView(d)}>View</Button><Button onClick={() => onDownload(d)}>Download</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <DescriptionList items={f.facts} labelWidth={90} />
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ds-ink-2)' }}>{f.note}</div>
      </div>
    </BottomSheet>
  )
}
