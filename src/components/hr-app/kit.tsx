'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { HrIcon } from '@/components/hrv/icons'
import type { HrIconName } from '@/components/hrv/icons'
import s from './hr-app.module.css'

/**
 * The HR app's pieces (2026-10-17, the handoff `design_handoff_hr_mobile`): every value the prototype's inline style
 * (`source/HR Mobile.dc.html`), named once here — the section head, the white card and its rows, the facts card, the
 * pills, the count tiles, the chips, the approval flow's nodes, the bottom sheet and the toast.
 */

export const MONO: CSSProperties = { fontFamily: 'var(--font-mono), "Chivo Mono", Menlo, monospace' }

export type Tone = 'clay' | 'slate' | 'olive' | 'gold' | 'walnut'
export const toneOf = (t: Tone) => ({ bg: `rgb(var(--tone-${t}))`, fg: `rgb(var(--tone-${t}-deep))` })

export function Icon({ name, size = 16 }: { name: HrIconName; size?: number }) {
  return <HrIcon name={name} size={size} />
}

/** "QUICK ACTIONS ———— 3": the label, a line filling the rest, a mono count. */
export function SectHead({ label, roman, romanFg, count }: { label: string; roman?: string; romanFg?: string; count?: string | number }) {
  return (
    <div className={s.sectHead}>
      <span className={s.sectLabel}>{roman ? <span style={{ color: romanFg, fontWeight: 600 }}>{roman}</span> : null}{roman ? ' ' : ''}{label}</span>
      <span className={s.sectLine} />
      {count != null && count !== '' ? <span className={s.sectCount} style={MONO}>{count}</span> : null}
    </div>
  )
}

/** The white card a list sits in (radius 14). */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className={s.card} style={style}>{children}</div>
}

/** A person's 36px square: the name's tone, the deep tone's initials (12/600). */
export function Avatar({ bg, fg, ini, size = 36, radius = 9, font = 12, children }: { bg: string; fg: string; ini?: string; size?: number; radius?: number; font?: number; children?: ReactNode }) {
  return (
    <span className={s.avatar} style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, fontSize: font }}>
      {children ?? ini}
    </span>
  )
}

/** A list row: the avatar (or an icon tile), the title and its line, and what sits on the right. */
export function Row({ first, lead, title, sub, right, onClick, minH = 56, pad = '10px 14px', gap = 1, label }: {
  first: boolean
  lead: ReactNode
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  onClick?: () => void
  minH?: number
  pad?: string
  gap?: number
  label?: string
}) {
  return (
    <button type="button" className={s.row} onClick={onClick} aria-label={label} style={{ minHeight: minH, padding: pad, borderTop: first ? 0 : '1px solid var(--ds-border)' }}>
      {lead}
      <span className={s.rowText} style={{ gap }}>
        <span className={s.rowTitle}>{title}</span>
        {sub != null && sub !== '' ? <span className={s.rowSub}>{sub}</span> : null}
      </span>
      {right}
    </button>
  )
}

/** A pill chip: "Late 12m", "Approved". */
export function Chip({ text, bg, fg, pad = '3px 9px', size = 11.5 }: { text: string; bg: string; fg: string; pad?: string; size?: number }) {
  return <span className={s.chip} style={{ background: bg, color: fg, padding: pad, fontSize: size }}>{text}</span>
}

/** The facts card: label on the left, value on the right, a hairline between. */
export function Facts({ items, pad = '10px 0' }: { items: ReadonlyArray<{ k: string; v: ReactNode; mono?: boolean }>; pad?: string }) {
  return (
    <div className={s.facts}>
      {items.map((x, i) => (
        <div key={x.k} className={s.fact} style={{ padding: pad, borderTop: i ? '1px solid var(--ds-border)' : 0 }}>
          <span className={s.factK}>{x.k}</span>
          <span className={s.factV} style={x.mono ? MONO : undefined}>{x.v}</span>
        </div>
      ))}
    </div>
  )
}

