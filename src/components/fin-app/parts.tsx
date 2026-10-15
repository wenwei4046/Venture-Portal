'use client'

import type { ReactNode } from 'react'
import { HrIcon } from '@/components/hrv/icons'
import type { HubCardItem } from '@/components/finv/Hub'
import { drawerStyles as d } from '@/components/finv/Drawer'
import s from './fin-app.module.css'

// The Finance phone app's parts (2026-10-15, the Finance revamp v2's phone —
// `Finance Mobile App.dc.html`): a hub's centred total and month pill, its
// stacked cards (README › Status card fills), a list's search, its title and
// count over the rounded card of rows (name + a short description + the
// amount — no status chip, no number: the user's rule for phone lists), the
// lines of a list that opens nothing, and the note for a screen with nothing
// to show.

/** The hub's total, centred (Chivo 30/600), its label, a state in a word (a report's chip), and a month pill under it. */
export function BankHero({
  value,
  label,
  month,
  chip,
}: {
  value: string
  label: string
  /** The month under it (or a day — Daily Bank's, `unit: 'day'`). */
  month?: { label: string; prev: () => void; next: () => void; canPrev?: boolean; canNext?: boolean; unit?: 'month' | 'day' } | null
  /** *Unpaid as of today*, *Segment only · won't balance* — the desktop page's chip (alert, unless it says its tone). */
  chip?: string | { text: string; tone: ChipTone } | null
}) {
  const said = typeof chip === 'string' ? { text: chip, tone: 'alert' as ChipTone } : (chip ?? null)
  return (
    <div className={s.bankHero}>
      <span className={s.bankValue}>{value}</span>
      <span className={s.bankLabel}>{label}</span>
      {said ? (
        <span className={s.itemChip} data-tone={said.tone}>
          {said.text}
        </span>
      ) : null}
      {month ? (
        <div className={s.pill}>
          <button type="button" className={s.pillBtn} onClick={month.prev} disabled={month.canPrev === false} aria-label={`Previous ${month.unit ?? 'month'}`}>
            ‹
          </button>
          <span className={s.pillLabel}>{month.label}</span>
          <button type="button" className={s.pillBtn} onClick={month.next} disabled={month.canNext === false} aria-label={`Next ${month.unit ?? 'month'}`}>
            ›
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className={s.notice}>{children}</div>
}

/** The stacked cards, a list each — the desktop hub's cards (`HubCardItem`), drawn the phone's way. */
export function StackCards({ cards, onOpen }: { cards: HubCardItem[]; onOpen: (key: string) => void }) {
  return (
    <div className={s.stack}>
      {cards.map((c) => (
        <button key={c.key} type="button" className={s.card} data-tone={c.tone} onClick={() => onOpen(c.key)}>
          <span className={s.cardArc} aria-hidden="true" />
          <span className={s.cardTop}>
            <span className={s.cardText}>
              <span className={s.cardName}>{c.label}</span>
              <span className={s.cardSub}>{c.sub}</span>
            </span>
            <span className={s.cardChip} aria-hidden="true">
              <HrIcon name={c.icon} size={18} />
            </span>
          </span>
          <span className={s.cardValue}>{c.value}</span>
        </button>
      ))}
    </div>
  )
}

/** A list's month: ‹ October 2026 › in three boxes. */
export function MonthNav({ label, prev, next, canPrev = true, canNext = true }: { label: string; prev: () => void; next: () => void; canPrev?: boolean; canNext?: boolean }) {
  return (
    <div className={s.monthNav}>
      <button type="button" className={s.monthBtn} onClick={prev} disabled={!canPrev} aria-label="Previous month">
        ‹
      </button>
      <div className={s.monthLabel}>{label}</div>
      <button type="button" className={s.monthBtn} onClick={next} disabled={!canNext} aria-label="Next month">
        ›
      </button>
    </div>
  )
}

/** The search box, and Select beside it where rows can be ticked. */
export function SearchRow({
  value,
  onChange,
  placeholder,
  select,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  select?: { on: boolean; toggle: () => void } | null
}) {
  return (
    <div className={s.searchRow}>
      <input className={s.search} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {select ? (
        <button type="button" className={s.selectBtn} aria-pressed={select.on} onClick={select.toggle}>
          {select.on ? 'Done' : 'Select'}
        </button>
      ) : null}
    </div>
  )
}

/** A list's title and count over its rows, or the sentence when there are none. */
export function ListBlock({ title, count, empty, children }: { title: string; count: string; empty: string | null; children?: ReactNode }) {
  return (
    <div className={s.list}>
      <div className={s.listHead}>
        <span className={s.listTitle}>{title}</span>
        <span className={s.listCount}>{count}</span>
      </div>
      {empty !== null ? <div className={s.empty}>{empty}</div> : <div className={s.rows}>{children}</div>}
    </div>
  )
}

export type AmountTone = 'ledger' | 'out' | 'void' | null

/** One row: the name, a short description under it, the amount, the chevron — and a tick box while selecting. */
export function Row({
  title,
  desc,
  amount,
  tone = null,
  onClick,
  tick,
}: {
  title: string
  desc: string
  amount: string
  tone?: AmountTone
  onClick: () => void
  /** While selecting: ticked, and whether it can be. */
  tick?: { on: boolean; can: boolean } | null
}) {
  return (
    <button type="button" className={s.row} data-picked={tick?.on ? 'true' : undefined} onClick={onClick}>
      {tick ? (
        <span className={s.tick} data-on={tick.on ? 'true' : undefined} data-can={tick.can ? undefined : 'false'} aria-hidden="true">
          {tick.on ? '✓' : ''}
        </span>
      ) : null}
      <span className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        <span className={s.rowDesc}>{desc || '—'}</span>
      </span>
      <span className={s.rowAmt} data-tone={tone ?? undefined}>
        {amount}
      </span>
      <span className={s.chev} aria-hidden="true">
        ›
      </span>
    </button>
  )
}

export type ChipTone = 'def' | 'wait' | 'accent' | 'ledger' | 'info' | 'danger' | 'alert'

export interface ItemLine {
  key: string
  label: string
  sub?: string
  value?: string
  tone?: 'ledger' | 'out' | 'alert' | 'muted' | null
  /** Its state, as the design's item lists show it (a credit note's, a project's, a person's). */
  chip?: { text: string; tone: ChipTone } | null
  /** A file to open in its own tab, or a step; pale while it would only say why not. */
  action?: { label: string; onClick?: () => void; href?: string; newTab?: boolean; off?: boolean } | null
  /** Pressing the line itself (a credit note's menu, a project's page). */
  onOpen?: () => void
}

/** The lines of a list that are no records of their own (a credit note, a staff row, a report's line): the title and count over a card. */
export function ItemGroup({ title, count, items, empty }: { title: string; count: string; items: ItemLine[]; empty?: string }) {
  return (
    <>
      <div className={s.groupHead}>
        <span className={s.listTitle}>{title}</span>
        <span className={s.listCount}>{count}</span>
      </div>
      <ItemRows items={items} empty={empty} />
    </>
  )
}

/**
 * A record's own numbered group of lines (a deal's schedule, its repayments, its settings — 2026-10-15): the
 * drawer's numeral and title over the same card of lines, so the record reads on from the drawer's groups.
 */
export function RecordItems({ roman, title, count, items, empty }: { roman: string; title: string; count?: string; items: ItemLine[]; empty?: string }) {
  return (
    <>
      <div className={d.label}>
        <span className={d.labelRoman}>{roman}</span> {title}
        {count ? ` · ${count}` : null}
      </div>
      <ItemRows items={items} empty={empty} />
    </>
  )
}

function ItemRows({ items, empty }: { items: ItemLine[]; empty?: string }) {
  return (
    <>
      {items.length === 0 && empty ? (
        <div className={s.empty}>{empty}</div>
      ) : (
        <div className={s.rows}>
          {items.map((i) => {
            const body = (
              <>
                <span className={s.itemText}>
                  <span className={s.itemL}>{i.label}</span>
                  {i.sub ? <span className={s.itemSub}>{i.sub}</span> : null}
                </span>
                {i.value !== undefined || i.chip ? (
                  <span className={s.itemRight}>
                    {i.value !== undefined ? (
                      <span className={s.itemV} data-tone={i.tone ?? undefined}>
                        {i.value}
                      </span>
                    ) : null}
                    {i.chip ? (
                      <span className={s.itemChip} data-tone={i.chip.tone}>
                        {i.chip.text}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </>
            )
            return (
              <div key={i.key} className={s.item}>
                {i.onOpen ? (
                  <button type="button" className={s.itemMain} onClick={i.onOpen}>
                    {body}
                  </button>
                ) : (
                  body
                )}
                {i.action ? (
                  i.action.href ? (
                    <a
                      className={s.itemAct}
                      href={i.action.href}
                      target={i.action.newTab ? '_blank' : undefined}
                      rel={i.action.newTab ? 'noopener noreferrer' : undefined}
                    >
                      {i.action.label}
                    </a>
                  ) : (
                    <button type="button" className={s.itemAct} data-off={i.action.off ? 'true' : undefined} onClick={i.action.onClick}>
                      {i.action.label}
                    </button>
                  )
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export function Placeholder({ children }: { children: ReactNode }) {
  return <div className={s.placeholder}>{children}</div>
}
