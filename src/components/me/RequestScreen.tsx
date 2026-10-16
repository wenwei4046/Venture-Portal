'use client'

import { SegmentedControl } from '@/components/ds/Controls'
import { StatusChip } from '@/components/ds/Data'
import { correctionSub, mpRouteShort, otRouteShort } from '@/lib/me/forms'
import { filtered, type Filter } from '@/lib/me/leave'
import { meStatus, requestTitle, requestWhen } from '@/lib/me/requests'
import type { AttRequest } from '@/lib/attendance/types'
import type { MeData } from '@/lib/me/types'
import { Label, ListCard, ListItem, Title } from './kit'

/**
 * Me › Submit request (2026-10-17, the handoff's `isReq`): Overtime, Correct a punch, Extra manpower — each with its
 * glyph tile — then everything you sent, filtered All · Waiting · Decided.
 */

function Glyph({ i, children }: { i: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <span style={{ width: 36, height: 36, borderRadius: 10, background: `var(--me-tile-${i}-bg)`, color: `var(--me-tile-${i})`, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    </span>
  )
}

export const OT_GLYPH = <Glyph i={1}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5" /><path d="M9 2h6" /><path d="M12 2v3" /></Glyph>
export const CR_GLYPH = <Glyph i={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="M19 3l2 2-5 5-2.5.5.5-2.5z" /></Glyph>
export const MP_GLYPH = <Glyph i={3}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5c2 .8 3 2.8 3 5.5" /></Glyph>

export function RequestScreen({ data, filter, setFilter, openOT, openCR, openMP, openRequest }: {
  data: MeData
  filter: Filter
  setFilter: (f: Filter) => void
  openOT: () => void
  openCR: () => void
  openMP: () => void
  openRequest: (r: AttRequest) => void
}) {
  const list = filtered(data.requests, filter)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Title title="Submit request" sub="Overtime, punch corrections and extra manpower. Leave has its own page." />
      <ListCard>
        <ListItem leading={OT_GLYPH} title="Overtime" subtitle={`Ask before you work it · ${otRouteShort(data)}`} onClick={openOT} />
        <ListItem leading={CR_GLYPH} title="Correct a punch" subtitle={correctionSub(data)} onClick={openCR} />
        <ListItem leading={MP_GLYPH} title="Extra manpower" subtitle={`Promoters, helpers or drivers for a fair · ${mpRouteShort(data)}`} divider={false} onClick={openMP} />
      </ListCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Label>Status · everything you sent</Label>
        <SegmentedControl options={['All', 'Waiting', 'Decided']} value={filter} onChange={v => setFilter(v as Filter)} block />
        <ListCard>
          {list.map(r => {
            const [tone, word] = meStatus(r)
            return <ListItem key={r.id} title={requestTitle(r, data.leaveTypes)} subtitle={requestWhen(r)} trailing={<StatusChip tone={tone}>{word}</StatusChip>} onClick={() => openRequest(r)} />
          })}
          {list.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ds-ink-2)' }}>Nothing here.</div> : null}
        </ListCard>
      </div>
    </div>
  )
}
