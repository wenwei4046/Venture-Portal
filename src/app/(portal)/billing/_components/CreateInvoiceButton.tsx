'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import {
  createManualInvoice,
  fetchDirectorCtcByCompany,
  type BillableToKind,
  type CreateInvoiceMode,
} from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

interface Company {
  id: string
  name: string
  short_code: string
}

interface Department {
  id: string
  name: string
}

interface Category {
  code: string
  label: string
  type: AccountType
  parent_code: string | null
}

interface Props {
  companies: Company[]
  currentPeriod: string
  prefillMode?: CreateInvoiceMode
  /** Amount the dept payroll tells us we need to bill this period. */
  targetAmount?: number
  /** Amount already invoiced for this mode in the period. */
  alreadyInvoiced?: number
  /** compact mode renders a small link-style button for embedding in KPI cards */
  compact?: boolean
  /** label override for the button; defaults to "+ Create Invoice" */
  label?: string
  /** Item 5: pass departments so dept-pool billable target gets a select. */
  departments?: Department[]
  /** Phase 11 / post-unified-COA: chart_of_accounts rows projected to
   *  { code, label } for GL routing. Required for new flow. */
  categories?: Category[]
}

const BILLABLE_OPTIONS: Array<{ value: BillableToKind; label: string; hint: string }> = [
  { value: 'subsidiary', label: 'Subsidiary', hint: 'Bill a HOUZS group company. Supports multi-row split + multi-pool template.' },
  { value: 'director',   label: 'Director',   hint: 'Bill a director (free-text name). Single pool + category.' },
  { value: 'dept_pool',  label: 'Dept Pool',  hint: 'Bill an internal department pool. Supports multi-pool split.' },
  { value: 'freetext',   label: 'Other',      hint: 'External party — vendor, partner, anyone. Supports multi-pool split.' },
]

const POOL_OPTIONS: Array<{ value: CreateInvoiceMode; label: string }> = [
  { value: 'venture_attribution',         label: 'Venture Pool' },
  { value: 'marketing_project',           label: 'Marketing Department Pool' },
  { value: 'hr_attribution',              label: 'HR Department Pool' },
  { value: 'finance_attribution',         label: 'Finance Department Pool' },
  { value: 'director_office_attribution', label: 'Director Office Department Pool' },
  { value: 'director_attribution',        label: 'Director Department Pool' },
]

interface SubRow {
  uid: string
  companyId: string
  amount: string
}

interface PoolRow {
  uid: string
  mode: CreateInvoiceMode | ''
  categoryCode: string
  amount: string
}

function newSubRow(): SubRow {
  return { uid: crypto.randomUUID(), companyId: '', amount: '' }
}

