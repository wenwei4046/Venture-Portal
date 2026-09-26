'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import LedgerRow from '@/components/LedgerRow'
import { formatMoney } from '@/lib/utils'
import { deleteUpsale, recordUpsale, reopenErpAdjustment, updateUpsale, type UpsaleForm } from '../../../upsale-actions'
import type { FairChoice, UpsaleView } from '../../../_lib/upsales'

interface Props {
  subDepartmentId: string
  /** YYYY-MM-01 — the month these upsales are paid in. */
  period: string
  upsales: UpsaleView[]
  /** The sub-department's team: only they are paid by its run. */
  team: { staffId: string; name: string }[]
  fairs: FairChoice[]
  /** The month's run has paid: nothing here may change until it is reopened. */
  locked: boolean
}

const FIELD =
  'px-2 py-1.5 bg-paper border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent-border'

const EMPTY: UpsaleForm = { staffId: '', kind: 'upsale', amount: '', soldOn: '', fairEventId: '', originalRef: '', note: '' }

function day(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * The month's upsales, recorded by hand (2026-09-24).
 *
 * A customer adds to an earlier order and only the added amount earns
 * (`lib/commission/upsales.ts`). The ERP cannot say what was added, so HR
 * records it here: who sold it, how much was added, the day and the fair, and
 * the paper bill it was added to — the way the claim form names it. The run
 * pays it at the salesperson's own rate and counts it toward their upline's
 * override the next time the month is computed.
 *
 * A drop (2026-09-26) is the same thing the other way: typed positive, stored
 * negative, it takes its commission back. The ERP's own finds join the list
 * once somebody pays them here (`ErpChangesPanel`); those are not edited or
 * deleted — Undo puts one back to wait.
 */
export default function UpsaleSection({ subDepartmentId, period, upsales, team, fairs, locked }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<UpsaleForm>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const total = upsales.reduce((a, u) => a + u.amount, 0)
  const drops = upsales.filter(u => u.kind === 'drop')
  const adds = upsales.filter(u => u.kind !== 'drop')
  const set = (k: keyof UpsaleForm) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  function run(action: () => Promise<void>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        after?.()
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  function reset() {
    setForm(EMPTY)
    setEditingId(null)
    setError(null)
  }

  function save() {
    run(
      () => (editingId ? updateUpsale(editingId, form) : recordUpsale(subDepartmentId, period, form)),
      reset,
    )
  }

  function edit(u: UpsaleView) {
    setConfirmId(null)
    setError(null)
    setEditingId(u.id)
    setForm({
      staffId: u.staffId,
      kind: u.kind,
      amount: Math.abs(u.amount).toFixed(2),
      soldOn: u.soldOn,
      fairEventId: u.fairEventId ?? '',
      originalRef: u.originalRef,
      note: u.note ?? '',
    })
  }

  function pickFair(id: string) {
    setForm(f => ({
      ...f,
      fairEventId: id,
      // A fair implies the day it opened, unless a day is already typed.
      soldOn: f.soldOn || fairs.find(x => x.id === id)?.startDate || '',
    }))
  }

  return (
    <section className="mt-6">
      <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
        A customer added to an order they placed earlier (an upsale), or took something off one
        whose commission was already paid (a drop). Only the difference counts: the
        salesperson&apos;s own rate, and it moves their upline&apos;s override the same way — a drop
        takes it back. It is not a bill, so there is no deposit gate, Open Bill or margin. The run
        pays it the next time this month is computed. Drops and upsells the ERP finds on settled
        bills wait at the top of the page until somebody confirms them.
      </p>

      {locked ? (
        <p className="font-serif italic text-sm mb-4 border border-hairline rounded-card bg-surface px-4 py-3 text-ink">
          This month&apos;s run has paid. Reopen it before changing its upsales.
        </p>
      ) : (
        <div className="border border-hairline rounded-card bg-surface p-3 mb-4">
          <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted mb-2">
            {editingId ? 'Change this entry' : 'Record an upsale or a drop'}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={form.staffId}
              onChange={e => set('staffId')(e.target.value)}
              aria-label="Salesperson"
              className={`${FIELD} min-w-[11rem]`}
            >
              <option value="">Salesperson…</option>
              {team.map(m => (
                <option key={m.staffId} value={m.staffId}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={form.kind}
              onChange={e => set('kind')(e.target.value)}
              aria-label="Upsale or drop"
              className={FIELD}
            >
              <option value="upsale">Upsale (+)</option>
              <option value="drop">Drop sales (−)</option>
            </select>
            <label className="flex items-center gap-1 text-sm text-muted">
              RM
              <input
                inputMode="decimal"
                value={form.amount}
                onChange={e => set('amount')(e.target.value)}
                placeholder="300.00"
                aria-label={form.kind === 'drop' ? 'Amount dropped' : 'Amount added'}
                className={`${FIELD} w-28 text-right tabular-nums`}
              />
            </label>
            <input
              type="date"
              value={form.soldOn}
              onChange={e => set('soldOn')(e.target.value)}
              aria-label="Sold on"
              className={FIELD}
            />
            <select
              value={form.fairEventId}
              onChange={e => pickFair(e.target.value)}
              aria-label="Fair"
              className={`${FIELD} max-w-[18rem]`}
            >
              <option value="">No fair</option>
              {fairs.map(f => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <input
              value={form.originalRef}
              onChange={e => set('originalRef')(e.target.value)}
              placeholder={form.kind === 'drop' ? 'Dropped from bill, e.g. HC13911' : 'Added to bill, e.g. HC5315'}
              aria-label={form.kind === 'drop' ? 'Dropped from bill' : 'Added to bill'}
              className={`${FIELD} w-48`}
            />
            <input
              value={form.note}
              onChange={e => set('note')(e.target.value)}
              placeholder="Note"
              aria-label="Note"
              className={`${FIELD} flex-1 min-w-[10rem]`}
            />
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-control transition-colors disabled:opacity-40"
            >
              {isPending ? 'Saving…' : editingId ? 'Save changes' : form.kind === 'drop' ? 'Record drop' : 'Record upsale'}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={reset}
                disabled={isPending}
                className="font-serif italic text-sm text-muted hover:text-ink px-2"
              >
                Cancel
              </button>
            ) : null}
          </div>
          {error ? (
            <div role="alert" className="font-serif italic text-danger text-sm mt-2">
              {error}
            </div>
          ) : null}
        </div>
      )}

      {upsales.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">No upsales or drops paid in this month.</p>
      ) : (
        <>
          <div className="font-mono text-[10.5px] uppercase tracking-wide text-graphite mb-2">
            {adds.length} {adds.length === 1 ? 'upsale' : 'upsales'}
            {drops.length ? ` · ${drops.length} ${drops.length === 1 ? 'drop' : 'drops'}` : ''} · net {formatMoney(total)}
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th className="m-hide">Sold on</th>
                  <th className="m-hide">Kind</th>
                  <th className="m-hide">Bill</th>
                  <th className="m-hide">Fair</th>
                  <th className="m-hide">Note</th>
                  <th className="right">Amount</th>
                  {locked ? null : <th className="m-hide" aria-label="Actions" />}
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {upsales.map(u => (
                  <LedgerRow key={u.id} className={editingId === u.id ? 'bg-accent-bg' : undefined}>
                    <td className="font-serif text-[15px] text-ink">{u.staffName}</td>
                    <td className="m-hide whitespace-nowrap" data-label="Sold on">{day(u.soldOn)}</td>
                    <td className="m-hide whitespace-nowrap" data-label="Kind">
                      <span className={`font-mono text-[10.5px] uppercase ${u.kind === 'drop' ? 'text-danger' : 'text-ledger'}`}>
                        {u.kind === 'drop' ? 'Drop sales' : 'Upsale'}
                      </span>
                      {u.source === 'erp' ? <small className="block font-mono text-[10px] text-muted">found by the ERP</small> : null}
                    </td>
                    <td className="font-mono text-xs m-hide whitespace-nowrap" data-label="Bill">{u.originalRef}</td>
                    <td className="m-hide text-sm text-graphite" data-label="Fair">{u.fairLabel ?? '—'}</td>
                    <td className="m-hide font-serif italic text-sm text-graphite" data-label="Note">{u.note ?? ''}</td>
                    <td className="num whitespace-nowrap">{u.amount < 0 ? <span className="neg">{formatMoney(u.amount)}</span> : formatMoney(u.amount)}</td>
                    {locked ? null : u.source === 'erp' ? (
                      <td className="m-hide whitespace-nowrap" data-label="Actions">
                        {/* Found by the ERP: not edited or deleted, only put back to wait. */}
                        {confirmId === u.id ? (
                          <button
                            type="button"
                            onClick={() => run(() => reopenErpAdjustment(u.id), () => setConfirmId(null))}
                            disabled={isPending}
                            className="font-mono text-[10px] uppercase tracking-wide text-danger"
                          >
                            Confirm — back to waiting
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmId(u.id)}
                            disabled={isPending}
                            className="font-mono text-[10px] uppercase tracking-wide text-muted hover:text-accent"
                          >
                            Undo
                          </button>
                        )}
                      </td>
                    ) : (
                      <td className="m-hide whitespace-nowrap" data-label="Actions">
                        <button
                          type="button"
                          onClick={() => edit(u)}
                          disabled={isPending}
                          className="font-mono text-[10px] uppercase tracking-wide text-muted hover:text-accent mr-3"
                        >
                          Edit
                        </button>
                        {confirmId === u.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              run(() => deleteUpsale(u.id), () => {
                                setConfirmId(null)
                                if (editingId === u.id) reset()
                              })
                            }
                            disabled={isPending}
                            className="font-mono text-[10px] uppercase tracking-wide text-danger"
                          >
                            Confirm delete
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmId(u.id)}
                            disabled={isPending}
                            className="font-mono text-[10px] uppercase tracking-wide text-muted hover:text-danger"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    )}
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
