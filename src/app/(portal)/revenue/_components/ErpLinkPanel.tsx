'use client'

import { useState, type ReactNode } from 'react'
import { ActionButton, ActionForm, Field, Hidden, Hint, SaveButton } from '@/components/RowForm'
import { formatAgo } from '@/lib/erp-sync/format'
import { formatDate } from '@/lib/utils'
import { addPullStats, describePull, emptyPullStats, type PullItem } from '@/lib/erp-link/stats'
import { linkErp, planErpPull, pullErpDocs, recordErpPull, testErpLink, unlinkErp } from '../link-actions'
import type { ErpLinkView } from '../_lib/erp-link'

/**
 * The ERP link, as the Comm Cal page shows it: whether the Houzs ERP is
 * linked, as whom, when it was last reached, and the control that syncs a
 * month of sales orders through the same ingest the push feed uses.
 *
 * The key is typed once, proven against the ERP inside the action, and never
 * comes back to the browser — the card shows its last four characters.
 *
 * A sync is three server actions the panel drives in turn: list the month
 * (plan), read the changed documents a few dozen at a time (pull), record
 * the result. Driving it from here is what lets the page say "42 / 300 read"
 * while it runs, and what keeps each server call well inside its time.
 */

/** Documents per pull step: ~two ERP requests each, four at a time. */
const STEP = 30

function monthLabel(period: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return period
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  )
}

const INPUT = 'px-2 py-1 bg-paper border border-hairline rounded text-sm text-ink focus:outline-none focus:border-accent-border'

function LinkForm({ view, onDone, onCancel }: { view: ErpLinkView; onDone: () => void; onCancel?: () => void }) {
  return (
    <ActionForm action={linkErp} onDone={onDone} className="border border-hairline rounded-md bg-surface p-6">
      {({ pending }) => (
        <>
          <Hidden name="sub_department_id" value={view.subDepartmentId} />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_8rem] gap-4">
            <label className="block">
              <span className="font-mono text-xs text-muted uppercase tracking-wide mb-1 block">ERP address</span>
              <Field name="base_url" defaultValue={view.baseUrl} placeholder="https://erp.houzscentury.com" required ariaLabel="ERP address" />
            </label>
            <label className="block">
              <span className="font-mono text-xs text-muted uppercase tracking-wide mb-1 block">API key</span>
              <Field name="api_key" type="password" placeholder="Paste the key from the ERP" required ariaLabel="API key" />
            </label>
            <label className="block">
              <span className="font-mono text-xs text-muted uppercase tracking-wide mb-1 block">Company</span>
              <Field name="company_id" type="number" defaultValue={view.companyId} step="1" required ariaLabel="ERP company id" />
            </label>
          </div>
          <p className="font-serif italic text-muted text-xs mt-2">
            Company is the ERP&apos;s number for the company whose orders pay this programme — Houzs Century is 1.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <SaveButton pending={pending} label={view.linked ? 'Save key' : 'Link ERP'} />
            {onCancel ? (
              <button type="button" onClick={onCancel} className="text-xs font-sans text-graphite hover:underline">
                Cancel
              </button>
            ) : null}
            {pending ? <span className="font-serif italic text-xs text-graphite">Asking the ERP who this key is…</span> : null}
          </div>
        </>
      )}
    </ActionForm>
  )
}

