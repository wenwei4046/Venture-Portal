'use client'

import { useState, useTransition, type ReactNode } from 'react'

/**
 * Small shared pieces for the Commission tab. The tab is nine tables of ticks
 * and thresholds, so the repetition is worth factoring — but no further: each
 * table still writes its own columns, because their meanings differ.
 */

export function SectionHead({
  title,
  count,
  action,
}: {
  title: string
  count?: string
  action?: ReactNode
}) {
  return (
    <div className="sect-head">
      <h2>{title}</h2>
      <span className="rule" aria-hidden />
      {count ? <span className="count">{count}</span> : null}
      {action ? <span className="ml-3">{action}</span> : null}
    </div>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl leading-relaxed">{children}</p>
  )
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
      {error}
    </div>
  )
}

/** A form that reports its own errors and disables while in flight. */
export function ActionForm({
  action,
  children,
  className,
  onDone,
  confirm,
}: {
  action: (fd: FormData) => Promise<unknown>
  children: (state: { pending: boolean }) => ReactNode
  className?: string
  onDone?: () => void
  confirm?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className={className}>
      <ErrorNote error={error} />
      <form
        action={(fd: FormData) => {
          if (confirm && !window.confirm(confirm)) return
          setError(null)
          startTransition(async () => {
            try {
              await action(fd)
              onDone?.()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Something went wrong')
            }
          })
        }}
      >
        {children({ pending })}
      </form>
    </div>
  )
}

/** A button that runs a non-form action, with its own error slot. */
export function ActionButton({
  run,
  label,
  confirm,
  danger,
}: {
  run: () => Promise<unknown>
  label: string
  confirm?: string
  danger?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="font-serif italic text-danger text-xs">{error}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return
          setError(null)
          startTransition(async () => {
            try {
              await run()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed')
            }
          })
        }}
        className={
          danger
            ? 'text-xs font-sans text-danger hover:underline disabled:opacity-50'
            : 'text-xs font-sans text-accent hover:underline disabled:opacity-50'
        }
      >
        {pending ? '…' : label}
      </button>
    </span>
  )
}

const INPUT =
  'px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink focus:outline-none focus:border-accent-border'

export function Field({
  name,
  defaultValue,
  placeholder,
  type = 'text',
  width = 'w-full',
  step,
  required,
  ariaLabel,
}: {
  name: string
  defaultValue?: string | number | null
  placeholder?: string
  type?: string
  width?: string
  step?: string
  required?: boolean
  ariaLabel?: string
}) {
  return (
    <input
      name={name}
      type={type}
      step={step}
      required={required}
      aria-label={ariaLabel ?? name}
      defaultValue={defaultValue ?? undefined}
      placeholder={placeholder}
      className={`${INPUT} ${width} ${type === 'number' ? 'text-right tabular-nums' : ''}`}
    />
  )
}

export function Tick({
  name,
  defaultChecked,
  ariaLabel,
}: {
  name: string
  defaultChecked?: boolean
  ariaLabel?: string
}) {
  return (
    <input
      type="checkbox"
      name={name}
      aria-label={ariaLabel ?? name}
      defaultChecked={defaultChecked}
      className="h-4 w-4 accent-[var(--accent)] align-middle"
    />
  )
}

export function SaveButton({ pending, label = 'Save' }: { pending: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1 rounded transition-colors disabled:opacity-50"
    >
      {pending ? 'Saving…' : label}
    </button>
  )
}

/** Percentages are stored 0–1 and keyed 0–100. */
export function toPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(Math.round(v * 1_000_000) / 10_000)
}