function newPoolRow(prefillMode?: CreateInvoiceMode): PoolRow {
  return {
    uid: crypto.randomUUID(),
    mode: prefillMode ?? '',
    categoryCode: '',
    amount: '',
  }
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CreateInvoiceButton({
  companies,
  currentPeriod,
  prefillMode = 'hr_attribution',
  targetAmount = 0,
  alreadyInvoiced = 0,
  compact = false,
  label,
  departments = [],
  categories = [],
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Bill-to type. Subsidiary / Dept Pool / Other support multi-pool template.
  // Director keeps the simple single-pool + single-category flow.
  const [billableType, setBillableType] = useState<BillableToKind>('subsidiary')
  const [singleName, setSingleName] = useState('')          // director + freetext
  const [singleDeptId, setSingleDeptId] = useState('')      // dept_pool

  // Director-only single-pool fields
  const [directorMode, setDirectorMode] = useState<CreateInvoiceMode>(prefillMode)
  const [directorCategory, setDirectorCategory] = useState('')
  const [directorAmount, setDirectorAmount] = useState('')

  // Project categories → AccountPicker option shape (mig 246). The picker
  // hides headers + supports typeahead; previously this was a native
  // <select> that listed every category including parent rows.
  const categoryOptions: AccountOption[] = useMemo(
    () =>
      categories.map((c) => ({
        code: c.code,
        name: c.label,
        type: c.type,
        parent_code: c.parent_code,
        is_active: true,
      })),
    [categories],
  )

  // Multi-pool table — used by subsidiary / dept_pool / freetext
  const [poolRows, setPoolRows] = useState<PoolRow[]>([newPoolRow(prefillMode)])

  const modalContentRef = useRef<HTMLDivElement>(null)
  // When the modal opens, scroll the backdrop to the top so the modal header
  // is visible (was opening with the user's previous page scroll position
  // still in effect; with overflow on the backdrop the modal could land off
  // screen and require an upward scroll).
  useLayoutEffect(() => {
    if (!open) return
    const el = modalContentRef.current?.parentElement
    if (el && 'scrollTop' in el) el.scrollTop = 0
  }, [open])

  const [period, setPeriod] = useState(dayjs(currentPeriod).format('YYYY-MM'))
  const [invoiceDate, setInvoiceDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [dueDate, setDueDate] = useState(dayjs().add(30, 'day').format('YYYY-MM-DD'))
  const [description, setDescription] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [subRows, setSubRows] = useState<SubRow[]>([newSubRow()])
  const [autoFillNote, setAutoFillNote] = useState<string | null>(null)
  const autoFilledKey = useRef<string | null>(null)

  const remaining = Math.round((targetAmount - alreadyInvoiced) * 100) / 100
  const hasTarget = targetAmount > 0.005

  // Pool ratio sum (subsidiary mode = ratio template) and absolute total
  // (dept_pool / freetext mode = absolute amounts).
  const poolTotal = useMemo(
    () => poolRows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [poolRows],
  )

  // Subsidiary allocation = sum of per-sub amounts (dictates ratios applied to pools).
  const subAllocated = useMemo(
    () => subRows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [subRows],
  )

  const validSubs = useMemo(
    () => subRows.filter((r) => r.companyId && Number(r.amount) > 0),
    [subRows],
  )
  const validPools = useMemo(
    () => poolRows.filter((r) => r.mode && r.categoryCode && Number(r.amount) > 0),
    [poolRows],
  )

  // Predicted invoice count.
  const projectedInvoices = (() => {
    if (billableType === 'director') return directorAmount && Number(directorAmount) > 0 ? 1 : 0
    if (billableType === 'subsidiary') return validSubs.length * validPools.length
    return validPools.length // dept_pool / freetext: one invoice per pool row
  })()

  function reset() {
    setBillableType('subsidiary')
    setSingleName('')
    setSingleDeptId('')
    setDirectorMode(prefillMode)
    setDirectorCategory('')
    setDirectorAmount('')
    setPoolRows([newPoolRow(prefillMode)])
    setPeriod(dayjs(currentPeriod).format('YYYY-MM'))
    setInvoiceDate(dayjs().format('YYYY-MM-DD'))
    setDueDate(dayjs().add(30, 'day').format('YYYY-MM-DD'))
    setDescription('')
    setReferenceNo('')
    setSubRows([newSubRow()])
    setError(null)
    setAutoFillNote(null)
    autoFilledKey.current = null
  }

  // Mig 206: auto-fill subsidiary rows from director_ctc when the user picks
  // director_attribution as the FIRST pool entry. We trigger off the first
  // pool row's mode + period, and only when there's exactly one pool row
  // (otherwise auto-fill semantics get muddy).
  useEffect(() => {
    if (!open) return
    if (billableType !== 'subsidiary') return
    if (poolRows.length !== 1) return
    const firstMode = poolRows[0].mode
    if (firstMode !== 'director_attribution') {
      setAutoFillNote(null)
      return
    }
    const key = `${firstMode}|${period}`
    if (autoFilledKey.current === key) return
    autoFilledKey.current = key

    const periodIso = dayjs(period + '-01').format('YYYY-MM-DD')
    setAutoFillNote('Loading director CTC from HR…')
    fetchDirectorCtcByCompany(periodIso)
      .then((ctcRows) => {
        if (ctcRows.length === 0) {
          setAutoFillNote(
            `No director CTC entered by HR for ${dayjs(period + '-01').format('MMM YYYY')}. Enter amounts manually.`,
          )
          return
        }
        setSubRows(
          ctcRows.map((r) => ({
            uid: crypto.randomUUID(),
            companyId: r.companyId,
            amount: r.totalCtc.toFixed(2),
          })),
        )
        setAutoFillNote(
          `Auto-filled ${ctcRows.length} subsidiary ${ctcRows.length === 1 ? 'row' : 'rows'} from HR's director CTC for ${dayjs(period + '-01').format('MMM YYYY')}. Edit amounts as needed.`,
        )
        if (!description.trim()) {
          setDescription(`Director salary CTC — ${dayjs(period + '-01').format('MMMM YYYY')}`)
        }
      })
      .catch((err: unknown) => {
        setAutoFillNote(`Auto-fill failed: ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [open, billableType, poolRows, period, description])

  function updateSubRow(uid: string, patch: Partial<SubRow>) {
    setSubRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function addSubRow() {
    setSubRows((prev) => [...prev, newSubRow()])
  }
  function removeSubRow(uid: string) {
    setSubRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.uid !== uid)))
  }

  function updatePoolRow(uid: string, patch: Partial<PoolRow>) {
    setPoolRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function addPoolRow() {
    setPoolRows((prev) => [...prev, newPoolRow()])
  }
  function removePoolRow(uid: string) {
    setPoolRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.uid !== uid)))
  }

  function fillRemaining() {
    const remainingToFill = Math.round((remaining - subAllocated) * 100) / 100
    if (remainingToFill <= 0) return
    setSubRows((prev) => {
      const copy = [...prev]
      const idx = copy.findIndex((r) => !r.amount || Number(r.amount) === 0)
      if (idx >= 0) {
        copy[idx] = { ...copy[idx], amount: remainingToFill.toFixed(2) }
      } else {
        copy.push({ ...newSubRow(), amount: remainingToFill.toFixed(2) })
      }
      return copy
    })
  }

  async function submitInvoice(payload: {
    billableType: BillableToKind
    companyId?: string
    deptId?: string
    freetextName?: string
    mode: CreateInvoiceMode
    categoryCode: string
    amount: number
  }): Promise<void> {
    const fd = new FormData()
    fd.set('billable_to_type', payload.billableType)
    fd.set('billing_mode', payload.mode)
    fd.set('category_code', payload.categoryCode)
    fd.set('period_month', dayjs(period + '-01').format('YYYY-MM-DD'))
    fd.set('invoice_date', invoiceDate)
    fd.set('due_date', dueDate)
    fd.set('amount', payload.amount.toFixed(2))
    fd.set('description', description.trim())
    fd.set('reference_no', referenceNo.trim())
    if (payload.companyId) fd.set('company_id', payload.companyId)
    if (payload.deptId) fd.set('billable_to_department_id', payload.deptId)
    if (payload.freetextName) fd.set('billable_to_freetext_name', payload.freetextName)
    await createManualInvoice(fd)
  }

  function handleSubmit() {
    setError(null)
    if (!description.trim()) return setError('Description is required')

    // ─── Director: single pool + single category + single amount ───
    if (billableType === 'director') {
      const amt = Number(directorAmount)
      if (!Number.isFinite(amt) || amt <= 0) return setError('Amount must be a positive number')
      if (!directorCategory) return setError('Pick a category')
      if (!singleName.trim()) return setError('Enter the director name')
      startTransition(async () => {
        try {
          await submitInvoice({
            billableType: 'director',
            mode: directorMode,
            categoryCode: directorCategory,
            freetextName: singleName.trim(),
            amount: amt,
          })
          setOpen(false)
          reset()
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Create failed')
        }
      })
      return
    }

    // ─── Validate pool table for subsidiary / dept_pool / freetext ───
    if (validPools.length === 0) {
      return setError('Add at least one pool row with pool / category / amount')
    }
    // Same pool×category twice is suspicious — surface it but allow.
    const seenPC = new Set<string>()
    for (const r of validPools) {
      const key = `${r.mode}|${r.categoryCode}`
      if (seenPC.has(key)) {
        return setError('Duplicate pool + category combination — merge or change one')
      }
      seenPC.add(key)
    }

    // ─── Dept Pool / Other (freetext): each pool row → one invoice ───
    if (billableType !== 'subsidiary') {
      if (billableType === 'dept_pool' && !singleDeptId) return setError('Pick the department to bill')
      if (billableType === 'freetext' && !singleName.trim()) return setError('Enter the party name')

      startTransition(async () => {
        const failures: Array<{ label: string; error: string }> = []
        for (const r of validPools) {
          try {
            await submitInvoice({
              billableType,
              mode: r.mode as CreateInvoiceMode,
              categoryCode: r.categoryCode,
              deptId: billableType === 'dept_pool' ? singleDeptId : undefined,
              freetextName: billableType === 'freetext' ? singleName.trim() : undefined,
              amount: Number(r.amount),
            })
          } catch (err) {
            const lbl = POOL_OPTIONS.find((o) => o.value === r.mode)?.label ?? String(r.mode)
            failures.push({ label: lbl, error: err instanceof Error ? err.message : 'Create failed' })
          }
        }
        if (failures.length === 0) {
          setOpen(false)
          reset()
          router.refresh()
        } else {
          setError(
            `Created ${validPools.length - failures.length}/${validPools.length}. Failed: ` +
              failures.map((f) => `${f.label} (${f.error})`).join('; '),
          )
          router.refresh()
        }
      })
      return
    }

    // ─── Subsidiary: cartesian (sub × pool); pool amounts = ratio template ───
    if (validSubs.length === 0) return setError('Add at least one subsidiary with an amount')

    const seenSub = new Set<string>()
    for (const r of validSubs) {
      if (seenSub.has(r.companyId)) {
        return setError('Same subsidiary listed twice — merge or remove one')
      }
      seenSub.add(r.companyId)
    }

    const ratioSum = poolTotal
    if (ratioSum <= 0) return setError('Pool amounts cannot all be zero')

    startTransition(async () => {
      const failures: Array<{ label: string; error: string }> = []
      let created = 0
      for (const sub of validSubs) {
        const company = companies.find((c) => c.id === sub.companyId)
        const subLabel = company?.short_code ?? company?.name ?? sub.companyId
        const subAmount = Number(sub.amount)
        for (const pool of validPools) {
          // Distribute by ratio: this pool's slice of subAmount.
          const slice = Math.round((subAmount * Number(pool.amount) / ratioSum) * 100) / 100
          if (slice <= 0) continue
          const poolLabel = POOL_OPTIONS.find((o) => o.value === pool.mode)?.label ?? String(pool.mode)
          try {
            await submitInvoice({
              billableType: 'subsidiary',
              mode: pool.mode as CreateInvoiceMode,
              categoryCode: pool.categoryCode,
              companyId: sub.companyId,
              amount: slice,
            })
            created += 1
          } catch (err) {
            failures.push({
              label: `${subLabel} × ${poolLabel}`,
              error: err instanceof Error ? err.message : 'Create failed',
            })
          }
        }
      }
      if (failures.length === 0) {
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setError(
          `Created ${created}. Failed ${failures.length}: ` +
            failures.map((f) => `${f.label} (${f.error})`).join('; '),
        )
        router.refresh()
      }
    })
  }

  const triggerCls = compact
    ? 'text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline transition-colors'
    : 'bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors'

  const usesMultiPool = billableType !== 'director'

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerCls}>
        {label ?? '+ Create Invoice'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            ref={modalContentRef}
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-3xl my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Create Invoice</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  {usesMultiPool
                    ? 'Pool table acts as a credit-split template — each pool row becomes its own invoice.'
                    : 'Single-pool invoice for a director.'}
                </p>
              </div>
              <button
                onClick={() => !isPending && setOpen(false)}
                disabled={isPending}
                className="text-muted hover:text-ink text-2xl leading-none pt-1 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Bill-to type toggle */}
              <div>
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Bill to <span className="text-danger">*</span>
                </div>
                <div className="flex flex-wrap gap-0 border border-hairline rounded-md overflow-hidden w-fit">
                  {BILLABLE_OPTIONS.map((opt, i) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBillableType(opt.value)}
                      disabled={isPending}
                      className={
                        billableType === opt.value
                          ? 'px-4 py-2 bg-accent-bg text-accent font-serif italic text-sm'
                          : `px-4 py-2 text-graphite font-sans text-sm hover:bg-surface-2${i > 0 ? ' border-l border-hairline' : ''}`
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="font-serif italic text-muted text-xs mt-1">
                  {BILLABLE_OPTIONS.find((o) => o.value === billableType)?.hint}
                </div>
              </div>

              {/* Director name (director mode) or freetext name (Other) */}
              {billableType === 'director' || billableType === 'freetext' ? (
                <Field
                  label={billableType === 'director' ? 'Director name' : 'Bill to (free text)'}
                  required
                  hint="Free text — no master data lookup"
                >
                  <input
                    type="text"
                    value={singleName}
                    onChange={(e) => setSingleName(e.target.value)}
                    disabled={isPending}
                    maxLength={120}
                    placeholder={billableType === 'director' ? 'e.g., Tan Wei Liang' : 'e.g., Maybank, ABC Holdings'}
                    className={inputCls}
                  />
                </Field>
              ) : null}

              {billableType === 'dept_pool' ? (
                <Field label="Bill to department" required hint="The department whose pool gets debited on settlement">
                  <select
                    value={singleDeptId}
                    onChange={(e) => setSingleDeptId(e.target.value)}
                    disabled={isPending}
                    className={inputCls}
                  >
                    <option value="">Select a department…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {/* Period */}
              <Field label="Period" required hint="Month the invoice belongs to">
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  disabled={isPending}
                  className={inputCls + ' font-mono max-w-xs'}
                />
              </Field>

              {/* Director: single pool + category + amount */}
              {billableType === 'director' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Credit to pool" required>
                    <select
                      value={directorMode}
                      onChange={(e) => setDirectorMode(e.target.value as CreateInvoiceMode)}
                      disabled={isPending}
                      className={inputCls}
                    >
                      {POOL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Category" required>
                    <AccountPicker
                      accounts={categoryOptions}
                      value={directorCategory}
                      onChange={setDirectorCategory}
                      name="director_category_display"
                      placeholder="Select category…"
                      disabled={isPending}
                      required
                    />
                  </Field>
                  <Field label="Amount" required>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={directorAmount}
                      onChange={(e) => setDirectorAmount(e.target.value.replace(/[^\d.]/g, ''))}
                      disabled={isPending}
                      placeholder="0.00"
                      className={inputCls + ' font-mono tabular text-right'}
                    />
                  </Field>
                </div>
              ) : null}

              {/* Subsidiary mode: target tracker + subsidiary multi-row + pool template */}
              {billableType === 'subsidiary' ? (
                <>
                  {hasTarget && (
                    <div className="bg-surface border border-hairline rounded-md p-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Target</div>
                          <div className="font-mono tabular text-base text-ink mt-1">RM {fmt(remaining)}</div>
                          {alreadyInvoiced > 0.005 && (
                            <div className="font-serif italic text-muted text-xs mt-0.5">
                              RM {fmt(targetAmount)} total · RM {fmt(alreadyInvoiced)} already invoiced
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Sub allocated</div>
                          <div className="font-mono tabular text-base text-ink mt-1">RM {fmt(subAllocated)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Gap</div>
                          <div className="font-mono tabular text-base text-ink mt-1">
                            RM {fmt(Math.abs(remaining - subAllocated))}
                          </div>
                          {remaining - subAllocated > 0.005 && (
                            <button
                              onClick={fillRemaining}
                              disabled={isPending}
                              className="text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline mt-0.5"
                              type="button"
                            >
                              Fill remaining
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-xs font-sans font-medium text-graphite">
                        Subsidiaries <span className="text-danger">*</span>
                      </div>
                      <span className="font-serif italic text-muted text-xs">
                        {subRows.length} {subRows.length === 1 ? 'row' : 'rows'}
                      </span>
                    </div>
                    {autoFillNote ? (
                      <div className="font-serif italic text-graphite text-xs mb-2 px-3 py-2 bg-accent/5 border border-accent/20 rounded-md">
                        {autoFillNote}
                      </div>
                    ) : null}
                    <div className="border border-hairline rounded-md overflow-hidden bg-surface">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-paper">
                            <th className="text-left py-2 px-3 font-medium">Subsidiary</th>
                            <th className="text-right py-2 px-3 font-medium w-40">Amount (RM)</th>
                            <th className="w-10 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {subRows.map((r) => (
                            <tr key={r.uid} className="border-b border-hairline last:border-0">
                              <td className="py-2 px-3">
                                <select
                                  value={r.companyId}
                                  onChange={(e) => updateSubRow(r.uid, { companyId: e.target.value })}
                                  disabled={isPending}
                                  className={inputCls}
                                >
                                  <option value="">Select subsidiary…</option>
                                  {companies.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} · {c.short_code}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={r.amount}
                                  onChange={(e) => updateSubRow(r.uid, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                                  placeholder="0.00"
                                  disabled={isPending}
                                  className={inputCls + ' font-mono tabular text-right'}
                                />
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  onClick={() => removeSubRow(r.uid)}
                                  disabled={isPending || subRows.length === 1}
                                  className="text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                                  aria-label="Remove row"
                                  type="button"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={addSubRow}
                      disabled={isPending}
                      className="mt-2 text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline"
                      type="button"
                    >
                      + Add subsidiary
                    </button>
                  </div>
                </>
              ) : null}

              {/* Multi-pool table — Subsidiary / Dept Pool / Other */}
              {usesMultiPool ? (
                <PoolTable
                  poolRows={poolRows}
                  categoryOptions={categoryOptions}
                  isPending={isPending}
                  isRatioTemplate={billableType === 'subsidiary'}
                  onUpdate={updatePoolRow}
                  onAdd={addPoolRow}
                  onRemove={removePoolRow}
                />
              ) : null}

              {/* Invoice date + Due date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Invoice date" required>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    disabled={isPending}
                    className={inputCls + ' font-mono'}
                  />
                </Field>
                <Field label="Due date" hint="Default: 30 days after invoice date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={isPending}
                    className={inputCls + ' font-mono'}
                  />
                </Field>
              </div>

              {/* Description */}
              <Field label="Description" required hint="Applied to all invoices in this batch">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="What is this invoice for?"
                  disabled={isPending}
                  className={inputCls + ' resize-y'}
                />
              </Field>

              {/* Reference no */}
              <Field label="Reference no" hint="PO number, contract ref — optional, applied to all">
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="(optional)"
                  disabled={isPending}
                  className={inputCls}
                />
              </Field>

              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <div className="font-serif italic text-muted text-xs">
                {projectedInvoices} invoice{projectedInvoices === 1 ? '' : 's'} will be created
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => !isPending && setOpen(false)}
                  disabled={isPending}
                  className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Creating…' : 'Create Invoices'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PoolTable({
  poolRows,
  categoryOptions,
  isPending,
  isRatioTemplate,
  onUpdate,
  onAdd,
  onRemove,
}: {
  poolRows: PoolRow[]
  categoryOptions: AccountOption[]
  isPending: boolean
  isRatioTemplate: boolean
  onUpdate: (uid: string, patch: Partial<PoolRow>) => void
  onAdd: () => void
  onRemove: (uid: string) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-sans font-medium text-graphite">
          Pool split <span className="text-danger">*</span>
        </div>
        <span className="font-serif italic text-muted text-xs">
          {isRatioTemplate
            ? 'Amounts act as ratio template — each subsidiary is split by these proportions'
            : 'Each row creates one invoice with this pool / category / amount'}
        </span>
      </div>

      <div className="space-y-3">
        {poolRows.map((r) => (
          <div key={r.uid} className="border border-hairline rounded-md bg-surface p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="text-xs font-mono uppercase tracking-wide text-muted">Pool entry</div>
              <button
                onClick={() => onRemove(r.uid)}
                disabled={isPending || poolRows.length === 1}
                className="text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                aria-label="Remove row"
                type="button"
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Pool">
                <select
                  value={r.mode}
                  onChange={(e) => onUpdate(r.uid, { mode: e.target.value as CreateInvoiceMode })}
                  disabled={isPending}
                  className={inputCls}
                >
                  <option value="">Select pool…</option>
                  {POOL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <AccountPicker
                  accounts={categoryOptions}
                  value={r.categoryCode}
                  onChange={(code) => onUpdate(r.uid, { categoryCode: code })}
                  name={`pool_row_category_${r.uid}_display`}
                  placeholder="Select category…"
                  disabled={isPending}
                />
              </Field>
              <Field label={isRatioTemplate ? 'Ratio (RM)' : 'Amount (RM)'}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.amount}
                  onChange={(e) => onUpdate(r.uid, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                  placeholder="0.00"
                  disabled={isPending}
                  className={inputCls + ' font-mono tabular text-right'}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onAdd}
        disabled={isPending}
        className="mt-3 text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline"
        type="button"
      >
        + Add pool entry
      </button>
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border disabled:opacity-50 disabled:cursor-not-allowed'

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="text-xs font-sans font-medium text-graphite mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </div>
      {children}
      {hint && <div className="font-serif italic text-muted text-xs mt-1">{hint}</div>}
    </label>
  )
}
