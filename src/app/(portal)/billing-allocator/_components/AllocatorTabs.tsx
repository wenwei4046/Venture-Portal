'use client'

import { useState } from 'react'
import { SlidingTabs } from '@/components/motion/SlidingTabs'
import type { AllocatorData, TxnRow } from './types'
import CalculateTab from './CalculateTab'
import RecordsTab from './RecordsTab'
import StaffTab from './StaffTab'
import SetupTab from './SetupTab'

type TabKey = 'calc' | 'records' | 'staff' | 'setup'

// One workspace per month. The month picker (AllocatorPeriod, in the page
// head) navigates by ?period= only, which keeps this client subtree mounted —
// so the landing tab (seeded from the month's records), a record being
// corrected and a half-typed Calculate draft all carried over into the next
// month. Keyed on the month the server rendered, the workspace starts fresh
// for it (a draft typed for one month is dropped rather than filed under
// another).
export default function AllocatorTabs({ data }: { data: AllocatorData }) {
  return <AllocatorTabsBody key={data.period} data={data} />
}

function AllocatorTabsBody({ data }: { data: AllocatorData }) {
  const [tab, setTab] = useState<TabKey>(data.txns.length > 0 ? 'records' : 'calc')
  // A record being corrected: Records' Edit loads it into Calculate; saving
  // there overwrites the original (same ALC number).
  const [editTxn, setEditTxn] = useState<TxnRow | null>(null)

  // The sheet's counted rail (2026-10-07): Records by the month's records,
  // Staff by the people on the list, Setup by the templates.
  const items = [
    { key: 'calc', label: 'Calculate' },
    { key: 'records', label: 'Records', count: data.txns.length },
    { key: 'staff', label: 'Staff', count: data.staff.filter((s) => s.status === 'active').length },
    { key: 'setup', label: 'Setup', count: data.templates.length },
  ]

  return (
    <div>
      <SlidingTabs items={items} active={tab} onTabChange={(key) => setTab(key as TabKey)} variant="control" />

      {tab === 'calc' ? (
        <CalculateTab
          data={data}
          editTxn={editTxn}
          onDoneEditing={() => setEditTxn(null)}
          onSaved={() => { setEditTxn(null); setTab('records') }}
        />
      ) : tab === 'records' ? (
        <RecordsTab data={data} onEdit={(t) => { setEditTxn(t); setTab('calc') }} />
      ) : tab === 'staff' ? (
        <StaffTab data={data} />
      ) : (
        <SetupTab data={data} />
      )}
    </div>
  )
}
