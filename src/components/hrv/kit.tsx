import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import s from './hrv.module.css'
import { CardIcon, type CardIconName } from './icons'

// The HR revamp's static pieces (2026-10-10): the page head, summary cards,
// chips, the grid tables, history, facts, the toggle — every value the
// prototype's (`.design/hr-revamp`), the colours `--hv-*`. Server-safe: no
// hooks here; the moving parts are in tabs.tsx / overlay.tsx / toast.tsx.

export { s as hv }

/** A revamped page's root: the prototype's line-height and type. */
export function HvPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${s.page} ${className}`.trim()}>{children}</div>
}

/**
 * The head: an eyebrow with its 2×10 orange bar, the Georgia title, a line,
 * the right-hand controls, and the rule with its 64px orange segment —
 * `bare` (Sales Groups) gives up the rule and the segment because its tabs
 * sit right under it.
 */
export function PageHead({
  eyebrow,
  title,
  subtitle,
  right,
  bare = false,
  style,
}: {
  eyebrow: string
  title: string
  subtitle?: ReactNode
  right?: ReactNode
  bare?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={`${s.head}${bare ? ` ${s.headBare}` : ''}`} style={style}>
      <div>
        <div className={s.eyebrow}>
          <span className={s.eyebrowBar} aria-hidden="true" />
          {eyebrow}
        </div>
        <h1 className={s.title}>{title}</h1>
        {subtitle ? (
          <div className={s.subtitle}>
            <span>{subtitle}</span>
          </div>
        ) : null}
      </div>
      {right ? <div className={s.headRight}>{right}</div> : null}
      {bare ? null : <span className={s.underline} aria-hidden="true" />}
    </div>
  )
}

export type CardTone = 'default' | 'primary' | 'alert' | 'danger'

/** A row of summary cards (`count` columns). */
export function Cards({ children, count = 5, style, label }: { children: ReactNode; count?: number; style?: CSSProperties; label: string }) {
  return (
    <section aria-label={label} className={s.cards} style={{ '--hv-cards': count, ...style } as CSSProperties}>
      {children}
    </section>
  )
}

/**
 * One card. Comm Cal's (`minHeight` 146, a 30px label, 28px figure — 19px
 * when it is words — and an icon tile) and People's (132, 24px label, 26px
 * figure, no icon) differ only in these numbers.
 */
export function Card({
  label,
  value,
  note,
  icon,
  tone = 'default',
  minHeight = 146,
  labelMinHeight = 30,
  labelLineHeight = 1.5,
  valueSize,
  valueTracking = '-.02em',
  valueLineHeight = 1.25,
  footPad = 13,
  noteLink = false,
  onClick,
  href,
  title,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
  icon?: CardIconName
  tone?: CardTone
  minHeight?: number
  labelMinHeight?: number
  labelLineHeight?: number | 'normal'
  /** Defaults to 28px, or 19px for a value longer than four characters. */
  valueSize?: number
  valueTracking?: string
  valueLineHeight?: number | 'normal'
  footPad?: number
  /** The note reads as the card's link (underlined, black) — an alert card that opens something. */
  noteLink?: boolean
  onClick?: () => void
  href?: string
  title?: string
}) {
  const size = valueSize ?? (typeof value === 'string' && value.length > 4 ? 19 : 28)
  const body = (
    <>
      <span className={s.cardBar} aria-hidden="true" />
      <div className={s.cardLabel} style={{ minHeight: labelMinHeight, lineHeight: labelLineHeight }}>{label}</div>
      <div className={s.cardValue} style={{ fontSize: size, letterSpacing: valueTracking, lineHeight: valueLineHeight }}>{value}</div>
      <div className={s.cardFoot} style={{ paddingTop: footPad }}>
        <span className={noteLink ? s.cardNoteLink : undefined}>{note}</span>
        {icon ? (
          <span className={s.cardIcon} aria-hidden="true">
            <CardIcon name={icon} />
          </span>
        ) : null}
      </div>
    </>
  )
  const tint = tone === 'default' ? undefined : tone
  const style = { minHeight }
  if (href) {
    return (
      <Link href={href} className={`${s.card} ${s.cardClick}`} data-tone={tint} style={style} title={title}>
        {body}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${s.card} ${s.cardClick}`} data-tone={tint} style={style} title={title}>
        {body}
      </button>
    )
  }
  return (
    <div className={s.card} data-tone={tint} style={style} role="group" aria-label={label} title={title}>
      {body}
    </div>
  )
}

/** "Months with sales data ———— 5 PERIODS". */
export function SectHead({ title, count }: { title: string; count?: string }) {
  return (
    <div className={s.sect}>
      <span className={s.sectTitle}>{title}</span>
      <span className={s.sectRule} aria-hidden="true" />
      {count ? <span className={s.sectCount}>{count}</span> : null}
    </div>
  )
}

