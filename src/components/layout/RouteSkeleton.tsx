'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { skeletonHidden, skeletonShown } from '@/lib/nav-progress'
import { skeletonVariantFor, type SkeletonVariant } from '@/lib/route-skeleton'

// What every loading.tsx in the portal renders (2026-09-26).
//
// A loading boundary is what lets a navigation COMMIT the moment it is clicked:
// Next swaps the page for this and fetches the rest behind it, instead of
// holding the old page frozen until the server has answered — 0.2–1.4 s of a
// dead click on production for every page reached from inside its own section.
// `src/app/route-boundaries.test.ts` keeps one in every route folder that has
// child routes.
//
// It draws the page that is coming, not a generic block: the destination's
// pathname is already committed when a fallback shows, so the shape follows the
// route (lib/route-skeleton.ts), and the header and section heads are the real
// `.page-head` / `.sect-head` — the rule and its accent segment sit exactly where
// the page's own will, and only the words are still loading.
export default function RouteSkeleton() {
  const pathname = usePathname() ?? ''
  const variant = skeletonVariantFor(pathname)

  // Counted while on screen so the top progress line keeps running until the
  // page itself has landed (lib/nav-progress.ts). A layout effect, so the count
  // is in before the frame that shows the skeleton is painted.
  useLayoutEffect(() => {
    skeletonShown()
    return skeletonHidden
  }, [])

  return (
    <div className="route-skeleton" data-variant={variant} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Body variant={variant} />
    </div>
  )
}

function Body({ variant }: { variant: SkeletonVariant }) {
  switch (variant) {
    case 'detail':
      return <DetailBody />
    case 'form':
      return <FormBody />
    case 'board':
      return <BoardBody />
    default:
      return <LedgerBody />
  }
}

function Bar({ className }: { className: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}

function Head({ back = false, action = true }: { back?: boolean; action?: boolean }) {
  return (
    <div className="page-head">
      <div className="min-w-0">
        {back ? <Bar className="h-[10px] w-20 mb-4" /> : null}
        <Bar className="h-[11px] w-44 mb-[14px]" />
        <Bar className="h-[34px] w-72 max-w-[70vw]" />
      </div>
      {action ? <Bar className="h-9 w-32 rounded-md" /> : null}
    </div>
  )
}

function SectHead({ width = 'w-40' }: { width?: string }) {
  return (
    <div className="sect-head">
      <Bar className={`h-[18px] ${width}`} />
      <span className="rule" aria-hidden />
      <Bar className="h-[10px] w-14" />
    </div>
  )
}

// Cell widths per row — irregular on purpose: a ledger of identical bars reads
// as a pattern, not as rows of names and figures.
const CELL_WIDTHS = [
  ['w-[62%]', 'w-[80%]', 'w-[48%]', 'w-[40%]', 'w-[70%]'],
  ['w-[48%]', 'w-[64%]', 'w-[58%]', 'w-[34%]', 'w-[56%]'],
  ['w-[70%]', 'w-[72%]', 'w-[40%]', 'w-[44%]', 'w-[64%]'],
  ['w-[54%]', 'w-[88%]', 'w-[52%]', 'w-[30%]', 'w-[76%]'],
]

function Rows({ rows, cols = 5 }: { rows: number; cols?: number }) {
  const grid = { gridTemplateColumns: `1.1fr 1.6fr repeat(${cols - 2}, minmax(0, 1fr))` }
  return (
    <div className="rounded-md border border-hairline bg-surface overflow-hidden">
      <div className="grid gap-5 px-4 py-3 border-b border-hairline bg-surface-2" style={grid}>
        {Array.from({ length: cols }, (_, c) => (
          <Bar key={c} className={`h-[9px] w-16 ${c === cols - 1 ? 'justify-self-end' : ''}`} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-5 px-4 py-[13px] border-b border-hairline last:border-b-0" style={grid}>
          {Array.from({ length: cols }, (_, c) => (
            <Bar
              key={c}
              className={`h-3 ${CELL_WIDTHS[r % CELL_WIDTHS.length][c % 5]} ${c === cols - 1 ? 'justify-self-end' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function Figures({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 mb-10">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Bar className="h-[10px] w-24 mb-3" />
          <Bar className={`h-8 ${i === 0 ? 'w-44' : 'w-32'}`} />
        </div>
      ))}
    </div>
  )
}

function LedgerBody() {
  return (
    <>
      <Head />
      <Figures />
      <SectHead />
      <Rows rows={8} />
    </>
  )
}

function DetailBody() {
  return (
    <>
      <Head back />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
        <div className="lg:col-span-7 rounded-md border border-hairline bg-surface">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-6 px-4 py-[14px] border-b border-hairline last:border-b-0">
              <Bar className="h-[10px] w-28" />
              <Bar className={`h-3 ${i % 2 ? 'w-36' : 'w-48'}`} />
            </div>
          ))}
        </div>
        <div className="lg:col-span-5 rounded-md border border-hairline bg-surface p-5 space-y-4">
          <Bar className="h-[10px] w-24" />
          <Bar className="h-9 w-44" />
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-4/5" />
        </div>
      </div>
      <SectHead width="w-32" />
      <Rows rows={4} />
    </>
  )
}

function FormBody() {
  return (
    <>
      <Head action={false} />
      <div className="max-w-2xl space-y-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <Bar className={`h-[10px] mb-2.5 ${i % 3 === 1 ? 'w-36' : 'w-24'}`} />
            <div className="h-10 rounded-md border border-hairline bg-surface flex items-center px-3">
              <Bar className={`h-3 ${i % 2 ? 'w-1/3' : 'w-1/2'}`} />
            </div>
          </div>
        ))}
        <div className="flex gap-3 pt-2">
          <Bar className="h-9 w-28 rounded-md" />
          <div className="h-9 w-24 rounded-md border border-hairline" />
        </div>
      </div>
    </>
  )
}

// An org chart's silhouette: a root card, a row under it, a row under that.
const BOARD_CARDS = [
  { top: '8%', left: '42%' },
  { top: '36%', left: '14%' },
  { top: '36%', left: '42%' },
  { top: '36%', left: '70%' },
  { top: '66%', left: '6%' },
  { top: '66%', left: '24%' },
  { top: '66%', left: '62%' },
]

function BoardBody() {
  return (
    <>
      <Head />
      <div className="flex gap-2 mb-4">
        <Bar className="h-8 w-24 rounded-md" />
        <Bar className="h-8 w-20 rounded-md" />
        <Bar className="h-8 w-28 rounded-md" />
      </div>
      <div className="relative h-[62vh] min-h-[360px] rounded-md border border-hairline bg-surface-2 overflow-hidden">
        {BOARD_CARDS.map((card, i) => (
          <div key={i} className="absolute" style={card}>
            <Bar className="h-14 w-40 rounded-md" />
          </div>
        ))}
      </div>
    </>
  )
}
