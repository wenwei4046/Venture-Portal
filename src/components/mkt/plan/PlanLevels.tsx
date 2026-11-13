'use client'

import { useEffect, useState } from 'react'
import { ASSIGN_ID, PIC_ID } from '@/lib/marketing/flow'
import type { PlanLevel } from '@/lib/marketing/plan'
import type { PickPerson } from '@/lib/marketing/tasks'
import s from './plan.module.css'

// A stage's approval on the Assignment Plan (Workflow Builder 2a — the Builder's levels, `Stage Settings.dc.html` ›
// Approval): up to three levels in turn, each one or more people (the managers and Directors, 🔗 the PIC on the link)
// — picked from a multi-select, each removable — and, with two or more, "Any one" or "Everyone". A person approves on
// one level only, the PIC once; a level left "picked at assignment" asks who. With two PICs, the PIC's level is either
// one's approval or both. Only the level touched changes: the others are sent back as they came.

export default function PlanLevels({ levels, editable, approvers, nameOf, pic, two, onChange }: {
  levels: PlanLevel[]
  editable: boolean
  approvers: PickPerson[]
  nameOf: (id: string) => string
  /** The PIC's name(s) — "Kelvin" or "Kelvin and Hana". */
  pic: string
  two: boolean
  onChange: (next: PlanLevel[]) => void
}) {
  // The level whose menu is open (levels.length: a new one).
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (open === null) return
    const close = () => setOpen(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const set = (k: number, lv: PlanLevel | null) => {
    const next = lv === null ? levels.filter((_, j) => j !== k) : k < levels.length ? levels.map((x, j) => (j === k ? lv : x)) : [...levels, lv]
    onChange(next)
  }
  const flip = (k: number, id: string) => {
    const lv: PlanLevel = levels[k] ?? { ids: [], rule: 'any' }
    // Picking somebody resolves "picked at assignment".
    const base = lv.ids.filter(x => x !== ASSIGN_ID)
    const ids = base.includes(id) ? base.filter(x => x !== id) : [...base, id]
    set(k, ids.length ? { ...lv, ids, ...(ids.includes(PIC_ID) ? {} : { picAll: undefined }) } : k < levels.length && lv.ids.includes(ASSIGN_ID) ? { ...lv, ids: [ASSIGN_ID] } : null)
  }
  const label = (id: string) => (id === PIC_ID ? `PIC · ${pic || 'the PIC'}` : nameOf(id))
  const opts = [...approvers.map(a => a.id), PIC_ID]

  return (
    <div className={s.apprs}>
      {!levels.length ? <span className={s.noAppr}>— No approval</span> : null}
      {levels.map((lv, k) => (
        <span key={k} className={s.apprWrap}>
          {k > 0 ? <span className={s.arrow}>→</span> : null}
          <span className={s.appr} aria-label={`Level ${k + 1}`}>
            <span className={s.levelN}>L{k + 1}</span>
            {lv.ids.map((id, n) => (
              <span key={id} className={s.levelWho}>
                {n > 0 ? <span className={s.levelJoin}>{lv.rule === 'all' ? '&' : 'or'}</span> : null}
                {id === ASSIGN_ID ? (
                  <button type="button" className={`${s.appr} ${s.apprPick}`} disabled={!editable}
                    onClick={e => { e.stopPropagation(); setOpen(k) }}>👤 Pick who approves</button>
                ) : (
                  <>
                    <span>{id === PIC_ID ? '🔗' : '👤'}</span>
                    <span className={s.apprName} title={label(id)}>{id === PIC_ID && two && lv.picAll ? `Both PICs · ${pic}` : label(id)}</span>
                    {editable ? <button type="button" className={s.apprX} aria-label={`Remove ${id === PIC_ID ? 'the PIC' : nameOf(id)}`} onClick={() => flip(k, id)}>×</button> : null}
                  </>
                )}
              </span>
            ))}
            {/* Two PICs: either one's approval, or both (the user's answer 29). */}
            {lv.ids.includes(PIC_ID) && two ? (
              <button type="button" className={`${s.apprToggle}${lv.picAll ? ` ${s.apprToggleOn}` : ''}`} aria-pressed={!!lv.picAll} disabled={!editable}
                aria-label={lv.picAll ? 'Both PICs approve — make it either' : 'Either PIC approves — make it both'}
                onClick={() => set(k, { ...lv, picAll: !lv.picAll })}>
                {lv.picAll ? 'Both' : 'Either'}
              </button>
            ) : null}
            {lv.ids.filter(id => id !== ASSIGN_ID).length > 1 ? (
              <span className={s.needs} role="radiogroup" aria-label={`Level ${k + 1} needs`}>
                {([['any', 'Any one'], ['all', 'Everyone']] as const).map(([r, text]) => (
                  <button key={r} type="button" role="radio" aria-checked={lv.rule === r} disabled={!editable}
                    className={`${s.needsBtn}${lv.rule === r ? ` ${s.needsOn}` : ''}`} onClick={() => set(k, { ...lv, rule: r })}>{text}</button>
                ))}
              </span>
            ) : null}
            {editable && !lv.ids.includes(ASSIGN_ID) ? (
              <button type="button" className={s.levelAdd} aria-label={`Add to level ${k + 1}`} onClick={e => { e.stopPropagation(); setOpen(o => (o === k ? null : k)) }}>+</button>
            ) : null}
            <span className={s.lockSmall} aria-hidden="true">🔒</span>
          </span>
        </span>
      ))}
      {editable && levels.length < 3 && !levels.some(l => l.ids.includes(ASSIGN_ID)) ? (
        <button type="button" className={s.addLevel} onClick={e => { e.stopPropagation(); setOpen(o => (o === levels.length ? null : levels.length)) }}>+ Level</button>
      ) : null}
      {open !== null ? (
        <div className={`${s.menu} ${s.menuNarrow}`} role="listbox" aria-multiselectable aria-label={`Level ${open + 1} approvers`} onClick={e => e.stopPropagation()}>
          <div className={s.menuHead}>Level {open + 1} · select one or more</div>
          {opts.map(id => {
            const on = (levels[open]?.ids ?? []).includes(id)
            const off = !on && levels.some((l, j) => j !== open && l.ids.includes(id))
            return (
              <button key={id} type="button" role="option" aria-selected={on} aria-disabled={off || undefined}
                className={`${s.opt}${on ? ` ${s.optOn}` : ''}${off ? ` ${s.optOff}` : ''}`} onClick={() => !off && flip(open, id)}>
                <span className={s.optCheck}>{on ? '✓' : ''}</span>
                <span>{id === PIC_ID ? '🔗' : '👤'}</span>
                <span className={s.optName}>{id === PIC_ID ? `PIC (${pic || 'the PIC'}) via link` : nameOf(id)}</span>
                {off ? <span className={s.optRole}>Already approves at another level</span> : null}
              </button>
            )
          })}
          <div className={s.menuWhy}>Approvers are always 🔒 and can&rsquo;t be passed on.</div>
        </div>
      ) : null}
    </div>
  )
}
