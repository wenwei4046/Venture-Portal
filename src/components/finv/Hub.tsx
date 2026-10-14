'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import { useEscape } from '@/components/hrv/overlay'
import s from './hub.module.css'

// The Finance view's hub pages (2026-10-14, the Finance revamp v2 — D02–D03 of
// `.design/fin-r2/handoff`): the page head, the status cards, a list's chip
// and the payroll batches. The table is FinTable; the drawer FinDrawer.

export type ChipTone = 'def' | 'wait' | 'accent' | 'ledger' | 'info' | 'danger' | 'alert'

/** A status in a list, as the design's chip says it. */
export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={s.chip} data-tone={tone}>
      {children}
    </span>
  )
}

/** The page head: the eyebrow (its numeral in the roman orange), the title, the 64px segment, the actions. */
export function HubHead({ roman, eyebrow, title, actions }: { roman: string; eyebrow: string; title: string; actions?: ReactNode }) {
  return (
    <div className={s.head}>
      <div className={s.headText}>
        <div className={s.eyebrow}>
          <span className={s.roman}>{roman}</span> {eyebrow}
        </div>
        <h1 className={s.title}>{title}</h1>
        <div className={s.rule} aria-hidden="true" />
      </div>
      {actions ? <div className={s.actions}>{actions}</div> : null}
    </div>
  )
}

