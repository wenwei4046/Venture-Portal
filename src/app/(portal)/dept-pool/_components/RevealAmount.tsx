'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// One toggle controls the whole Balance column. Collapsed (hidden) by default;
// click the header triangle to reveal every balance at once, click again to hide.
const BalanceCtx = createContext<{ shown: boolean; toggle: () => void } | null>(null)

export function BalanceProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false) // default collapsed
  return (
    <BalanceCtx.Provider value={{ shown, toggle: () => setShown((s) => !s) }}>
      {children}
    </BalanceCtx.Provider>
  )
}

// Header label with a disclosure triangle — ▶ points right when collapsed and
// rotates down when the column is expanded.
export function BalanceToggle({ label }: { label: string }) {
  const ctx = useContext(BalanceCtx)
  if (!ctx) return <>{label}</>
  return (
    <button
      type="button"
      onClick={ctx.toggle}
      title={ctx.shown ? '点击隐藏整列余额 · hide all' : '点击显示整列余额 · reveal all'}
      className="inline-flex items-center gap-1.5 cursor-pointer hover:text-ink transition-colors uppercase"
    >
      <span
        aria-hidden
        className={`text-[9px] leading-none transition-transform duration-150 ${ctx.shown ? 'rotate-90' : ''}`}
      >
        ▶
      </span>
      {label}
    </button>
  )
}

// A balance value that follows the column's shown/hidden state.
export function BalanceValue({ text }: { text: string }) {
  const ctx = useContext(BalanceCtx)
  const shown = ctx?.shown ?? false
  return <span className="font-mono tabular">{shown ? text : '••••••'}</span>
}
