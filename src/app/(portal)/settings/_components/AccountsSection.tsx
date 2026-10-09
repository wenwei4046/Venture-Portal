'use client'

import { Fragment, useState, useTransition, useMemo } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
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
  // Search code or name (2026-10-09, the handoff): the matches and their
  // parents, so the tree still reads; the collapse is set aside meanwhile.
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()

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

  // Depth-first flatten so children land right after their parent at ANY
  // depth (the old version only spliced in direct kids — a 3-level tree like
  // 4000 → 4100 → 4101 silently DROPPED the grandchildren, user report
  // 2026-07-24). `ancestors` lets the renderer hide a row when any ancestor
  // is collapsed; `depth` drives indentation. Anything orphaned (parent_code
  // outside the visible set) renders as a root.
  function sortForRender(rows: Account[]): { acc: Account; depth: number; ancestors: string[] }[] {
    const byCode = new Map(rows.map((r) => [r.code, r]))
    const childrenByParent = new Map<string, Account[]>()
    for (const r of rows) {
      if (r.parent_code && byCode.has(r.parent_code)) {
        const arr = childrenByParent.get(r.parent_code) ?? []
        arr.push(r)
        childrenByParent.set(r.parent_code, arr)
      }
    }
    const roots = rows
      .filter((r) => !r.parent_code || !byCode.has(r.parent_code))
      .sort((a, b) => a.code.localeCompare(b.code))
    const out: { acc: Account; depth: number; ancestors: string[] }[] = []
    const seen = new Set<string>() // cycle guard (DB forbids cycles, but never loop forever)
    const visit = (acc: Account, depth: number, ancestors: string[]) => {
      if (seen.has(acc.code)) return
      seen.add(acc.code)
      out.push({ acc, depth, ancestors })
      const kids = (childrenByParent.get(acc.code) ?? []).sort((a, b) =>
        a.code.localeCompare(b.code),
      )
      for (const kid of kids) visit(kid, depth + 1, [...ancestors, acc.code])
    }
    for (const root of roots) visit(root, 0, [])
    return out
  }

  const searchKeep = (() => {
    if (!needle) return null
    const byCode = new Map(accounts.map((a) => [a.code, a]))
    const keep = new Set<string>()
    for (const a of visible) {
      if (!a.code.toLowerCase().includes(needle) && !a.name.toLowerCase().includes(needle)) continue
      let cur: Account | undefined = a
      let guard = 0
      while (cur && guard < 50) {
        keep.add(cur.code)
        cur = cur.parent_code ? byCode.get(cur.parent_code) : undefined
        guard++
      }
    }
    return keep
  })()

  // Each type's rows as they will show: the collapse applied, or the search.
  const draggingType = dragging ? accounts.find((a) => a.code === dragging)?.type ?? null : null
  const sections = ACCOUNT_TYPES.map((t) => ({
    t,
    rows: sortForRender(grouped.get(t) ?? []).filter(({ acc, ancestors }) =>
      searchKeep ? searchKeep.has(acc.code) : !ancestors.some((p) => collapsed.has(p)),
    ),
  })).filter((s) => s.rows.length > 0 || draggingType === s.t)
  const shown = sections.reduce((n, s) => n + s.rows.length, 0)

  // The Chart of Accounts per the user's Claude Design handoff (2026-10-09):
  // Search, Show inactive and + New account in one band; one table with a
  // band per account type; a parent's count of sub-accounts under its name;
  // the status as a chip. Drag a row onto another to move it (as before).
  return (
    <section>
      <div className="gl-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code or name…"
          aria-label="Search code or name"
          className="search-plain flex-1 min-w-[200px] px-3 py-2 bg-white border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
        />
        <button type="button" className="btn-quiet-sheet" onClick={() => setShowInactive((v) => !v)}>
          {showInactive ? 'Hide inactive' : 'Show inactive'}
        </button>
        {childCounts.size > 0 ? (
          <>
            <button type="button" className="btn-quiet-sheet" onClick={() => setCollapsed(new Set(childCounts.keys()))}>
              Collapse all
            </button>
            <button type="button" className="btn-quiet-sheet" onClick={() => setCollapsed(new Set())}>
              Expand all
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="btn-pri-sheet"
          onClick={() => {
            setShowCreate(true)
            setError(null)
          }}
        >
          + New account
        </button>
      </div>

      {error ? <div className="sheet-danger mb-4">{error}</div> : null}
      {notice ? <p className="fin-notice mb-4">{notice}</p> : null}

      {showCreate ? (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          {...backdropDismiss(() => !isPending && setShowCreate(false))}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-2xl my-4"
            role="dialog"
            aria-label="New account"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="text-lg font-semibold text-ink">New account</h2>
                <p className="text-xs text-graphite mt-1">Code is auto-allocated within the type&apos;s range.</p>
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

      <div className="sect-head">
        <h2>Accounts</h2>
        <span className="rule" aria-hidden />
        <span className="count">{shown} SHOWN</span>
      </div>

      {visible.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">
            No accounts yet — <strong>+ New account</strong> starts the chart.
          </p>
        </div>
      ) : (
        <div className="table-frame">
          <div className="table-frame-scroll">
            <table className="ledger-table coa-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="w-24">Code</th>
                  <th className="w-28 m-hide">Cash flow</th>
                  <th className="w-28 m-hide">Status</th>
                  <th className="w-20" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sections.map(({ t, rows }) => {
                  const [start, end] = rangeFor(t)
                  return (
                    <Fragment key={t}>
                      <tr className="tb-block">
                        <td colSpan={5}>
                          {typeLabel(t)} accounts <span className="coa-range">{start}–{end}</span>
                        </td>
                      </tr>
                      {draggingType === t ? (
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
                          className={dropTarget === '__top__' + t ? 'bg-accent-bg' : undefined}
                        >
                          <td colSpan={5} className="text-center text-xs text-graphite py-2 border border-dashed border-accent-border">
                            Drop here to make it a top-level account
                          </td>
                        </tr>
                      ) : null}
                      {rows.map(({ acc, depth }) => {
                        const isEditing = editing === acc.code
                        const isHeader = (childCounts.get(acc.code) ?? 0) > 0
                        const isCollapsed = isHeader && !searchKeep && collapsed.has(acc.code)
                        const isDragSource = dragging === acc.code
                        // Valid drop target: same type, not the dragged row.
                        const isDropOk = dragging !== null && !isDragSource && draggingType === acc.type
                        return (
                          <tr key={acc.code}>
                            {isEditing ? (
                              <td colSpan={5} className="p-0">
                                <div className="p-4">
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
                                          setError(e instanceof Error ? e.message : 'Failed to update')
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
                                  onClick={isHeader ? () => toggleCollapsed(acc.code) : undefined}
                                  className={[
                                    'select-none',
                                    isHeader ? 'cursor-pointer' : 'cursor-grab',
                                    isDragSource ? 'opacity-40' : '',
                                    dropTarget === acc.code ? 'bg-accent-bg' : '',
                                  ].join(' ')}
                                  title={isHeader ? 'Click to expand or collapse · drag a row onto me to adopt it' : 'Drag onto another account to move it there'}
                                >
                                  <span className="coa-name" style={{ paddingLeft: depth * 18 }}>
                                    <span className="coa-chev" aria-hidden>
                                      {isHeader ? (isCollapsed ? '▶' : '▼') : ''}
                                    </span>
                                    {depth > 0 ? (
                                      <span className="text-graphite" aria-hidden>
                                        └
                                      </span>
                                    ) : null}
                                    <span className={isHeader ? 'font-medium' : undefined}>{acc.name}</span>
                                  </span>
                                  {isHeader ? (
                                    <span className="coa-sub" style={{ paddingLeft: depth * 18 }}>
                                      {childCounts.get(acc.code)} sub-accounts
                                    </span>
                                  ) : null}
                                </td>
                                <td className="font-mono text-xs">{acc.code}</td>
                                <td className="m-hide" data-label="Cash flow">
                                  {CFC_LABELS[acc.cash_flow_category]}
                                </td>
                                <td className="m-hide" data-label="Status">
                                  <span className={`chip ${acc.is_active ? 'ledger' : ''}`}>
                                    <span className="dot" />
                                    {acc.is_active ? 'active' : 'inactive'}
                                  </span>
                                </td>
                                <td className="right">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditing(acc.code)
                                      setError(null)
                                      setNotice(null)
                                    }}
                                    className="btn-quiet-sheet"
                                  >
                                    Edit
                                  </button>
                                </td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-graphite mt-3 max-w-3xl">
        Drag a row onto another account to make it a sub-account. Same type only; accounts with postings can&apos;t become parents.
        Codes are allocated by type, and the cash flow category decides Operating / Investing / Financing on the Cash Flow Statement.
      </p>
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
          const typeChanged = type !== initial?.type
          if (typeChanged) {
            // A type change auto-allocates a new code in the new range and
            // re-points all history — it owns the code, so skip new_code.
            if (
              !window.confirm(
                `Change type of ${initial?.code} (${initial?.name}) to ${typeLabel(type)}?\n\nThe account gets a new code in the ${rangeFor(type)[0]}–${rangeFor(type)[1]} range and every past transaction is re-pointed to it. The account is detached from any parent. This cannot be undone from the UI.`,
              )
            ) {
              return
            }
            fd.set('new_type', type)
          } else if (newCode.trim() && newCode.trim() !== initial?.code) {
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
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
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
          {mode === 'edit' && type !== initial?.type ? (
            <p className="font-serif italic text-alert text-xs mt-1.5">
              Changing type moves this account to a new code in the{' '}
              {rangeFor(type)[0]}–{rangeFor(type)[1]} range and re-points every
              past transaction. You&apos;ll be asked to confirm.
            </p>
          ) : mode === 'edit' ? (
            <p className="font-serif italic text-muted text-xs mt-1.5">
              Change the type to recategorise — the code migrates to the new range with its history.
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
                value={type !== initial?.type ? 'auto in new range' : newCode}
                onChange={(e) => setNewCode(e.target.value)}
                disabled={type !== initial?.type}
                pattern="\d{4}"
                maxLength={4}
                className={`w-full px-3 py-2 border border-hairline rounded-md text-sm font-mono focus:outline-none focus:border-accent-border ${
                  type !== initial?.type
                    ? 'bg-stone text-graphite'
                    : 'bg-paper text-ink'
                }`}
              />
              {type === initial?.type && newCode.trim() !== initial?.code ? (
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
        <button type="submit" disabled={isPending} className="btn-pri-sheet">
          {isPending ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn-quiet-sheet">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
