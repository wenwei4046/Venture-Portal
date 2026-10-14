'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { HvPage, PageHead } from '@/components/hrv/kit'
import { Button } from '@/components/ds/Button'
import { Card, ListItem, StatusChip } from '@/components/ds/Data'
import { readinessRows } from '@/lib/attendance/readiness'
import type { AttConfig, AttLedger } from '@/lib/attendance/types'

/**
 * HR › Attendance › Readiness (2026-10-15, the handoff's `isReady`): what has
 * to be true before people clock, checked again every month. Each row links
 * to its fix; a row with nothing to fix says OK.
 */
export default function ReadinessView({ config, ledger, today }: { config: AttConfig; ledger: AttLedger | null; today: string }) {
  const router = useRouter()
  const rows = useMemo(() => readinessRows(config, ledger, today), [config, ledger, today])
  const exportCsv = () => {
    const csv = ['Check,Detail,Fix', ...rows.map(r => [r.title, r.sub, r.fix?.label ?? 'OK'].map(v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv + '\n'], { type: 'text/csv' }))
    a.download = `Readiness_${today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <HvPage>
      <PageHead eyebrow="Attendance" title="Readiness" right={<Button variant="secondary" onClick={exportCsv}>Export</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 880, marginTop: 18 }}>
        <Card padding="none">
          {rows.map((r, i) => (
            <ListItem
              key={r.key}
              leading={<span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--ds-${r.tone})`, display: 'block' }} />}
              title={r.title}
              subtitle={r.sub}
              trailing={r.fix ? <Button variant="link" iconRight="chevRight" onClick={() => router.push(r.fix!.href)}>{r.fix.label}</Button> : <StatusChip tone="success">OK</StatusChip>}
              divider={i < rows.length - 1}
            />
          ))}
        </Card>
      </div>
    </HvPage>
  )
}