function LinkedCard({ view, onReplace }: { view: ErpLinkView; onReplace: () => void }) {
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const identity = view.identity
  const ok = view.lastCheckOk !== false

  return (
    <div className="border border-hairline rounded-md bg-surface p-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="font-serif text-lg text-ink">{view.host}</h3>
          <p className="font-mono text-xs text-muted mt-0.5">
            Company {view.companyId} · key {view.keyHint}
            {view.linkedByName ? ` · linked by ${view.linkedByName}` : ''}
            {view.linkedAt ? ` on ${formatDate(view.linkedAt)}` : ''}
          </p>
        </div>
        <span className={`chip ${ok ? 'ledger' : 'danger'}`}>{ok ? 'Connected' : 'Check failed'}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Fact label="Signed in as">
          {identity ? (identity.service ? 'ERP service key' : identity.name) : '—'}
          {identity && !identity.service && identity.role ? (
            <span className="font-serif italic text-graphite"> · {identity.role}</span>
          ) : null}
        </Fact>
        <Fact label="Last check">
          <span className={ok ? 'text-ledger' : 'text-danger'}>{ok ? 'OK' : 'Failed'}</span>
          <span className="font-mono text-xs text-muted"> · {formatAgo(view.lastCheckAt)}</span>
        </Fact>
        <Fact label="Last sync">
          {view.lastPullPeriod ? monthLabel(view.lastPullPeriod) : 'Never'}
          {view.lastPullAt ? <span className="font-mono text-xs text-muted"> · {formatAgo(view.lastPullAt)}</span> : null}
        </Fact>
        <Fact label="Remembered">
          <span className="num">{view.tracked}</span> <span className="text-graphite">orders</span>
        </Fact>
      </div>

      {view.lastPullNote ? <p className="font-serif italic text-graphite text-xs mt-3">{view.lastPullNote}</p> : null}
      {!ok && view.lastCheckNote ? <p className="font-serif italic text-danger text-xs mt-3">{view.lastCheckNote}</p> : null}
      {identity && !identity.service ? (
        <p className="font-serif italic text-alert text-xs mt-3">
          This is {identity.name}&apos;s personal sign-in. The ERP ends it after seven days or when they sign out; for a
          link that lasts, paste the ERP&apos;s service key instead.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 mt-4">
        <ActionButton
          label="Test connection"
          run={async () => {
            const r = await testErpLink(view.subDepartmentId)
            setCheckNote(r.note)
          }}
        />
        <button type="button" onClick={onReplace} className="text-xs font-sans text-accent hover:underline">
          Replace key
        </button>
        <ActionButton
          label="Unlink"
          danger
          confirm="Unlink the ERP? The key is forgotten; orders already synced stay."
          run={() => unlinkErp(view.subDepartmentId)}
        />
        {checkNote ? <span className="font-serif italic text-xs text-graphite">{checkNote}</span> : null}
      </div>
    </div>
  )
}

function SyncControl({ view }: { view: ErpLinkView }) {
  const [month, setMonth] = useState(view.defaultPeriod.slice(0, 7))
  const [force, setForce] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Array<{ docNo: string; message: string }>>([])

  const period = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : view.defaultPeriod

  async function run() {
    setBusy(true)
    setError(null)
    setErrors([])
    setNote(`Listing ${monthLabel(period)} on the ERP…`)
    try {
      const plan = await planErpPull(view.subDepartmentId, period, force)
      let stats = addPullStats(emptyPullStats(), { listed: plan.listed, unchanged: plan.unchanged })
      const failures: Array<{ docNo: string; message: string }> = []
      const items: PullItem[] = plan.items
      for (let i = 0; i < items.length; i += STEP) {
        setNote(`${monthLabel(period)}: reading ${Math.min(i + STEP, items.length)} of ${items.length} changed orders…`)
        const r = await pullErpDocs(view.subDepartmentId, period, items.slice(i, i + STEP))
        stats = addPullStats(stats, r.stats)
        failures.push(...r.errors)
        setErrors([...failures])
      }
      const summary = describePull(stats)
      await recordErpPull(view.subDepartmentId, period, stats, summary)
      setNote(
        items.length === 0
          ? `${monthLabel(period)} checked · ${plan.listed} orders on the ERP, nothing changed since the last sync.`
          : `${monthLabel(period)} synced · ${summary}`,
      )
    } catch (err) {
      setNote(null)
      setError(err instanceof Error ? err.message : 'The sync failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-hairline rounded-md bg-surface p-6 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <label className="block">
          <span className="font-mono text-xs text-muted uppercase tracking-wide mb-1 block">Month</span>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            disabled={busy}
            aria-label="Month to sync"
            className={`${INPUT} font-mono`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-graphite sm:pb-1.5">
          <input
            type="checkbox"
            checked={force}
            onChange={e => setForce(e.target.checked)}
            disabled={busy}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Re-read every order, not only what changed
        </label>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          {busy ? 'Syncing…' : `Sync ${monthLabel(period)}`}
        </button>
      </div>
      <p className="font-serif italic text-muted text-xs mt-3">
        Reads the month&apos;s sales orders from the ERP and puts each changed one through the same ingest as the
        live feed — a month whose run is applied is held, as it would be from the feed.
      </p>
      {note ? (
        <p className="font-serif italic text-sm text-graphite mt-3" aria-live="polite">
          {note}
        </p>
      ) : null}
      {error ? <p className="font-serif italic text-sm text-danger mt-3">{error}</p> : null}
      {errors.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {errors.slice(0, 8).map(e => (
            <li key={e.docNo} className="font-mono text-[11px] text-danger">
              {e.docNo} · {e.message}
            </li>
          ))}
          {errors.length > 8 ? <li className="font-mono text-[11px] text-muted">… and {errors.length - 8} more</li> : null}
        </ul>
      ) : null}
    </div>
  )
}

export default function ErpLinkPanel({ view }: { view: ErpLinkView }) {
  const [editing, setEditing] = useState(false)

  return (
    <section className="mb-12">
      <div className="sect-head">
        <h2>Houzs ERP link</h2>
        <span className="rule" aria-hidden />
        <span className="count">{view.linked ? `LINKED · ${view.host.toUpperCase()}` : 'NOT LINKED'}</span>
      </div>

      {!view.linked ? (
        <Hint>
          Paste the API key the Houzs ERP issued and the portal reads Fair&apos;s sales orders from it directly —
          no waiting on the ERP&apos;s push feed. The key is checked against the ERP before it is kept, stored
          encrypted, and never shown again.
        </Hint>
      ) : null}

      {view.linked && !editing ? (
        <LinkedCard view={view} onReplace={() => setEditing(true)} />
      ) : (
        <LinkForm view={view} onDone={() => setEditing(false)} onCancel={view.linked ? () => setEditing(false) : undefined} />
      )}

      {view.linked ? <SyncControl view={view} /> : null}
    </section>
  )
}
