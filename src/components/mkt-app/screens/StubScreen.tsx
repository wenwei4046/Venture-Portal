'use client'

import { Shell } from './TaskScreen'
import s from '../mkt-app.module.css'

// A page the handoff does not draw for the phone (the builders, the Library, Tracking …): its own words — it is the
// computer's (the HR app's own "works best on a bigger screen" page, in the handoff's place).

export default function StubScreen({ emoji, label, onBack }: { emoji: string; label: string; onBack: () => void }) {
  return (
    <Shell title={label} onBack={onBack}>
      <div className={s.stub}>
        <span className={s.stubIcon}>{emoji}</span>
        <div className={s.stubLabel}>{label}</div>
        <div className={s.stubText}>This page isn&apos;t drawn for the phone yet.</div>
      </div>
    </Shell>
  )
}
