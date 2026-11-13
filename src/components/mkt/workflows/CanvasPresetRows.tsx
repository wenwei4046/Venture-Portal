'use client'

import type { CanvasCol } from '@/lib/marketing/canvas'
import c from './canvas.module.css'

// A table's preset rows (on the template): a cell filled in is fixed for the team, a blank one is theirs to fill in.

export const MAX_ROWS = 50

export default function CanvasPresetRows({ cols, rows, onChange }: { cols: readonly CanvasCol[]; rows: readonly string[][]; onChange: (rows: string[][]) => void }) {
  const set = (ri: number, ci: number, v: string) => onChange(rows.map((r, i) => (i === ri ? cols.map((_, j) => (j === ci ? v : r[j] ?? '')) : [...r])))
  return (
    <div className={c.popBox}>
      <span className={c.popQ}>Preset rows</span>
      {rows.map((r, ri) => (
        <div key={ri} className={c.presetRow}>
          {cols.map((col, ci) => (
            <input key={col.id} className={c.presetCell} value={r[ci] ?? ''} maxLength={200} placeholder={col.name || `Column ${ci + 1}`}
              aria-label={`Row ${ri + 1}, ${col.name || `Column ${ci + 1}`}`} onChange={e => set(ri, ci, e.target.value)} />
          ))}
          <button type="button" className={c.optX} aria-label={`Remove row ${ri + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== ri).map(x => [...x]))}>×</button>
        </div>
      ))}
      <button type="button" className={c.addField} disabled={rows.length >= MAX_ROWS || !cols.length}
        onClick={() => onChange([...rows.map(x => [...x]), cols.map(() => '')])}>+ Add row</button>
    </div>
  )
}