/** Pills: Pending · At upline · Decided — the picked one an accent ring on the peach. `fill` spreads them across. */
export function Pills<K extends string>({ items, value, onPick, fill = false, height = 38 }: {
  items: ReadonlyArray<{ k: K; label: string; n?: number | string }>
  value: K
  onPick: (k: K) => void
  fill?: boolean
  height?: number
}) {
  return (
    <div className={fill ? s.pillsFill : s.pills}>
      {items.map(p => {
        const on = p.k === value
        return (
          <button key={p.k} type="button" className={s.pill} onClick={() => onPick(p.k)} aria-pressed={on}
            style={{ height, flex: fill ? 1 : 'none', padding: fill ? 0 : '0 14px', justifyContent: fill ? 'center' : undefined, borderColor: on ? 'var(--hr2-accent)' : 'var(--ds-border)', background: on ? 'var(--hr2-pill-on)' : 'var(--ds-surface)' }}>
            {p.label}{fill ? null : ' '}<span className={s.pillN} style={MONO}>{p.n ?? ''}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The count tiles: a top border in the state's colour, the figure in mono. */
export function Tiles({ items, cols = 3, size = 18 }: { items: ReadonlyArray<{ n: string; label: string; c: string; on?: boolean; onClick?: () => void }>; cols?: number; size?: number }) {
  return (
    <div className={s.tiles} style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
      {items.map(t => {
        const body = (
          <>
            <span className={s.tileN} style={{ ...MONO, fontSize: size }}>{t.n}</span>
            <span className={s.tileL}>{t.label}</span>
          </>
        )
        const style: CSSProperties = { borderTop: `3px solid ${t.c}`, borderColor: t.on ? 'var(--hr2-accent)' : undefined, borderTopColor: t.c, background: t.on ? 'var(--hr2-tile-on)' : 'var(--ds-surface)', padding: t.onClick ? '10px 8px' : 10 }
        return t.onClick
          ? <button key={t.label} type="button" className={s.tile} style={style} onClick={t.onClick} aria-pressed={!!t.on}>{body}</button>
          : <div key={t.label} className={s.tile} style={style}>{body}</div>
      })}
    </div>
  )
}

export type FlowState = 'done' | 'current' | 'next' | 'rejected'

/** The approval flow's (and Month close's) nodes: green ✓, red ×, the accent ring with its halo, a grey ring numbered. */
export function Flow({ nodes }: { nodes: ReadonlyArray<{ key: string; state: FlowState; glyph?: string; head: ReactNode; label: string; labelFg: string; labelWeight?: number; at?: string }> }) {
  return (
    <>
      {nodes.map((n, i) => {
        const ok = n.state === 'done', bad = n.state === 'rejected', cur = n.state === 'current', last = i === nodes.length - 1
        return (
          <div key={n.key} className={s.flowRow}>
            <span className={s.flowRail}>
              <span className={s.flowNode} style={{
                borderColor: ok ? 'var(--ds-success)' : bad ? 'var(--ds-danger)' : cur ? 'var(--hr2-accent)' : 'var(--ds-border)',
                background: ok ? 'var(--ds-success)' : bad ? 'var(--ds-danger)' : 'var(--ds-surface)',
                color: ok || bad ? 'var(--hr2-on-accent)' : 'var(--ds-ink-3)',
                boxShadow: cur ? 'var(--hr2-halo)' : 'none',
              }}>{ok ? '✓' : bad ? '×' : n.glyph ?? ''}</span>
              <span className={s.flowLine} style={{ background: last ? 'transparent' : ok ? 'var(--ds-success)' : 'var(--ds-border)' }} />
            </span>
            <span className={s.flowText}>
              <span className={s.flowHead}>{n.head}</span>
              <span style={{ fontSize: 12, fontWeight: n.labelWeight ?? 600, color: n.labelFg }}>{n.label}</span>
              {n.at ? <span className={s.flowAt} style={MONO}>{n.at}</span> : null}
            </span>
          </div>
        )
      })}
    </>
  )
}

/** The primary button of a page (48px, the accent, white 15/600). */
export function Primary({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className={s.primary} onClick={onClick} disabled={disabled}>{children}</button>
}

export interface SheetAction {
  label: string
  primary?: boolean
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

/**
 * The bottom sheet: the scrim, the panel (radius 20 20 0 0, max 80%), the grab handle, eyebrow · title · sub and the
 * round ×, a body, and the actions in equal columns. Tapping the scrim closes it — unless it is waiting for an answer.
 */
export function Sheet({ open, eyebrow, title, sub, onClose, actions, children, locked = false }: {
  open: boolean
  eyebrow?: string
  title: string
  sub?: string
  onClose: () => void
  actions?: ReadonlyArray<SheetAction>
  children?: ReactNode
  locked?: boolean
}) {
  if (!open) return null
  return (
    <>
      <div className={s.scrim} onClick={locked ? undefined : onClose} />
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.grab}><span /></div>
        <div className={s.sheetHead}>
          <div style={{ minWidth: 0 }}>
            {eyebrow ? <div className={s.sheetEyebrow}>{eyebrow}</div> : null}
            <div className={s.sheetTitle}>{title}</div>
            {sub ? <div className={s.sheetSub}>{sub}</div> : null}
          </div>
          <button type="button" className={s.sheetClose} onClick={onClose} disabled={locked} aria-label="Close">×</button>
        </div>
        <div className={s.sheetBody}>{children}</div>
        {actions?.length ? (
          <div className={s.sheetActions} style={{ gridTemplateColumns: `repeat(${actions.length},minmax(0,1fr))` }}>
            {actions.map(a => (
              <button key={a.label} type="button" className={s.sheetBtn} disabled={a.disabled} onClick={a.onClick}
                style={a.primary ? { border: 0, background: 'var(--hr2-accent)', color: 'var(--hr2-on-accent)' } : { color: a.danger ? 'var(--ds-danger)' : 'var(--ds-ink)' }}>
                {a.label}
              </button>
            ))}
          </div>
        ) : <div style={{ height: 'calc(30px + var(--safe-bottom))' }} />}
      </div>
    </>
  )
}

/** The facts card inside a sheet (no fill, the hairline border). */
export function SheetFacts({ items }: { items: ReadonlyArray<[string, ReactNode]> }) {
  return (
    <div className={s.sheetFacts}>
      {items.map(([k, v], i) => (
        <div key={k} className={s.fact} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--ds-border)' : 0 }}>
          <span className={s.factK}>{k}</span>
          <span className={s.factV}>{v}</span>
        </div>
      ))}
    </div>
  )
}

/** A form field inside a sheet: the label over its control. */
export function Field({ label, children, group = false }: { label: string; children: ReactNode; group?: boolean }) {
  return group
    ? <div className={s.field}><span className={s.fieldLabel}>{label}</span>{children}</div>
    : <label className={s.field}><span className={s.fieldLabel}>{label}</span>{children}</label>
}

/** How long a toast that says something did not happen stays — read once, and longer (a letter not filed, 2026-10-24). */
export const TOAST_LONG = 8000

/** The toast: 2.4 s (or `ms`), ink on white, 110px off the bottom. */
export function useToast(): [string, (m: string, ms?: number) => void] {
  const [msg, setMsg] = useState('')
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (t.current) clearTimeout(t.current) }, [])
  const flash = (m: string, ms = 2400) => {
    setMsg(m)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setMsg(''), ms)
  }
  return [msg, flash]
}

export function Toast({ msg }: { msg: string }) {
  return msg ? <div key={msg} className={s.toast} role="status">{msg}</div> : null
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={s.empty}>{children}</div>
}
