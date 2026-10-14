'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, DialogMenu, FinDialog } from '@/components/finv/Dialog'
import type { CardTone, HubCardItem } from '@/components/finv/Hub'
import type { HrIconName } from '@/components/hrv/icons'
import { allocatorSummary, batchLabel, byCompanyRows } from '@/lib/allocator-sheet'
import { deleteAllocTxn, generateAllocatorInvoices, getAllocSnapshot, saveAllocSnapshot, setAllocCompanyEnabled, type SnapshotDetailRow } from '../actions'
import { ImportDialog, SnapshotDialog, StaffDialog, monthLong } from './StaffDialogs'
import { CategoryDialog, TemplateDialog } from './SetupDialogs'
import type { AllocatorData, CategoryRow, StaffRow, TemplateRow, TxnRow } from './types'

// What can be done in the Billing Allocator (2026-10-15 — moved out of the
// hub word for word, so the Finance phone app's Billing screens do the same
// things the same way): the month's figures and the hub's cards, Generate
// invoices and Delete (asked first), a record's ⋯ and its invoices, the
// snapshots, the staff / snapshot / import / category / template windows, a
// company turned on or off, the month's snapshot saved — each the allocator's
// own Server Action, answered in words. Calculate is the caller's: the hub's
// drawer, the app's screen.

export type AllocatorCard = 'records' | 'company' | 'staff' | 'setup'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const ALLOCATOR_CARD: Record<AllocatorCard, { label: string; tone: CardTone; icon: HrIconName }> = {
  records: { label: 'Records', tone: 'all', icon: 'doc' },
  company: { label: 'By company', tone: 'company', icon: 'org' },
  staff: { label: 'Staff', tone: 'staff', icon: 'staff' },
  setup: { label: 'Setup', tone: 'quiet', icon: 'tree' },
}
export const ALLOCATOR_CARD_KEYS = Object.keys(ALLOCATOR_CARD) as AllocatorCard[]

export type AllocatorDialog =
  | { kind: 'staff'; person: StaffRow | null }
  | { kind: 'snapshot'; period: string; rows: SnapshotDetailRow[]; savedAt: string | null }
  | { kind: 'import' }
  | { kind: 'category'; category: CategoryRow | null }
  | { kind: 'template'; template: TemplateRow | null }
type Ask = { kind: 'generate' } | { kind: 'delete'; txn: TxnRow }

