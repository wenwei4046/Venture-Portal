'use client'

import { useEffect, useState } from 'react'
import { SlidingTabs } from '@/components/motion/SlidingTabs'
import type { AllocatorData, TxnRow } from './types'
import CalculateTab from './CalculateTab'
import RecordsTab from './RecordsTab'
import StaffTab from './StaffTab'
import SetupTab from './SetupTab'
import { useAllocatorShell } from './AllocatorShell'
import { landingTab, type AllocTab } from './landing-tab'

type TabKey = AllocTab

// One workspace per month. The month picker (AllocatorPeriod, in the page
// head) navigates by ?period= only, which keeps this client subtree mounted —
// so the landing tab (seeded from the month's records), a record being
// corrected and a half-typed Calculate draft all carried over into the next
// month. Keyed on the month the server rendered, the workspace starts fresh
// for it (a draft typed for one month is dropped rather than filed under
// another).
export default function AllocatorTabs({ data, initialEditId }: { data: AllocatorData; initialEditId?: string }) {
  return <AllocatorTabsBody key={data.period} data={data} initialEditId={initialEditId} />
}

function AllocatorTabsBody({ data, initialEditId }: { data: AllocatorData; initialEditId?: string }) {
  // A record arriving from its own page (2026-10-09, "Correct this record" →
  // ?edit=<id>): Calculate opens with it loaded — unless the month does not
  // hold it, or it is billed and so locked.
  const initialEdit = initialEditId ? data.txns.find((t) => t.id === initialEditId && !t.locked) ?? null : null
  // The page's shell holds the open tab when there is one (2026-10-10: the
  // head's Generate invoices shows while Records is open).
  const shell = useAllocatorShell()
  const [ownTab, setOwnTab] = useState<TabKey>(() => landingTab(data.txns, initialEditId))
  const tab = shell ? shell.tab : ownTab
  const setTab = shell ? shell.setTab : setOwnTab
  // A record being corrected: Records' Edit loads it into Calculate; saving
  // there overwrites the original (same ALC number).
  const [editTxn, setEditTxn] = useState<TxnRow | null>(initialEdit)

  // The address drops ?edit= once the record is loaded, so a reload or Back
  // does not open the correction a second time.
  useEffect(() => {
    if (!initialEditId || typeof window === 'undefined') return
    window.history.replaceState(window.history.state, '', `/billing-allocator?period=${data.period}`)
  }, [initialEditId, data.period])

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
