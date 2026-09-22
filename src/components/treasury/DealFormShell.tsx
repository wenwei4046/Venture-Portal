'use client'

import { Fragment, useState, type ReactNode } from 'react'
import Link from 'next/link'

// One shell for the two "new deal" forms — New loan (fund out) and New fund
// source (fund in). 2026-09-22, from the user's mockup review: the old forms
// were a single 768px column with a paragraph under every field, so a loan
// took three screens to key in while the right half of the page sat empty.
// Now: fields two to a row inside four numbered cards (① who → ② amount &
// terms → ③ accounting → ④ notes), the long helper texts folded into ⓘ, and
// a navy preview panel on the right that recomputes 每月本金 / 利息 / 合计 /
// 到期 as they type — Submit lives there so nothing has to be scrolled to.
// Phones get the same cards stacked with the panel at the bottom (not pinned,
// user's call).

/** className for the <form>: cards left, preview right, single column under lg. */
export const dealFormClass =
  'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 lg:gap-5 items-start max-w-[1180px]'

export function DealCards({ children }: { children: ReactNode }) {
  return <div className="grid gap-3.5 min-w-0">{children}</div>
}

export function DealCard({
  n,
  title,
  en,
  children,
}: {
  n: number
  title: string
  en?: string
  children: ReactNode
}) {
  return (
    <section className="bg-surface border border-hairline rounded-md p-4 sm:p-5">
      <h2 className="flex items-center gap-2.5 mb-3 font-sans text-[11px] uppercase tracking-[0.14em] text-muted">
        <span className="inline-grid place-items-center h-5 w-5 rounded-full bg-accent-bg text-accent text-[11px] font-semibold tracking-normal">
          {n}
        </span>
        <span className="font-serif text-[15px] tracking-normal normal-case text-ink">{title}</span>
        {en ? <span>{en}</span> : null}
      </h2>
      {children}
    </section>
  )
}

/** A row of fields: 1-1 (default) or 2-1 on ≥sm, one column below. */
export function DealRow({
  split = '1-1',
  className = '',
  children,
}: {
  split?: '1-1' | '2-1'
  className?: string
  children: ReactNode
}) {
  const cols = split === '2-1' ? 'sm:grid-cols-[2fr_1fr]' : 'sm:grid-cols-2'
  return <div className={`grid grid-cols-1 ${cols} gap-4 ${className}`.trim()}>{children}</div>
}

export function DealLabel({
  htmlFor,
  required,
  optional,
  hint,
  children,
}: {
  htmlFor?: string
  required?: boolean
  optional?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-sans font-medium text-graphite mb-1.5">
      {children}
      {required ? <span className="text-danger"> *</span> : null}
      {optional ? <span className="text-muted font-normal"> (optional)</span> : null}
      {hint ? <DealHint text={hint} /> : null}
    </label>
  )
}

/** The ⓘ: hover (or tap) shows the helper text that used to sit under the field. */
export function DealHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block align-middle ml-1.5 group">
      <button
        type="button"
        aria-label={text}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="grid place-items-center h-[15px] w-[15px] rounded-full border border-hairline text-[10px] leading-none text-muted font-sans font-normal hover:border-accent-border hover:text-accent focus:outline-none focus-visible:border-accent-border"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`${open ? 'block' : 'hidden group-hover:block'} absolute left-0 top-full z-20 mt-1.5 w-64 max-w-[80vw] rounded-md border border-hairline bg-surface p-2.5 text-xs font-sans font-normal normal-case tracking-normal leading-relaxed text-graphite shadow-lg`}
      >
        {text}
      </span>
    </span>
  )
}

/** Checkbox as a small card, so 利滚利 / 最低还息 sit beside Tenure as "terms". */
export function DealToggle({
  id,
  name,
  label,
  sub,
  hint,
  checked,
  onChange,
}: {
  id: string
  name: string
  label: string
  sub: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2.5 px-3 py-2 bg-paper border border-hairline rounded-md cursor-pointer text-sm font-sans font-medium text-graphite has-[:checked]:border-accent-border has-[:checked]:bg-accent-bg/40"
    >
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      <span className="flex-1 leading-tight">
        {label}
        <span className="block text-[11px] font-normal text-muted">{sub}</span>
      </span>
      {hint ? <DealHint text={hint} /> : null}
    </label>
  )
}

/** Collapsed-by-default extra (Repayment terms / Notes): click to open. */
export function DealMore({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="list-none cursor-pointer select-none text-sm font-sans text-accent hover:underline [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">＋ </span>
        <span className="hidden group-open:inline">－ </span>
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

export type DealPreviewRow = { label: string; value: ReactNode; sub?: ReactNode; big?: boolean } | 'sep'

/** The navy panel. Lives inside the <form> so its Submit posts the form. */
export function DealPreview({
  eyebrow = '预览 · Preview',
  who,
  since,
  rows,
  gl,
  note,
  error,
  submitLabel = 'Submit for approval',
  pending,
  disabled,
  cancelHref,
}: {
  eyebrow?: string
  who: ReactNode
  since?: string | null
  rows: DealPreviewRow[]
  gl?: ReactNode
  note?: ReactNode
  error?: string | null
  submitLabel?: string
  pending: boolean
  disabled?: boolean
  cancelHref: string
}) {
  return (
    <aside className="cf-scope deal-side lg:sticky lg:top-6 rounded-md p-4 sm:p-5 min-w-0">
      <div className="deal-side-muted font-sans text-[11px] uppercase tracking-[0.14em] mb-1">{eyebrow}</div>
      <p className="text-[17px] leading-snug mb-3">
        {who}
        {since ? <span className="deal-side-muted text-[13px]"> · 从 {since}</span> : null}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[7px] text-[13px] m-0">
        {rows.map((r, i) =>
          r === 'sep' ? (
            <div key={i} role="separator" className="deal-side-sep col-span-2" />
          ) : (
            <Fragment key={i}>
              <dt className="deal-side-muted font-sans text-xs self-baseline">{r.label}</dt>
              <dd className={`m-0 text-right font-mono tabular ${r.big ? 'deal-side-big text-base font-semibold' : ''}`}>
                {r.value}
                {r.sub ? <span className="block deal-side-muted font-sans text-[11px] font-normal">{r.sub}</span> : null}
              </dd>
            </Fragment>
          ),
        )}
        {gl ? (
          <div className="deal-side-gl col-span-2 rounded-md px-2.5 py-2 font-sans text-xs leading-relaxed">{gl}</div>
        ) : null}
      </dl>
      {error ? (
        <div className="mt-4 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}
      <div className="mt-4 grid gap-2">
        <button
          type="submit"
          disabled={disabled || pending}
          className="deal-side-btn w-full font-serif italic text-sm px-5 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? 'Submitting…' : submitLabel}
        </button>
        <Link href={cancelHref} className="deal-side-link text-center text-sm font-sans transition-colors">
          Cancel
        </Link>
      </div>
      {note ? <p className="deal-side-muted font-serif italic text-xs mt-3 leading-relaxed">{note}</p> : null}
    </aside>
  )
}
