'use client'

import { useState, useTransition, useMemo } from 'react'
import {
  ACCOUNT_TYPES,
  CASH_FLOW_CATEGORIES,
  defaultCashFlowCategoryFor,
  rangeFor,
  typeLabel,
  type AccountType,
  type CashFlowCategory,
} from '@/lib/coa'
import { createAccount, updateAccount, moveAccount } from '../actions'

interface Account {
  code: string
  name: string
  type: AccountType
  cash_flow_category: CashFlowCategory
  parent_code: string | null
  is_active: boolean
  sort_order: number
}

interface Props {
  accounts: Account[]
}

const CFC_LABELS: Record<CashFlowCategory, string> = {
  operating: 'Operating',
  investing: 'Investing',
  financing: 'Financing',
}

export default function AccountsSection({ accounts }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  // Drag-and-drop reparenting state: the code being dragged + the row
  // currently hovered as a drop target.
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Per-parent collapse state (Set of parent codes currently collapsed). Empty
  // set = everything expanded, which is the first-load default so newcomers
  // see the structure.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggleCollapsed(code: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  // Drop a dragged account onto a new parent (or null = make it top-level).
  // Same-type / no-cycle / posted-parent rules live in DB triggers — any
  // violation comes back as the error banner.
  function handleDrop(targetParent: string | null) {
    const code = dragging
    setDragging(null)
    setDropTarget(null)
    if (!code || code === targetParent) return
    const current = accounts.find((a) => a.code === code)
    if (current && (current.parent_code ?? null) === targetParent) return
    const fd = new FormData()
    fd.set('code', code)
    fd.set('parent_code', targetParent ?? '')
    startTransition(async () => {
      try {
        const result = await moveAccount(fd)
        if (result?.error) {
          setError(result.error)
          return
        }
        setError(null)
        setNotice(
          targetParent
            ? `${code} moved under ${targetParent}.`
            : `${code} is now a top-level account.`,
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Move failed')
      }
    })
  }

  const visible = useMemo(
    () => accounts.filter((a) => showInactive || a.is_active),
    [accounts, showInactive],
  )

  const grouped = useMemo(() => {
    const map = new Map<AccountType, Account[]>()
    for (const t of ACCOUNT_TYPES) map.set(t, [])
    for (const acc of visible) {
      map.get(acc.type)?.push(acc)
    }
    return map
  }, [visible])

  // Per-type, sort so parents land before their own children — the table
  // body renders top-to-bottom and uses parent_code to indent. Same-tier
  // rows fall back to code order so the user always sees the COA in
  // numeric sequence.
  const childCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of accounts) {
      if (a.parent_code) m.set(a.parent_code, (m.get(a.parent_code) ?? 0) + 1)
    }
    return m
  }, [accounts])

  function sortForRender(rows: Account[]): Account[] {
    // Build a quick lookup so we can splice children in right after their
    // parent. Anything orphaned (parent_code points outside the visible set)
    // gets rendered as a standalone leaf.
    const byCode = new Map(rows.map((r) => [r.code, r]))
    const roots = rows
      .filter((r) => !r.parent_code || !byCode.has(r.parent_code))
      .sort((a, b) => a.code.localeCompare(b.code))
    const childrenByParent = new Map<string, Account[]>()
    for (const r of rows) {
      if (r.parent_code && byCode.has(r.parent_code)) {
        const arr = childrenByParent.get(r.parent_code) ?? []
        arr.push(r)
        childrenByParent.set(r.parent_code, arr)
      }
    }
    const out: Account[] = []
    for (const root of roots) {
      out.push(root)
      const kids = (childrenByParent.get(root.code) ?? []).sort((a, b) =>
        a.code.localeCompare(b.code),
      )
      out.push(...kids)
    }
    return out
  }

  return (
    <section>
      <div className="sticky top-0 z-20 bg-paper pt-2 pb-3 flex items-baseline justify-between mb-1 border-b border-hairline">
        <h2 className="font-serif text-2xl text-ink">Chart of Accounts</h2>
        <button
          type="button"
          onClick={() => {
            setShowCreate(true)
            setError(null)
          }}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          + New account
        </button>
      </div>
      <p className="font-serif italic text-muted text-sm mb-6">
        Every payment line, journal entry, and report flows through these
        accounts. Codes are auto-allocated by type; cash flow category drives
        Operating / Investing / Financing on the Cash Flow Statement.
      </p>

      {error ? (
        <div className="mb-4 p-3 border border-danger bg-danger-bg rounded-md text-sm text-danger font-serif">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 p-3 border border-ledger bg-ledger-bg rounded-md text-sm text-ledger font-serif">
          {notice}
        </div>
      ) : null}

      {showCreate ? (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !isPending && setShowCreate(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-2xl my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">New account</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  Code is auto-allocated within the type&apos;s range.
                </p>
              </div>
              <button
                onClick={() => !isPending && setShowCreate(false)}
                disabled={isPending}
                className="text-muted hover:text-ink text-2xl leading-none pt-1 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <AccountForm
                mode="create"
                isPending={isPending}
                allAccounts={accounts}
                onSubmit={(fd) =>
                  startTransition(async () => {
                    try {
                      const result = await createAccount(fd)
                      if (result?.error) {
                        setError(result.error)
                        return
                      }
                      setShowCreate(false)
                      setError(null)
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to create')
                    }
                  })
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-baseline gap-3 mb-3 mt-6">
        <span className="font-mono text-xs uppercase tracking-wide text-ledger font-semibold">
          {visible.length} {visible.length === 1 ? 'account' : 'accounts'}
        </span>
        <button
          type="button"
          onClick={() => setShowInactive((v) => !v)}
          className="text-xs text-graphite hover:text-ink font-serif italic"
        >
          {showInactive ? 'Hide inactive' : 'Show inactive'}
        </button>
        {childCounts.size > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setCollapsed(new Set(childCounts.keys()))}
              className="text-xs text-graphite hover:text-ink font-serif italic"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(new Set())}
              className="text-xs text-graphite hover:text-ink font-serif italic"
            >
              Expand all
            </button>
          </>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-8 text-center">
          <p className="font-serif italic text-muted text-sm">
            No accounts yet — click <strong>+ New account</strong> above to start.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {ACCOUNT_TYPES.map((t) => {
            const rows = grouped.get(t) ?? []
            if (rows.length === 0) return null
            const [start, end] = rangeFor(t)
            const sortedRows = sortForRender(rows)
            return (
              <div key={t}>
                <div className="sect-head">
                  <h3>
                    {typeLabel(t)}{' '}
                    <span className="text-graphite font-mono text-xs ml-1">
                      ({start}-{end})
                    </span>
                  </h3>
                  <span className="font-mono text-xs uppercase text-graphite">
                    {String(rows.length).padStart(2, '0')}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  {/* table-fixed + explicit widths on the non-name columns so
                      the Code column lands at the SAME x-position in every
                      type section — each section is its own <table>, and
                      auto layout let name length shift the columns around. */}
                  <table className="ledger-table table-fixed w-full">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th className="w-24">Code</th>
                        <th className="w-28">Cash Flow</th>
                        <th className="w-24">Status</th>
                        <th className="w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dragging && accounts.find((a) => a.code === dragging)?.type === t ? (
                        <tr
                          onDragOver={(e) => {
                            e.preventDefault()
                            setDropTarget('__top__' + t)
                          }}
                          onDragLeave={() => setDropTarget(null)}
                          onDrop={(e) => {
                            e.preventDefault()
                            handleDrop(null)
                          }}
                          className={
                            dropTarget === '__top__' + t
                              ? 'bg-accent-bg'
                              : 'bg-surface'
                          }
                        >
                          <td colSpan={5} className="text-center font-serif italic text-xs text-graphite py-2 border border-dashed border-accent-border">
                            Drop here to make it a top-level account
                          </td>
                        </tr>
                      ) : null}
                      {sortedRows.map((acc) => {
                        const isEditing = editing === acc.code
                        const isHeader = (childCounts.get(acc.code) ?? 0) > 0
                        // Hide rows whose parent is currently collapsed.
                        if (acc.parent_code && collapsed.has(acc.parent_code)) {
                          return null
                        }
                        const isCollapsed = isHeader && collapsed.has(acc.code)
                        const isDragSource = dragging === acc.code
                        // Valid drop target: same type, not the dragged row,
                        // not its current parent. Headers and leaves both
                        // qualify (dropping on a leaf makes it a header).
                        const isDropOk =
                          dragging !== null &&
                          !isDragSource &&
                          accounts.find((a) => a.code === dragging)?.type === acc.type
                        return (
                          <tr key={acc.code}>
                            {isEditing ? (
                              <td colSpan={5} className="p-0">
                                <div className="p-4 bg-surface">
                                  <AccountForm
                                    mode="edit"
                                    isPending={isPending}
                                    initial={acc}
                                    allAccounts={accounts}
                                    onSubmit={(fd) =>
                                      startTransition(async () => {
                                        try {
                                          const result = await updateAccount(fd)
                                          if (result?.error) {
                                            setError(result.error)
                                            return
                                          }
                                          setEditing(null)
                                          setError(null)
                                          setNotice(result?.message ?? null)
                                        } catch (e) {
                                          setError(
                                            e instanceof Error
                                              ? e.message
                                              : 'Failed to update',
                                          )
                                        }
                                      })
                                    }
                                    onCancel={() => setEditing(null)}
                                  />
                                </div>
                              </td>
                            ) : (
                              <>
                                <td
                                  draggable={!isPending}
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move'
                                    setDragging(acc.code)
                                  }}
                                  onDragEnd={() => {
                                    setDragging(null)
                                    setDropTarget(null)
                                  }}
                                  onDragOver={(e) => {
                                    if (!isDropOk) return
                                    e.preventDefault()
                                    setDropTarget(acc.code)
                                  }}
                                  onDragLeave={() => {
                                    if (dropTarget === acc.code) setDropTarget(null)
                                  }}
                                  onDrop={(e) => {
                                    if (!isDropOk) return
                                    e.preventDefault()
                                    handleDrop(acc.code)
                                  }}
                                  onClick={
                                    isHeader ? () => toggleCollapsed(acc.code) : undefined
                                  }
                                  className={[
                                    'text-ink select-none',
                                    isHeader ? 'cursor-pointer' : 'cursor-grab',
                                    isDragSource ? 'opacity-40' : '',
                                    dropTarget === acc.code ? 'bg-accent-bg' : '',
                                  ].join(' ')}
                                  title={
                                    isHeader
                                      ? 'Click to expand/collapse · drag a row onto me to adopt it'
                                      : 'Drag onto another account to move it there'
                                  }
                                >
                                  {isHeader ? (
                                    <span className="mr-1.5 inline-block w-3 text-accent">
                                      {isCollapsed ? '▶' : '▼'}
                                    </span>
                                  ) : (
                                    <span className="mr-1.5 inline-block w-3" aria-hidden />
                                  )}
                                  {acc.parent_code ? (
                                    <span className="text-muted pl-4">└ </span>
                                  ) : null}
                                  {acc.name}
                                  {isHeader ? (
                                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-graphite border border-hairline rounded px-1.5 py-0.5">
                                      {childCounts.get(acc.code)} sub
                                    </span>
                                  ) : null}
                                </td>
                                <td className="font-mono text-xs text-graphite">
                                  {acc.code}
                                </td>
                                <td>
                                  <span className="font-mono text-[10px] uppercase tracking-wider text-info">
                                    {CFC_LABELS[acc.cash_flow_category]}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`font-serif italic text-xs ${
                                      acc.is_active ? 'text-ledger' : 'text-muted'
                                    }`}
                                  >
                                    {acc.is_active ? 'active' : 'inactive'}
                                  </span>
                                </td>
                                <td className="text-right">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditing(acc.code)
                                      setError(null)
                                      setNotice(null)
                                    }}
                                    className="text-xs text-accent hover:text-accent-hover font-serif italic"
                                  >
                                    Edit
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface AccountFormProps {
  initial?: Account
  mode: 'create' | 'edit'
  isPending: boolean
  allAccounts: Account[]
  onSubmit: (fd: FormData) => void
  onCancel?: () => void
}

function AccountForm({
  initial,
  mode,
  isPending,
  allAccounts,
  onSubmit,
  onCancel,
}: AccountFormProps) {
  const [type, setType] = useState<AccountType>(initial?.type ?? 'expense')
  const [name, setName] = useState(initial?.name ?? '')
  const [cfc, setCfc] = useState<CashFlowCategory>(
    initial?.cash_flow_category ?? defaultCashFlowCategoryFor(initial?.type ?? 'expense'),
  )
  const [parentCode, setParentCode] = useState<string>(initial?.parent_code ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  // Edit mode: the code is changeable — rename_account_code re-points every
  // historical transaction to the new code in one transaction.
  const [newCode, setNewCode] = useState<string>(initial?.code ?? '')

  function handleTypeChange(next: AccountType) {
    setType(next)
    // Auto-suggest the default cash flow category when the type changes.
    // User can still override before submitting.
    setCfc(defaultCashFlowCategoryFor(next))
    // Parent must share type — clear it on type change so the user re-picks.
    setParentCode('')
  }

  // Mig 246: a parent must be of the same type and not point at this row
  // (no self-parent) or at any of its descendants (would create a cycle).
  // Inactive rows hidden.
  const descendantCodes = useMemo(() => {
    if (!initial?.code) return new Set<string>()
    const out = new Set<string>([initial.code])
    let added = true
    while (added) {
      added = false
      for (const a of allAccounts) {
        if (a.parent_code && out.has(a.parent_code) && !out.has(a.code)) {
          out.add(a.code)
          added = true
        }
      }
    }
    return out
  }, [allAccounts, initial?.code])

  const parentOptions = useMemo(
    () =>
      allAccounts
        .filter((a) => a.type === type && a.is_active && !descendantCodes.has(a.code))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [allAccounts, type, descendantCodes],
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData()
        if (mode === 'edit') {
          fd.set('code', initial?.code ?? '')
          if (newCode.trim() && newCode.trim() !== initial?.code) {
            if (
              !window.confirm(
                `Change code ${initial?.code} → ${newCode.trim()}?\n\nEvery historical transaction posted to ${initial?.code} (journal lines, voucher sources, bank links, invoice categories) will be re-pointed to ${newCode.trim()}. This cannot be undone from the UI.`,
              )
            ) {
              return
            }
            fd.set('new_code', newCode.trim())
          }
          fd.set('name', name)
          fd.set('cash_flow_category', cfc)
          fd.set('is_active', isActive ? 'true' : 'false')
          // Empty string = detach (clear parent_code); otherwise = new parent.
          fd.set('parent_code', parentCode)
        } else {
          fd.set('type', type)
          fd.set('name', name)
          fd.set('cash_flow_category', cfc)
          if (parentCode) fd.set('parent_code', parentCode)
        }
        onSubmit(fd)
      }}
      className="space-y-4 border border-hairline rounded-md bg-surface p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Account type <span className="text-danger">*</span>
          </label>
          <select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as AccountType)}
            disabled={mode === 'edit'}
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border disabled:bg-stone disabled:text-graphite"
          >
            {ACCOUNT_TYPES.map((t) => {
              const [s, e] = rangeFor(t)
              return (
                <option key={t} value={t}>
                  {typeLabel(t)} ({s}-{e})
                </option>
              )
            })}
          </select>
          {mode === 'edit' ? (
            <p className="font-serif italic text-muted text-xs mt-1.5">
              Type is locked after creation (would invalidate the code range).
            </p>
          ) : null}
        </div>

        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Code{' '}
            <span className="text-muted font-normal">
              {mode === 'create' ? '(auto-generated)' : '(editable — migrates history)'}
            </span>
          </label>
          {mode === 'edit' ? (
            <>
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                pattern="\d{4}"
                maxLength={4}
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
              />
              {newCode.trim() !== initial?.code ? (
                <p className="font-serif italic text-alert text-xs mt-1.5">
                  Changing the code re-points every past transaction from{' '}
                  {initial?.code} to {newCode.trim() || '…'} (4 digits, same
                  type range). You&apos;ll be asked to confirm.
                </p>
              ) : null}
            </>
          ) : (
            <input
              type="text"
              value="auto-generated on save"
              disabled
              className="w-full px-3 py-2 bg-stone border border-hairline rounded-md text-sm font-mono text-graphite"
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Account name <span className="text-danger">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Office Rent Expense"
          required
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Cash flow category <span className="text-danger">*</span>
        </label>
        <select
          value={cfc}
          onChange={(e) => setCfc(e.target.value as CashFlowCategory)}
          required
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          {CASH_FLOW_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CFC_LABELS[c]}
            </option>
          ))}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Drives which section this account appears in on the Cash Flow
          Statement. Default suggested from the account type — override only
          for special cases (e.g. loans receivable = investing, not operating).
        </p>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Parent account <span className="text-muted font-normal">(optional)</span>
        </label>
        <select
          value={parentCode}
          onChange={(e) => setParentCode(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">— None (top level) —</option>
          {parentOptions.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          {mode === 'create' ? (
            <>
              Pick a parent to group this account under (e.g. &quot;4000 Amount due
              to related party&quot; with child &quot;4001 — Lim Wei Siang&quot;). The parent
              then becomes a header — it can&apos;t be picked for posting in
              PV, fund-in, fund-out, or invoice forms. Must share the same
              type.
            </>
          ) : (
            <>
              Choose a new parent or pick &quot;None&quot; to detach. Only
              same-type accounts that are not already descendants of this
              account appear here, so you can&apos;t accidentally create a
              cycle.
            </>
          )}
        </p>
      </div>

      {mode === 'edit' ? (
        <label className="flex items-center gap-2 text-sm font-serif text-graphite">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-accent text-white text-sm font-serif italic rounded-md hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-hairline text-graphite text-sm font-serif italic rounded-md hover:bg-stone"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
