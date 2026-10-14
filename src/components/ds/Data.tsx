'use client'

import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * The design system's data pieces, value for value: StatusChip and
 * DescriptionList (`core-data/Avatar.jsx`), DataTable and ListItem
 * (`core-data/DataTable.jsx`), Card (`core-layout/Card.jsx`) and Banner
 * (`core-feedback/Banner.jsx`).
 */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

/** A record's state: dot + word on a wash. */
export function StatusChip({ tone = 'neutral', children, style }: { tone?: Tone; children: ReactNode; style?: CSSProperties }) {
  const neutral = tone === 'neutral'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        background: neutral ? 'var(--ds-surface)' : `var(--ds-${tone}-bg)`,
        border: `1px solid ${neutral ? 'var(--ds-border)' : `var(--ds-${tone}-border)`}`,
        color: neutral ? 'var(--ds-ink-2)' : `var(--ds-${tone})`,
        fontFamily: 'var(--ds-chip-font, var(--font-mono))',
        fontSize: 11,
        whiteSpace: 'nowrap',
        lineHeight: 'normal',
        ...style,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flex: 'none' }} />
      {children}
    </span>
  )
}

export type Fact = { label: ReactNode; value: ReactNode; mono?: boolean; missing?: boolean }

/** Label / value pairs: "columns" (label 130px left) or "stacked" (label over value). */
export function DescriptionList({ items, layout = 'columns', columns = 2, labelWidth = 130, style }: { items: Fact[]; layout?: 'columns' | 'stacked'; columns?: number; labelWidth?: number; style?: CSSProperties }) {
  if (layout === 'stacked') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: '14px 24px', ...style }}>
        {items.map((it, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: 'var(--ds-ink-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{it.label}</div>
            <div style={{ marginTop: 3, fontFamily: it.mono ? 'var(--font-mono)' : undefined, color: it.missing ? 'var(--ds-warning)' : 'var(--ds-ink)', overflowWrap: 'anywhere' }}>{it.value}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px minmax(0,1fr)`, gap: '10px 14px', ...style }}>
      {items.map((it, i) => (
        <Fragment key={i}>
          <span style={{ color: 'var(--ds-ink-3)' }}>{it.label}</span>
          <span style={{ fontFamily: it.mono ? 'var(--font-mono)' : undefined, color: it.missing ? 'var(--ds-warning)' : 'var(--ds-ink)' }}>{it.value}</span>
        </Fragment>
      ))}
    </div>
  )
}

export interface Column<R> {
  key: string
  label: ReactNode
  width?: string
  align?: 'left' | 'right' | 'center'
  mono?: boolean
  render?: (row: R) => ReactNode
}

/** The ledger table on CSS grid: framed well, header band, zebra, hover, selected; optional walnut-ruled groups that fold. */
export function DataTable<R extends Record<string, unknown>>({
  columns,
  rows,
  rowKey = 'id',
  onRowClick,
  selectedKey,
  zebra = true,
  groupBy,
  empty = 'Nobody matches the current filter.',
  style,
}: {
  columns: Column<R>[]
  rows: R[]
  rowKey?: string
  onRowClick?: (r: R) => void
  selectedKey?: string | null
  zebra?: boolean
  groupBy?: string
  empty?: ReactNode
  style?: CSSProperties
}) {
  const [hov, setHov] = useState<unknown>(null)
  const [folded, setFolded] = useState<Record<string, boolean>>({})
  const cols = columns.map(c => c.width || 'minmax(0,1fr)').join(' ')
  const cell = (c: Column<R>): CSSProperties => ({
    padding: '9px 14px',
    minWidth: 0,
    textAlign: c.align || 'left',
    fontFamily: c.mono ? 'var(--font-mono)' : undefined,
    fontSize: c.mono ? 11.5 : undefined,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  })
  const renderRow = (r: R, i: number) => {
    const k = r[rowKey] as string
    const sel = selectedKey != null && selectedKey === k
    return (
      <div
        key={k}
        role="row"
        onClick={onRowClick ? () => onRowClick(r) : undefined}
        onMouseEnter={() => setHov(k)}
        onMouseLeave={() => setHov(null)}
        style={{
          display: 'grid',
          gridTemplateColumns: cols,
          alignItems: 'center',
          borderBottom: '1px solid var(--ds-border)',
          background: sel ? 'var(--ds-selected)' : onRowClick && hov === k ? 'var(--ds-row-hover)' : zebra && i % 2 ? 'var(--ds-zebra)' : 'var(--ds-surface)',
          cursor: onRowClick ? 'pointer' : undefined,
          transition: 'background-color .12s',
        }}
      >
        {columns.map(c => (
          <span key={c.key} role="cell" style={cell(c)}>
            {c.render ? c.render(r) : (r[c.key] as ReactNode)}
          </span>
        ))}
      </div>
    )
  }
  const groups = groupBy ? [...new Set(rows.map(r => String(r[groupBy])))] : null
  return (
    <div role="table" style={{ border: '1px solid var(--ds-border-strong)', borderRadius: 10, overflow: 'hidden', background: 'var(--ds-surface)', fontSize: 'var(--ds-body-size)', color: 'var(--ds-ink)', ...style }}>
      <div role="row" style={{ display: 'grid', gridTemplateColumns: cols, background: 'var(--ds-table-head)', borderBottom: '1px solid var(--ds-table-head-rule)', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {columns.map(c => (
          <span key={c.key} role="columnheader" style={{ padding: '11px 14px', textAlign: c.align || 'left', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.label}
          </span>
        ))}
      </div>
      {rows.length === 0 ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--ds-ink-3)' }}>{empty}</div> : null}
      {groups
        ? groups.map(g => {
            const list = rows.filter(r => String(r[groupBy!]) === g)
            const open = !folded[g]
            return (
              <Fragment key={g}>
                <button
                  type="button"
                  onClick={() => setFolded({ ...folded, [g]: open })}
                  aria-expanded={open}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', padding: '10px 14px', background: 'var(--hr-group, rgb(241 237 230))', border: 0, borderLeft: '3px solid var(--ds-dark)', borderBottom: '1px solid var(--ds-border)', font: 'inherit', textAlign: 'left', color: 'var(--ds-ink)', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 9, display: 'inline-block', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .12s' }}>▼</span>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>{g}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{list.length}</span>
                </button>
                {open ? list.map(renderRow) : null}
              </Fragment>
            )
          })
        : rows.map(renderRow)}
    </div>
  )
}

/** A tappable list row: leading, title + sub, trailing. */
export function ListItem({ leading, title, subtitle, trailing, onClick, divider = true, style }: { leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void; divider?: boolean; style?: CSSProperties }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: divider ? '1px solid var(--ds-divider)' : 0, cursor: onClick ? 'pointer' : undefined, color: 'var(--ds-ink)', ...style }}
    >
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'calc(var(--ds-body-size) + .5px)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 'var(--ds-small-size)', color: 'var(--ds-ink-2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div> : null}
      </div>
      {trailing}
    </div>
  )
}

/** The container surface ("outlined": hairline + card shadow). */
export function Card({ padding = 'md', children, style }: { padding?: 'none' | 'sm' | 'md' | 'lg'; children: ReactNode; style?: CSSProperties }) {
  const pad = { none: 0, sm: 12, md: 16, lg: 'var(--ds-pad)' }[padding]
  return (
    <div style={{ boxSizing: 'border-box', borderRadius: 'var(--ds-r-card)', padding: pad, transition: 'border-color .12s', minWidth: 0, background: 'var(--ds-surface)', border: '1px solid var(--ds-border)', boxShadow: 'var(--ds-shadow-card)', ...style }}>
      {children}
    </div>
  )
}

/** An inline message: word on wash with a border, a dot. */
export function Banner({ tone = 'info', title, children, style }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 'var(--ds-r-row)', background: `var(--ds-${tone}-bg)`, border: `1px solid var(--ds-${tone}-border)`, color: 'var(--ds-ink)', fontSize: 'var(--ds-small-size)', lineHeight: 1.5, ...style }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--ds-${tone})`, marginTop: 7, flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? <div style={{ fontWeight: 600, color: `var(--ds-${tone})` }}>{title}</div> : null}
        {children}
      </div>
    </div>
  )
}