export type ChipTone = 'alert' | 'ledger' | 'danger' | 'info' | 'plain' | 'run' | 'runOn'

/** A status: a word on a wash with its dot. `soft` = the roster's borderless 10.5px. */
export function Chip({ tone = 'plain', soft = false, children, style, title }: { tone?: ChipTone; soft?: boolean; children: ReactNode; style?: CSSProperties; title?: string }) {
  return (
    <span className={`${s.chip}${soft ? ` ${s.chipSoft}` : ''}`} data-tone={tone} style={style} title={title}>
      <span className={s.chipDot} aria-hidden="true" />
      {children}
    </span>
  )
}

/** The prototype's switch: a 28×16 track, the knob slides in .15s. */
export function Toggle({ on, shadow = false, style }: { on: boolean; shadow?: boolean; style?: CSSProperties }) {
  return (
    <span className={s.toggle} data-on={on ? 'true' : 'false'} style={style} aria-hidden="true">
      <span className={`${s.knob}${shadow ? ` ${s.knobShadow}` : ''}`} />
    </span>
  )
}

/** Grid table: a frame, the header band, then rows on the same columns. */
export function GridTable({ children, style, label, scroll = true }: { children: ReactNode; style?: CSSProperties; label: string; scroll?: boolean }) {
  const table = (
    <div className={s.gt} style={style} role="table" aria-label={label}>
      {children}
    </div>
  )
  return scroll ? <div className={s.gtScroll}>{table}</div> : table
}

export function GridHead({ cols, cells, cellStyle }: { cols: string; cells: Array<ReactNode | { label: ReactNode; style?: CSSProperties }>; cellStyle?: CSSProperties }) {
  return (
    <div className={s.gtHead} style={{ gridTemplateColumns: cols }} role="row">
      {cells.map((c, i) => {
        const cell = c && typeof c === 'object' && 'label' in (c as object) ? (c as { label: ReactNode; style?: CSSProperties }) : { label: c as ReactNode }
        return (
          <span key={i} role="columnheader" style={{ ...cellStyle, ...cell.style }}>
            {cell.label}
          </span>
        )
      })}
    </div>
  )
}

export function GridRow({
  cols,
  children,
  zebra = false,
  selected = false,
  onClick,
  style,
  title,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}: {
  cols: string
  children: ReactNode
  zebra?: boolean
  selected?: boolean
  onClick?: () => void
  style?: CSSProperties
  title?: string
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  return (
    <div
      role="row"
      className={`${s.gtRow}${onClick ? ` ${s.gtClick}` : ''}`}
      data-zebra={zebra ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      style={{ gridTemplateColumns: cols, ...style }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target !== e.currentTarget) return
          e.preventDefault()
          onClick()
        }
      } : undefined}
      title={title}
    >
      {children}
    </div>
  )
}

export function GridEmpty({ children }: { children: ReactNode }) {
  return <div className={s.gtEmpty}>{children}</div>
}

/** One step of a request's history. Put them in a plain <div>; the last one lights. */
export function HistoryEvent({ what, when, who, note }: { what: ReactNode; when?: ReactNode; who?: ReactNode; note?: ReactNode }) {
  return (
    <div className={s.event}>
      <div className={s.eventRail} aria-hidden="true">
        <span className={s.eventDot} />
        <span className={s.eventLine} />
      </div>
      <div className={s.eventBody}>
        <div className={s.eventTop}>
          <span className={s.eventWhat}>{what}</span>
          {when ? <span className={s.eventWhen}>{when}</span> : null}
        </div>
        {who ? <div className={s.eventWho}>{who}</div> : null}
        {note ? <div className={s.eventNote}>{note}</div> : null}
      </div>
    </div>
  )
}

/** Label / value pairs (130px labels; `labelWidth` for the wider 200px). */
export function Facts({ rows, labelWidth = 130, gap = '10px 14px', style }: { rows: Array<{ l: ReactNode; v: ReactNode }>; labelWidth?: number; gap?: string; style?: CSSProperties }) {
  return (
    <div className={s.facts} style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr)`, gap, ...style }}>
      {rows.map((r, i) => (
        <FactPair key={i} l={r.l} v={r.v} />
      ))}
    </div>
  )
}

function FactPair({ l, v }: { l: ReactNode; v: ReactNode }) {
  return (
    <>
      <span className={s.factLabel}>{l}</span>
      <span>{v}</span>
    </>
  )
}

/** Small caps section label ("COMPONENTS", "AUDIT HISTORY"). */
export function SecLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className={s.secLabel} style={style}>{children}</div>
}

/** Button class names: `btn('primary')`, `btn('outline', 'sm')` … */
export function btn(kind: 'primary' | 'outline' | 'outlineFrame' | 'dark' | 'danger' | 'dangerSolid' | 'dashed' | 'muted' = 'outline'): string {
  return `${s.btn} ${s[kind]}`
}
