'use client'

import { highlight } from '@/lib/report-search'

// Renders `text` with every occurrence of `query` wrapped in <mark>.
// The reports' sheet (SheetReport) draws every statement's hits with it, so a
// hit looks the same on every report.
export default function Highlight({ text, query }: { text: string; query: string }) {
  const parts = highlight(text, query)
  if (parts.length === 1 && !parts[0].hit) return <>{text}</>
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="search-hit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}
