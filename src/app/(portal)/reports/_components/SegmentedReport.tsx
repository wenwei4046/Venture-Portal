'use client'

import { useMemo, useState, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

export interface ReportSegment {
  key: string
  label: string
  panel: React.ReactNode
}

export function SegmentedReport({
  segments,
  defaultKey,
}: {
  segments: ReportSegment[]
  defaultKey: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const validKeys = useMemo(() => new Set(segments.map((s) => s.key)), [segments])
  const urlSeg = searchParams.get('seg')
  const initial = urlSeg && validKeys.has(urlSeg) ? urlSeg : defaultKey
  const [active, setActive] = useState(initial)

  // If the URL seg is stale (period changed, pool gone), snap back.
  const effective = validKeys.has(active) ? active : defaultKey

  const select = useCallback(
    (key: string) => {
      setActive(key)
      const params = new URLSearchParams(searchParams.toString())
      params.set('seg', key)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const activePanel = segments.find((s) => s.key === effective)?.panel ?? null

  return (
    <div>
      <div
        role="tablist"
        className="sticky top-0 z-10 -mx-1 mb-8 flex flex-wrap gap-x-1 border-b border-hairline bg-paper/95 backdrop-blur-sm"
      >
        {segments.map((s) => {
          const on = s.key === effective
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`seg-tab-${s.key}`}
              aria-selected={on}
              aria-controls="seg-panel"
              onClick={() => select(s.key)}
              className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] border-b-2 transition-colors ${
                on
                  ? 'text-ink border-accent font-semibold'
                  : 'text-graphite border-transparent hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id="seg-panel" aria-labelledby={`seg-tab-${effective}`}>
        {activePanel}
      </div>
    </div>
  )
}
