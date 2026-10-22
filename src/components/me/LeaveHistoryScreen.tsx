'use client'

import { SegmentedControl } from '@/components/ds/Controls'
import { StatusChip } from '@/components/ds/Data'
import { monthLabel } from '@/lib/attendance/engine'
import { fmtN } from '@/lib/me/format'
import { historyGroups, type Filter } from '@/lib/me/leave'
import { meStatus, requestAmount, requestTitle, requestWhen } from '@/lib/me/requests'
import type { AttRequest } from '@/lib/attendance/types'
import type { MeData } from '@/lib/me/types'
import { Label, ListCard, ListItem, NUM, Title } from './kit'

/** Me › Leave › History (2026-10-17, the handoff's `isLvHist`): everything sent, by the month sent, with its days. */
export function LeaveHistoryScreen({ data, filter, setFilter, openRequest }: {
  data: MeData
  filter: Filter
  setFilter: (f: Filter) => void
  openRequest: (r: AttRequest) => void
}) {
  const groups = historyGroups(data, filter)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Title title="Leave history" sub="Everything you have sent · tap one for its audit trail" />
      <SegmentedControl options={['All', 'Waiting', 'Decided']} value={filter} onChange={v => setFilter(v as Filter)} block />
      {groups.map(g => (
        <div key={g.month} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Label>{monthLabel(g.month)}</Label>
            <span style={{ ...NUM, fontSize: 11, color: 'var(--ds-ink-3)' }}>{fmtN(g.total)} d</span>
          </div>
          <ListCard>
            {g.rows.map(r => {
              const [tone, word] = meStatus(r)
              return (
                <ListItem key={r.id} title={requestWhen(r)} subtitle={`${requestTitle(r, data.leaveTypes)} · ${requestAmount(r, data)}`}
                  trailing={<StatusChip tone={tone}>{word}</StatusChip>} onClick={() => openRequest(r)} />
              )
            })}
          </ListCard>
        </div>
      ))}
      {groups.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ds-ink-2)', border: '1px solid var(--ds-border)', borderRadius: 12 }}>Nothing here.</div> : null}
    </div>
  )
}
