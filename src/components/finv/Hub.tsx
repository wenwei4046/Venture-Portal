'use client'

import Link from 'next/link'
import type { MouseEvent, ReactNode } from 'react'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
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

/** The month pill under a hub's total (Invoices): ‹ October 2026 ›. */
export function MonthNav({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className={s.monthNav}>
      <button type="button" className={s.monthStep} onClick={onPrev} aria-label="Previous month">
        ‹
      </button>
      <span className={s.monthLabel}>{label}</span>
      <button type="button" className={s.monthStep} onClick={onNext} aria-label="Next month">
        ›
      </button>
    </div>
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
