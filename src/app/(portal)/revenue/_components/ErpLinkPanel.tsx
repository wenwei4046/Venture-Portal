'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ActionButton, ActionForm, Field, Hidden, Hint, SaveButton } from '@/components/RowForm'
import { formatAgo } from '@/lib/erp-sync/format'
import { formatDate } from '@/lib/utils'
import { linkErpKey, setErpFeedWindow, unlinkErpKey } from '../link-actions'
import type { ErpLinkView } from '../_lib/erp-link'

/**
 * The ERP link, as the Comm Cal page shows it: the key the ERP generated,
 * pasted once; the address the ERP sends to; and when the last delivery
 * landed. The key is typed once and never comes back to the browser — the
 * card shows its last four characters.
 *
 * Everything else about the feed — turning it on, which companies, the queue —
 * lives on the ERP's own Venture Portal Feed page, where the key is made.
 */

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-xs text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-ink">{children}</div>
    </div>
  )
}

/** The receiver address, with a Copy that says so for a moment. */
function ReceiverAddress({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1800)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="font-mono text-xs text-ink break-all">{url}</code>
      <button
        type="button"
        className="text-xs font-sans text-accent hover:underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
          } catch {
            /* the address is on screen to select by hand */
          }
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}

function KeyForm({ view, onDone, onCancel }: { view: ErpLinkView; onDone: () => void; onCancel?: () => void }) {
  return (
    <ActionForm action={linkErpKey} onDone={onDone} className="border border-hairline rounded-md bg-surface p-6">
      {({ pending }) => (
        <>
          <Hidden name="sub_department_id" value={view.subDepartmentId} />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 sm:items-end">
            <label className="block">
              <span className="font-mono text-xs text-muted uppercase tracking-wide mb-1 block">API key from the ERP</span>
              <Field name="api_key" type="password" placeholder="Paste the key the ERP generated" required ariaLabel="API key" />
            </label>
            <div className="flex items-center gap-4">
              <SaveButton pending={pending} label={view.linked ? 'Save key' : 'Link'} />
              {onCancel ? (
                <button type="button" onClick={onCancel} className="text-xs font-sans text-graphite hover:underline">
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
          <p className="font-serif italic text-muted text-xs mt-3">
            The ERP sends to <ReceiverAddress url={view.receiverUrl} /> — its Venture Portal Feed page has that address
            filled in; after pasting the key here, press <em>Test connection</em> there, then <em>Turn on</em>.
          </p>
        </>
      )}
    </ActionForm>
  )
}

/**
 * The window, editable in place.
 *
 * It is on this card rather than in Settings because it is a fact about THIS
 * feed, and because the question it answers — "why is 2023 in my month list?"
 * — is asked while looking at the feed. The ERP has the same setting
 * (`vp.since`); this one does not trust it.
 */
function FeedWindow({ view }: { view: ErpLinkView }) {
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <div className="mt-4 pt-4 border-t border-hairline flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-muted uppercase tracking-wide">Ignore orders before</span>
        <span className="text-sm text-ink">
          {view.minOrderDate ? (
            formatDate(view.minOrderDate)
          ) : (
            <span className="text-danger">nothing — every year the ERP holds will arrive</span>
          )}
        </span>
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-sans text-accent hover:underline">
          Change
        </button>
        {view.windowSetByName ? (
          <span className="font-mono text-[11px] text-muted">
            set by {view.windowSetByName}
            {view.windowSetAt ? ` on ${formatDate(view.windowSetAt)}` : ''}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-hairline">
      <ActionForm action={setErpFeedWindow} onDone={() => setEditing(false)}>
        {({ pending }) => (
          <>
            <Hidden name="sub_department_id" value={view.subDepartmentId} />
            <div className="flex flex-wrap items-end gap-4">
              <label className="block">
                <span className="font-mono text-xs text-muted uppercase tracking-wide mb-1 block">
                  Ignore orders before
                </span>
                <Field
                  name="min_order_date"
                  type="date"
                  width="w-44"
                  defaultValue={view.minOrderDate ?? ''}
                  ariaLabel="Ignore orders before"
                />
              </label>
              <SaveButton pending={pending} />
              <button type="button" onClick={() => setEditing(false)} className="text-xs font-sans text-graphite hover:underline">
                Cancel
              </button>
            </div>
            <p className="font-serif italic text-muted text-xs mt-3 max-w-2xl">
              An order dated before this is accepted and thrown away — the ERP is told the delivery
              succeeded, so its queue never backs up, and no month is created for it. Leave it empty to
              keep everything the ERP sends, including the years of history it back-fills when a feed is
              first switched on.
            </p>
          </>
        )}
      </ActionForm>
    </div>
  )
}

function LinkedCard({ view, lastEventAt, onReplace }: { view: ErpLinkView; lastEventAt: string | null; onReplace: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="border border-hairline rounded-md bg-surface p-6">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="font-serif text-lg text-ink">Houzs ERP</h3>
          <p className="font-mono text-xs text-muted mt-0.5">
            key {view.keyHint}
            {view.linkedByName ? ` · pasted by ${view.linkedByName}` : ''}
            {view.linkedAt ? ` on ${formatDate(view.linkedAt)}` : ''}
          </p>
        </div>
        <span className={`chip ${lastEventAt ? 'ledger' : 'info'}`}>{lastEventAt ? 'Receiving' : 'Waiting for the ERP'}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
        <Fact label="The ERP sends to">
          <ReceiverAddress url={view.receiverUrl} />
        </Fact>
        <Fact label="Last delivery">
          {lastEventAt ? (
            <span className="text-ledger">{formatAgo(lastEventAt, now)}</span>
          ) : (
            <span className="text-graphite">nothing yet</span>
          )}
        </Fact>
      </div>

      {!lastEventAt ? (
        <p className="font-serif italic text-graphite text-xs mt-3">
          Nothing has arrived yet. On the ERP&apos;s Venture Portal Feed page, press <em>Test connection</em> — it
          must answer OK — then <em>Turn on</em>. The first sales order shows up below the moment it lands.
        </p>
      ) : null}
      {view.envSecretSet ? (
        <p className="font-serif italic text-muted text-xs mt-3">
          A server secret (ERP_SYNC_SECRET) is set as well; the receiver accepts either.
        </p>
      ) : null}

      <FeedWindow view={view} />

      <div className="flex flex-wrap items-center gap-4 mt-4">
        <button type="button" onClick={onReplace} className="text-xs font-sans text-accent hover:underline">
          Replace key
        </button>
        <ActionButton
          label="Unlink"
          danger
          confirm="Forget the ERP's key? Its deliveries are refused from now on; orders already received stay."
          run={() => unlinkErpKey(view.subDepartmentId)}
        />
      </div>
    </div>
  )
}

export default function ErpLinkPanel({ view, lastEventAt }: { view: ErpLinkView; lastEventAt: string | null }) {
  const [editing, setEditing] = useState(false)

  return (
    <section className="mb-12">
      <div className="sect-head">
        <h2>Houzs ERP link</h2>
        <span className="rule" aria-hidden />
        <span className="count">{view.linked ? 'LINKED' : 'NOT LINKED'}</span>
      </div>

      {!view.linked ? (
        <Hint>
          On the Houzs ERP, open <em>Venture Portal Feed</em> and press <em>Generate API key</em>. Paste the key
          here and the ERP&apos;s deliveries are accepted — every changed sales order, seconds after it is saved.
          The key is stored encrypted and never shown again.
        </Hint>
      ) : null}

      {view.linked && !editing ? (
        <LinkedCard view={view} lastEventAt={lastEventAt} onReplace={() => setEditing(true)} />
      ) : (
        <KeyForm view={view} onDone={() => setEditing(false)} onCancel={view.linked ? () => setEditing(false) : undefined} />
      )}
    </section>
  )
}
