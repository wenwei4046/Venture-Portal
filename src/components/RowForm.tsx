'use client'

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * The editable-table kit.
 *
 * Written for the Commission settings tab (nine tables of ticks and
 * thresholds) and moved up here on 2026-09-01 when the Team module's title
 * table needed the same thing. Shared because the RowForm trick below is a
 * project-wide rule, not a Commission detail — any table whose rows are forms
 * has to use it.
 *
 * Factored this far and no further: each table still writes its own columns,
 * because their meanings differ.
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

/**
 * A form for one table row.
 *
 * `<form>` is not a legal child of `<tbody>` or `<tr>`, and neither is the
 * wrapper `<div>` ActionForm renders. Doing it anyway — even with
 * `display: contents`, which makes it LOOK right — is a hydration error: the
 * browser's parser moves the tags, React finds a tree it did not build, and
 * every one of these grids logged three errors on load.
 *
 * The fix is the one HTML provides for exactly this case. The form element
 * lives outside the table (portalled to <body>, empty and hidden) and each
 * field points at it by id through the `form` attribute, which is a
 * document-wide reference. The browser still gathers the FormData, Enter still
 * submits, checkbox semantics are still the browser's own.
 *
 * This component renders nothing structural — it is a Fragment — so the caller
 * decides whether its children are a `<tr>` or a run of `<td>`s inside someone
 * else's row.
 *
 * Fields wire themselves up: Field, Tick, Hidden, Choice and SaveButton read
 * the id from context. A raw `<input>` or `<select>` inside a RowForm will NOT
 * be submitted — use those components, or `useRowFormId()`.
 */
interface RowFormState {
  formId: string
  pending: boolean
  error: string | null
}

const RowFormContext = createContext<RowFormState | null>(null)

/** The id a raw control must carry as `form={id}` to be part of the row. */
export function useRowFormId(): string | undefined {
  return useContext(RowFormContext)?.formId
}

export function RowForm({
  action,
  children,
  onDone,
  confirm,
}: {
  action: (fd: FormData) => Promise<unknown>
  children: (state: { pending: boolean }) => ReactNode
  /**
   * Called after a successful save, with whatever the action returned.
   *
   * The argument matters for actions that report something they could NOT do
   * without failing — `setPosition` returns a `MirrorOutcome` whose `note`
   * says the second hierarchy was left disagreeing with the first. That is a
   * return value, not a throw, so the `catch` below never sees it; before this
   * argument existed the row showed a clean save and the note was discarded.
   */
  onDone?: (result: unknown) => void
  confirm?: string
}) {
  // useId is stable across server and client; the punctuation React puts in it
  // is legal in an id but awkward everywhere else, so it is stripped.
  const formId = 'rowform-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // The portal target only exists in the browser. Until it mounts the row
  // renders exactly as the server sent it, which is the point.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <RowFormContext.Provider value={{ formId, pending, error }}>
      {children({ pending })}
      {mounted
        ? createPortal(
            <form
              id={formId}
              hidden
              action={(fd: FormData) => {
                if (confirm && !window.confirm(confirm)) return
                setError(null)
                startTransition(async () => {
                  try {
                    // Two statements, deliberately (2026-09-10). Written as
                    // one — `onDone?.(await action(fd))` — the optional call
                    // short-circuits when there is no onDone, and JavaScript
                    // then never evaluates its argument: the action was not
                    // called at all. No row passes an onDone, so for three
                    // days every Save and Add on every RowForm table flickered
                    // "Saving…", wrote nothing and reported nothing.
                    // RowForm.test.tsx pins this.
                    const result = await action(fd)
                    onDone?.(result)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Something went wrong')
                  }
                })
              }}
            />,
            document.body,
          )
        : null}
    </RowFormContext.Provider>
  )
}

/** A value the row submits but nobody edits. */
export function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={value} form={useRowFormId()} />
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
      form={useRowFormId()}
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
      form={useRowFormId()}
      aria-label={ariaLabel ?? name}
      defaultChecked={defaultChecked}
      className="h-4 w-4 accent-[var(--accent)] align-middle"
    />
  )
}

export function SaveButton({ pending, label = 'Save' }: { pending: boolean; label?: string }) {
  // Inside a RowForm the error has nowhere structural to go — a <tr> cannot be
  // inserted mid-row — so it appears beside the button that was pressed, which
  // is where the reader is looking anyway.
  const row = useContext(RowFormContext)
  return (
    <span className="inline-flex items-center gap-2">
      {row?.error ? (
        <span className="font-serif italic text-danger text-xs">{row.error}</span>
      ) : null}
      <button
        type="submit"
        form={row?.formId}
        disabled={pending}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1 rounded transition-colors disabled:opacity-50"
      >
        {pending ? 'Saving…' : label}
      </button>
    </span>
  )
}

/** A `<select>` that joins its row's form. Options are the children. */
export function Choice({
  name,
  defaultValue,
  required,
  ariaLabel,
  width = 'w-40',
  children,
}: {
  name: string
  defaultValue?: string | null
  required?: boolean
  ariaLabel?: string
  width?: string
  children: ReactNode
}) {
  return (
    <select
      // Re-mounted when the server's value changes (2026-09-05). React 19
      // resets a form after its action, which puts every field back on the
      // default it MOUNTED with — and while React rewrites an input's
      // defaultValue / defaultChecked on re-render, it never rewrites a
      // select's defaultSelected. So a saved change sat on screen as the old
      // choice until a reload: a rank saved as D showed E. The key makes the
      // refreshed value the mount value.
      key={defaultValue ?? ''}
      name={name}
      form={useRowFormId()}
      required={required}
      defaultValue={defaultValue ?? ''}
      aria-label={ariaLabel ?? name}
      className={`px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink ${width}`}
    >
      {children}
    </select>
  )
}

/** Percentages are stored 0–1 and keyed 0–100. */
export function toPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(Math.round(v * 1_000_000) / 10_000)
}