/** A head button: the page's one primary, or a white one. A link when it goes somewhere. */
export function HeadButton({
  primary = false,
  href,
  onClick,
  children,
  title,
}: {
  primary?: boolean
  href?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
  title?: string
}) {
  if (href) {
    return (
      <Link href={href} className={s.btn} data-kind={primary ? 'primary' : undefined} title={title}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" className={s.btn} data-kind={primary ? 'primary' : undefined} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export type CardTone = 'all' | 'draft' | 'pending_approval' | 'approved' | 'paid' | 'issued' | 'payroll' | 'company' | 'staff' | 'quiet' | 'peach'

/** The light cards wear a hairline and the walnut's faint arc. */
const LIGHT: ReadonlySet<CardTone> = new Set(['quiet', 'peach'])

export interface HubCardItem {
  key: string
  tone: CardTone
  icon: HrIconName
  label: string
  /** "11 vouchers" — the mono line under the name. */
  sub: string
  /** The figure at its foot, already written ("RM 457,783.00"). */
  value: string
}

/**
 * The cards beside the table: the walnut-framed total, an optional notice and
 * month control, then a card per list — the active one ringed in the accent.
 */
export function HubCards({
  heroLabel,
  heroValue,
  heroExtra,
  notice,
  cards,
  active,
  onSelect,
}: {
  heroLabel: string
  heroValue: string
  heroExtra?: ReactNode
  notice?: ReactNode
  cards: HubCardItem[]
  active: string
  onSelect: (key: string) => void
}) {
  return (
    <div className={s.cards}>
      <div className={s.hero}>
        <div className={s.heroBar} aria-hidden="true" />
        <div className={s.heroLabel}>{heroLabel}</div>
        <div className={s.heroValue}>{heroValue}</div>
        {heroExtra}
      </div>
      {notice ? <div className={s.notice}>{notice}</div> : null}
      {cards.map((c) => (
        <button
          key={c.key}
          type="button"
          className={s.card}
          data-tone={c.tone}
          data-light={LIGHT.has(c.tone) ? 'true' : undefined}
          data-active={c.key === active ? 'true' : undefined}
          aria-pressed={c.key === active}
          onClick={() => onSelect(c.key)}
        >
          <span className={s.cardArc} aria-hidden="true" />
          <span className={s.cardChip} aria-hidden="true">
            <HrIcon name={c.icon} size={15} />
          </span>
          <span className={s.cardText}>
            <span className={s.cardName}>{c.label}</span>
            <span className={s.cardSub}>{c.sub}</span>
          </span>
          <span className={s.cardAmount}>{c.value}</span>
        </button>
      ))}
    </div>
  )
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The month pill under a hub's total (Invoices): ‹ October 2026 ›. With
 * `month` and `onPick` its label opens the year's months — ours, kept from
 * Service Billing's month control, so a month long past is one pick away:
 * the year stepped with ‹ ›, the month on show in the accent, this month
 * ringed, *This month* under the grid.
 */
export function MonthNav({
  label,
  onPrev,
  onNext,
  month,
  thisMonth,
  onPick,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  /** The month on show, `YYYY-MM`. */
  month?: string
  /** The office's month, `YYYY-MM`. */
  thisMonth?: string
  onPick?: (month: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number((month ?? '').slice(0, 4)) || 0)
  const [shown, setShown] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const close = () => {
    setOpen(false)
    setShown(false)
  }
  useEscape(open, close)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (wrap.current && e.target instanceof Node && wrap.current.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', away, true)
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      document.removeEventListener('mousedown', away, true)
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [open])
  const picker = !!(month && onPick)
  const pick = (ym: string) => {
    close()
    if (ym !== month) onPick?.(ym)
  }
  return (
    <div ref={wrap} className={s.monthWrap}>
      <div className={s.monthNav}>
        <button type="button" className={s.monthStep} onClick={onPrev} aria-label="Previous month">
          ‹
        </button>
        {picker ? (
          <button
            type="button"
            className={`${s.monthLabel} ${s.monthPick}`}
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() => {
              if (open) return close()
              setYear(Number(month!.slice(0, 4)))
              setOpen(true)
            }}
          >
            {label}
          </button>
        ) : (
          <span className={s.monthLabel}>{label}</span>
        )}
        <button type="button" className={s.monthStep} onClick={onNext} aria-label="Next month">
          ›
        </button>
      </div>
      {picker && open ? (
        <div className={s.monthPop} data-in={shown ? 'true' : undefined} role="group" aria-label="Months">
          <div className={s.monthPopHead}>
            <button type="button" className={s.monthPopNav} onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              ‹
            </button>
            <span className={s.monthPopTitle}>{year}</span>
            <button type="button" className={s.monthPopNav} onClick={() => setYear((y) => y + 1)} aria-label="Next year">
              ›
            </button>
          </div>
          <div className={s.monthGrid}>
            {MON.map((m, i) => {
              const ym = `${year}-${String(i + 1).padStart(2, '0')}`
              const on = ym === month
              return (
                <button
                  key={ym}
                  type="button"
                  className={s.monthCell}
                  data-on={on ? 'true' : undefined}
                  data-now={!on && ym === thisMonth ? 'true' : undefined}
                  aria-pressed={on}
                  onClick={() => pick(ym)}
                >
                  {m}
                </button>
              )
            })}
          </div>
          {thisMonth ? (
            <div className={s.monthPopFoot}>
              <button type="button" className={s.monthToday} onClick={() => pick(thisMonth)}>
                This month
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export interface ItemRow {
  key: string
  label: string
  sub?: string
  /** The figure at its right, already written ("−220.40"). */
  value?: string
  valueTone?: 'danger' | 'ledger' | null
  /** The row's one button (Approve, Invoice, PDF…). */
  action?: { label: string; onClick?: () => void; href?: string; newTab?: boolean; disabled?: boolean; title?: string } | null
  /** A press on the row (or Enter). */
  onOpen?: () => void
  /** A right-click on the row — the rest of what it can do. */
  onMenu?: (e: MouseEvent<HTMLElement>) => void
}

/**
 * A list that is not the table's (Invoice's Credit notes, Marketing projects,
 * Non-billable — the prototype's `itemGroups`): a band naming it and counting,
 * then a row an item — its name, a line about it, its figure and one button.
 */
export function ItemList({ title, count, items, empty }: { title: string; count: string; items: ItemRow[]; empty: string }) {
  return (
    <div>
      <div className={`${s.band} ${s.bandSplit}`}>
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {items.length === 0 ? <div className={s.itemEmpty}>{empty}</div> : null}
      {items.map((it) => (
        <div
          key={it.key}
          className={s.item}
          data-open={it.onOpen ? 'true' : undefined}
          role={it.onOpen ? 'button' : undefined}
          tabIndex={it.onOpen ? 0 : undefined}
          onClick={it.onOpen}
          onKeyDown={(e) => {
            if (it.onOpen && e.key === 'Enter' && e.target === e.currentTarget) it.onOpen()
          }}
          onContextMenu={it.onMenu}
        >
          <span className={s.itemLabel} title={it.label}>
            {it.label}
          </span>
          <span className={s.itemSub} title={it.sub}>
            {it.sub ?? ''}
          </span>
          {it.value !== undefined ? (
            <span className={s.itemValue} data-tone={it.valueTone ?? undefined}>
              {it.value}
            </span>
          ) : null}
          {it.action ? (
            it.action.href ? (
              <a
                className={s.itemAct}
                href={it.action.href}
                title={it.action.title}
                onClick={(e) => e.stopPropagation()}
                {...(it.action.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {it.action.label}
              </a>
            ) : (
              <button
                type="button"
                className={s.itemAct}
                title={it.action.title}
                disabled={it.action.disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  it.action!.onClick?.()
                }}
              >
                {it.action.label}
              </button>
            )
          ) : null}
        </div>
      ))}
    </div>
  )
}

/**
 * What is ticked, and what to do with it (Invoice's Select, D10): a dark bar at
 * the bottom centre of the sheet — "2 selected · RM 3,857.00", the one payer
 * under it — over the frame like the drawer, fixed to the window where no
 * shell is drawn (the Principal's own view).
 */
export function BulkBar({ text, sub, children }: { text: string; sub: string; children: ReactNode }) {
  const [root, setRoot] = useState<{ el: Element; fixed: boolean } | null>(null)
  useEffect(() => {
    const frame = document.querySelector('[data-hrv-overlay]')
    setRoot(frame ? { el: frame, fixed: false } : { el: document.body, fixed: true })
  }, [])
  if (!root) return null
  return createPortal(
    <div className={s.bulk} data-fixed={root.fixed ? 'true' : undefined} data-fin-kit="" role="region" aria-label="What is ticked">
      <span className={s.bulkText}>
        <span className={s.bulkMain}>{text}</span>
        <span className={s.bulkSub}>{sub}</span>
      </span>
      {children}
    </div>,
    root.el,
  )
}

/** A bulk bar's button: Clear (quiet), the accent one, or ⋯. */
export function BulkButton({
  primary = false,
  off = false,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { primary?: boolean; off?: boolean }) {
  return (
    <button type="button" {...props} className={s.bulkBtn} data-kind={primary ? 'primary' : undefined} data-off={off ? 'true' : undefined}>
      {children}
    </button>
  )
}

export interface BatchItem {
  key: string
  name: string
  /** "22 vouchers · all paid · 05 Sep 2026". */
  meta: string
  /** "−84,390.56". */
  amount: string
  members: Array<{ key: string; who: string; no: string; amount: string; onOpen?: () => void }>
}

/** Payroll batches: a band that counts them, each folded under its name, opened to its members. */
export function BatchList({
  count,
  batches,
  open,
  onToggle,
}: {
  count: string
  batches: BatchItem[]
  open: ReadonlySet<string>
  onToggle: (key: string) => void
}) {
  return (
    <div>
      <div className={s.band}>{count}</div>
      {batches.map((b) => {
        const isOpen = open.has(b.key)
        return (
          <div key={b.key} className={s.batch} data-open={isOpen ? 'true' : undefined}>
            <button type="button" className={s.batchHead} onClick={() => onToggle(b.key)} aria-expanded={isOpen}>
              <span className={s.batchChev} aria-hidden="true">
                ▸
              </span>
              <span className={s.batchName}>{b.name}</span>
              <span className={s.batchMeta}>{b.meta}</span>
              <span className={s.batchAmt}>{b.amount}</span>
            </button>
            {isOpen ? (
              <div className={s.members}>
                {b.members.map((m) =>
                  m.onOpen ? (
                    <button key={m.key} type="button" className={s.member} onClick={m.onOpen}>
                      <span className={s.memberWho}>{m.who}</span>
                      <span className={s.memberNo}>{m.no}</span>
                      <span className={s.memberAmt}>{m.amount}</span>
                    </button>
                  ) : (
                    <div key={m.key} className={s.member}>
                      <span className={s.memberWho}>{m.who}</span>
                      <span className={s.memberNo}>{m.no}</span>
                      <span className={s.memberAmt}>{m.amount}</span>
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export { s as hubStyles }
