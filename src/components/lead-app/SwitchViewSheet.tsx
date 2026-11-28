'use client'

import { SWITCH_VIEWS, phoneWhere, type SwitchTarget } from '@/lib/view-switch'
import type { IconName } from './icons'
import { Sheet, TITLE, lv } from './parts'
import { Row } from './ProfileScreen'

const VIEW_ICON: Readonly<Record<SwitchTarget, IconName>> = {
  principal: 'house', finance: 'file', hr: 'userRound', marketing: 'megaphone', revenue_member: 'trendingUp', lead: 'inbox', person: 'eye',
}

/**
 * Profile › Switch view (the prototype's row opens nothing): every view of the one app, as every switcher lists them
 * (lib/view-switch.ts), each saying where it opens on a phone — this one "You are here".
 */
export default function SwitchViewSheet({ open, busy, onPick }: { open: boolean; busy: boolean; onPick: (to: SwitchTarget) => void }) {
  return (
    <Sheet open={open} label="Switch view" radius={26} maxHeight="80%">
      <span aria-hidden="true" style={{ alignSelf: 'center', flex: 'none', width: 40, height: 5, borderRadius: 3, background: lv('line') }} />
      <h2 style={{ ...TITLE, margin: 0, fontSize: 22, color: lv('fg') }}>Switch view</h2>
      <div style={{ borderRadius: 16, border: `1px solid ${lv('line')}`, overflow: 'hidden', opacity: busy ? 0.6 : 1 }}>
        {SWITCH_VIEWS.map((v, k) => (
          <Row key={v.value} first={k === 0}
            r={{ key: v.value, label: v.short, icon: VIEW_ICON[v.value], sub: v.value === 'lead' ? 'You are here' : phoneWhere(v.value, 'lead'), go: () => { if (!busy && v.value !== 'lead') onPick(v.value) } }} />
        ))}
      </div>
    </Sheet>
  )
}
