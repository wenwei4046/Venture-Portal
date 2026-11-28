'use client'

import { Sheet, TITLE, lv } from './parts'

/** The Brands sheet (LeadPhone.dc.html lines 385–393): All brands, then each brand, with its chats; a pick closes it. */
export default function BrandSheet({ open, pills, picked, onPick }: {
  open: boolean
  pills: Array<{ id: string; label: string; n: number }>
  picked: string
  onPick: (id: string) => void
}) {
  return (
    <Sheet open={open} label="Brands" radius={26}>
      <span aria-hidden="true" style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: lv('line') }} />
      <h2 style={{ ...TITLE, margin: 0, fontSize: 22, color: lv('fg') }}>Brands</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {pills.map(b => {
          const on = b.id === picked
          return (
            <button key={b.id} type="button" onClick={() => onPick(b.id)} aria-pressed={on}
              style={{ height: 44, padding: '0 16px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 500,
                background: on ? lv('sel') : lv('surface'), border: `1px solid ${on ? lv('sel-line') : lv('line')}`, color: lv('fg') }}>
              {b.label}<span style={{ color: lv('fg-4'), fontVariantNumeric: 'tabular-nums' }}>{b.n}</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