export function useAllocatorWork({
  data,
  onGone,
  onOpenInvoice,
}: {
  data: AllocatorData
  /** The record on show is gone (deleted). */
  onGone: () => void
  /** One of a billed record's invoices, opened. */
  onOpenInvoice: (id: string) => void
}) {
  const router = useRouter()
  const month = data.period
  const mm = Number(month.slice(5, 7))
  const monthName = monthLong(month)

  // A dialog stays mounted while it plays out (open: false); the next one, a new nonce, starts afresh.
  const [dialog, setDialog] = useState<(AllocatorDialog & { nonce: number; open: boolean }) | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [menu, setMenu] = useState<'more' | 'invoices' | 'snapshots' | null>(null)
  const [menuFor, setMenuFor] = useState<TxnRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = allocatorSummary(data.txns, data.invoices)
  const shares = useMemo(() => byCompanyRows(data.txns, data.invoices).filter((r) => !r.own), [data.txns, data.invoices])
  const withBalance = shares.filter((r) => r.toBill > 0.005).length
  const active = data.staff.filter((s) => s.status === 'active').length
  const enabled = data.companySettings.filter((c) => c.enabled).length

  const cards: HubCardItem[] = ALLOCATOR_CARD_KEYS.map((k) => {
    const look = ALLOCATOR_CARD[k]
    const [sub, value] =
      k === 'records'
        ? [`${plural(summary.txnCount, 'expense', 'expenses')} · ${summary.toBillCount} to bill`, `${rm(summary.toBill)} to bill`]
        : k === 'company'
          ? [`${plural(shares.length, 'company', 'companies')} · ${withBalance} with a balance`, `${rm(summary.billed)} billed`]
          : k === 'staff'
            ? [plural(data.staff.length, 'person', 'people'), `${active} active`]
            : [`${plural(data.templates.length, 'template', 'templates')} · ${plural(data.categories.length, 'category', 'categories')}`, `${enabled} / ${data.companySettings.length} companies`]
    return { key: k, tone: look.tone, icon: look.icon, label: look.label, sub, value }
  })
  const notice = summary.toBill > 0.005 ? `To bill ${rm(summary.toBill)} across ${plural(summary.toBillTargets, 'company', 'companies')} — Generate invoices bills every company’s share in one go.` : null

  // ── Doing things ──
  const done = (message: string) => {
    flash(message)
    router.refresh()
  }
  // A refusal is said where the step was asked — in its confirm, or (a list's own button) as the toast.
  async function run(call: () => Promise<{ error?: string }>, message: string, inToast = false): Promise<boolean> {
    setBusy(true)
    setError(null)
    const refuse = (reason: string) => (inToast ? flash(reason) : setError(reason))
    try {
      const res = await call()
      if (res.error) {
        refuse(res.error)
        return false
      }
      done(message)
      return true
    } catch (err) {
      refuse(err instanceof Error ? err.message : 'That did not go through. Try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const open = (d: AllocatorDialog) => setDialog({ ...d, nonce: Date.now(), open: true })
  const closeDialog = () => setDialog((d) => (d ? { ...d, open: false } : d))
  const closeAsk = () => {
    if (busy) return
    setAsk(null)
    setError(null)
  }
  const confirmAsk = async () => {
    if (!ask || busy) return
    if (ask.kind === 'generate') {
      setBusy(true)
      setError(null)
      try {
        const res = await generateAllocatorInvoices(month)
        if (res.error) {
          setError(res.error)
          return
        }
        const first = res.created[0]?.invoiceNo ?? null
        flash(
          res.created.length === 0
            ? 'Nothing to bill'
            : `${res.created.length === 1 ? 'Invoice' : 'Invoices'} generated · ${first ?? 'a draft'}${res.created.length > 1 ? ` + ${res.created.length - 1} more` : ''}`,
        )
        setAsk(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
      } finally {
        setBusy(false)
      }
      return
    }
    const txn = ask.txn
    const ok = await run(() => deleteAllocTxn(txn.id), 'Allocation deleted')
    if (ok) {
      setAsk(null)
      onGone()
    }
  }

  const labelOfTarget = (id: string | null) =>
    id === null
      ? 'HV own'
      : (data.companySettings.find((c) => c.id === id)?.label ?? data.departments.find((dp) => dp.id === id)?.label.replace(/ \(dept\)$/, '') ?? '?')
  const invoicesOf = (t: TxnRow | null) => (t?.locked && t.billedRef ? data.invoices.filter((i) => i.ref === t.billedRef) : [])

  const openSnapshot = async (period: string) => {
    setMenu(null)
    setBusy(true)
    try {
      const res = await getAllocSnapshot(period)
      if (res.error) {
        flash(res.error)
        return
      }
      open({ kind: 'snapshot', period, rows: res.rows, savedAt: res.savedAt })
    } catch {
      flash('The snapshot did not load. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // ── The confirms ──
  const askTitle = ask?.kind === 'generate' ? 'Generate invoices?' : ask ? `Delete ${ask.txn.txnNo}?` : ''
  const askText =
    ask?.kind === 'generate'
      ? `Bills ${rm(summary.toBill)} across ${plural(summary.toBillTargets, 'company', 'companies')} as one draft invoice each. ${plural(summary.toBillCount, 'allocation becomes', 'allocations become')} billed.`
      : 'Removes the allocation before any invoice is made.'

  const dialogs: ReactNode = (
    <>
      <FinDialog open={menu === 'more'} onClose={() => setMenu(null)} title={menuFor?.txnNo ?? ''}>
        <DialogMenu
          items={
            menuFor
              ? [
                  {
                    key: 'delete',
                    label: 'Delete allocation',
                    danger: true,
                    onClick: () => {
                      setMenu(null)
                      setError(null)
                      setAsk({ kind: 'delete', txn: menuFor })
                    },
                  },
                ]
              : []
          }
        />
      </FinDialog>
      <FinDialog open={menu === 'invoices'} onClose={() => setMenu(null)} title={menuFor ? `${menuFor.txnNo} · its invoices` : ''} sub={menuFor ? batchLabel(menuFor) : undefined}>
        <DialogMenu
          items={invoicesOf(menuFor).map((i) => ({
            key: i.id,
            label: i.invoiceNo,
            sub: `${i.companyLabel.replace(/ \(dept\)$/, '')} · ${i.status === 'paid_via_netting' ? 'paid via netting' : i.status}`,
            onClick: () => {
              setMenu(null)
              onOpenInvoice(i.id)
            },
          }))}
        />
      </FinDialog>
      <FinDialog open={menu === 'snapshots'} onClose={() => setMenu(null)} title="Snapshots" sub="Each month’s list as it was saved">
        <DialogMenu
          items={data.snapshotPeriods.map((p) => ({
            key: p,
            label: `${monthLong(p)} snapshot`,
            onClick: () => void openSnapshot(p),
          }))}
        />
      </FinDialog>
      <FinDialog open={!!ask} onClose={closeAsk} title={askTitle} locked={busy}>
        <DialogConfirm
          text={askText}
          confirmLabel={busy ? 'Working…' : ask?.kind === 'generate' ? 'Generate invoices' : 'Delete'}
          danger={ask?.kind === 'delete'}
          busy={busy}
          error={ask ? error : null}
          onCancel={closeAsk}
          onConfirm={() => void confirmAsk()}
        />
      </FinDialog>

      {dialog?.kind === 'staff' ? (
        <StaffDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} data={data} person={dialog.person} />
      ) : dialog?.kind === 'snapshot' ? (
        <SnapshotDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} period={dialog.period} rows={dialog.rows} savedAt={dialog.savedAt} labelOf={labelOfTarget} />
      ) : dialog?.kind === 'import' ? (
        <ImportDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} hrPeriods={data.hrPeriods} />
      ) : dialog?.kind === 'category' ? (
        <CategoryDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} data={data} category={dialog.category} />
      ) : dialog?.kind === 'template' ? (
        <TemplateDialog key={dialog.nonce} open={dialog.open} onClose={closeDialog} onDone={done} data={data} template={dialog.template} />
      ) : null}
    </>
  )

  return {
    summary,
    shares,
    withBalance,
    active,
    enabled,
    cards,
    notice,
    busy,
    error,
    setError,
    /** What a drawer or record shows: the error of a step taken on it, not one its confirm shows. */
    shownError: ask ? null : error,
    done,
    run,
    open,
    labelOfTarget,
    invoicesOf,
    askGenerate: () => {
      setError(null)
      setAsk({ kind: 'generate' })
    },
    askDelete: (txn: TxnRow) => {
      setError(null)
      setAsk({ kind: 'delete', txn })
    },
    openMore: (t: TxnRow) => {
      setMenuFor(t)
      setMenu('more')
    },
    openInvoices: (t: TxnRow) => {
      setMenuFor(t)
      setMenu('invoices')
    },
    openSnapshots: () => setMenu('snapshots'),
    closeMenus: () => setMenu(null),
    saveSnapshot: () => void run(() => saveAllocSnapshot(month), `${monthName} snapshot saved · ${plural(data.staff.length, 'person', 'people')}`, true),
    snapshotLabel: `Save ${MON[mm - 1]} snapshot`,
    toggleCompany: (c: AllocatorData['companySettings'][number]) =>
      void run(() => setAllocCompanyEnabled(c.id, !c.enabled), c.enabled ? `${c.name ?? c.label} taken out of the allocation` : `${c.name ?? c.label} back in the allocation`, true),
    dialogs,
  }
}
