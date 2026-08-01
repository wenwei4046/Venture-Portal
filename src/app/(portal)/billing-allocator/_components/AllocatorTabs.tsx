'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { AllocatorData, TxnRow } from './types'
import CalculateTab from './CalculateTab'
import RecordsTab from './RecordsTab'
import StaffTab from './StaffTab'
import SetupTab from './SetupTab'

const TABS = [
  { key: 'calc', label: '计算 · Calculate' },
  { key: 'records', label: '记录 · Records' },
  { key: 'staff', label: '名单 · Staff' },
  { key: 'setup', label: '模板 · Setup' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function AllocatorTabs({ data }: { data: AllocatorData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = useState<TabKey>(data.txns.length > 0 ? 'records' : 'calc')
  // A record being corrected: Records' 改 loads it into Calculate; saving
  // there overwrites the original (same ALC number).
  const [editTxn, setEditTxn] = useState<TxnRow | null>(null)

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-md text-sm font-serif italic border transition-colors ${
                tab === t.key
                  ? 'bg-ink text-paper border-ink'
                  : 'bg-surface text-graphite border-hairline hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted font-sans">Period</span>
          <input
            type="month"
            value={data.period}
            onChange={(e) => e.target.value && router.push(`${pathname}?period=${e.target.value}`)}
            className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
      </div>

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
