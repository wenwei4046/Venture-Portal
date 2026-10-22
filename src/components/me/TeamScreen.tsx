'use client'

import { StatusChip } from '@/components/ds/Data'
import type { TeamRow, WaitItem } from '@/lib/me/org'
import { Avatar, Label, ListCard, ListItem, Title } from './kit'

/** Me › My team today (2026-10-17, the handoff's `isTeam`): times, place and flags — photos stay with HR — and what waits for you. */
export function TeamScreen({ rows, waiting, openWait }: { rows: TeamRow[]; waiting: WaitItem[]; openWait: (w: WaitItem) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Title title="My team today" sub="You see times, place and flags. Photos stay with HR." />
      <ListCard>
        {rows.map(m => (
          <ListItem key={m.id} leading={<Avatar name={m.name} size={36} />} title={m.name} subtitle={m.sub} chevron={false}
            trailing={m.chip ? <StatusChip tone={m.chip[0]}>{m.chip[1]}</StatusChip> : null} />
        ))}
        {rows.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ds-ink-2)' }}>Nobody reports to you.</div> : null}
      </ListCard>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label>Waiting for you · {waiting.length}</Label>
        <ListCard>
          {waiting.map(w => (
            <ListItem key={w.id} leading={<Avatar name={w.who} size={36} />} title={w.who} subtitle={`${w.title} · ${w.when}`} meta={w.amount} onClick={() => openWait(w)} />
          ))}
          {waiting.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ds-ink-2)' }}>Nothing waiting.</div> : null}
        </ListCard>
      </div>
    </div>
  )
}
