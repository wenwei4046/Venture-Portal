'use client'

import { SegmentedControl } from '@/components/ds/Controls'
import { StatusChip } from '@/components/ds/Data'
import { DOC_SUBS, docRows, docSub, type DocRow, type DocTab } from '@/lib/me/docs'
import type { MyDocuments } from '@/lib/documentation/personal'
import { Icon, Title } from './kit'

/** Me › Documents (2026-10-17, the handoff's `isDocs`): Personal · Company, each a list that opens its sheet. */
export function DocumentsScreen({ docs, error, tab, setTab, open }: {
  docs: MyDocuments | null
  error: string | null
  tab: DocTab
  setTab: (t: DocTab) => void
  open: (r: DocRow) => void
}) {
  const rows = docRows(docs, tab)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Title title="Documents" sub={DOC_SUBS[tab]} />
      <SegmentedControl options={['Personal', 'Company']} value={tab} onChange={v => setTab(v as DocTab)} block />
      <div style={{ border: '1px solid var(--ds-border)', borderRadius: 12, overflow: 'hidden' }}>
        {rows.map((d, i) => (
          <button key={`${d.kind}:${d.id}`} type="button" className="me-hover" onClick={() => open(d)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: 0, borderTop: i ? '1px solid var(--ds-border)' : 0,
            background: 'var(--ds-surface)', textAlign: 'left', fontFamily: 'inherit', color: 'var(--ds-ink)', cursor: 'pointer',
          }}>
            <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 9, background: 'var(--ds-surface-2)', display: 'grid', placeItems: 'center' }}><Icon name="doc" size={18} stroke={1.6} /></span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14.5, fontWeight: 500 }}>{d.title}</span>
              <span style={{ fontSize: 12, color: 'var(--ds-ink-2)' }}>{docSub(d, tab)}</span>
            </span>
            {d.isNew ? <StatusChip tone="info">New</StatusChip> : null}
            <span style={{ color: 'var(--ds-ink-3)', fontSize: 16 }}>›</span>
          </button>
        ))}
        {rows.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: error ? 'var(--ds-danger)' : 'var(--ds-ink-2)' }}>
            {error ?? (docs ? 'Nothing here.' : 'Reading your documents…')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
