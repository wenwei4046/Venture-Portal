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
import { createAccount, updateAccount } from '../actions'

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
  const [showInactive, setShowInactive] = useState(false)

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
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-serif text-2xl text-ink">Chart of Accounts</h2>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v)
            setError(null)
          }}
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          {showCreate ? 'Cancel' : '+ New account'}
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

      {showCreate ? (
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
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Name</th>
                        <th>Cash Flow</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((acc) => {
                        const isEditing = editing === acc.code
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
                                <td className="font-mono text-xs text-graphite">
                                  {acc.parent_code ? (
                                    <span className="text-muted">└ </span>
                                  ) : null}
                                  {acc.code}
                                </td>
                                <td className={acc.parent_code ? 'text-ink pl-4' : 'text-ink'}>
                                  {acc.name}
                                  {childCounts.get(acc.code) ? (
                                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-graphite border border-hairline rounded px-1.5 py-0.5">
                                      header · {childCounts.get(acc.code)} sub
                                    </span>
                                  ) : null}
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
                                    onClick={() => {
                                      setEditing(acc.code)
                                      setError(null)
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

  function handleTypeChange(next: AccountType) {
    setType(next)
    // Auto-suggest the default cash flow category when the type changes.
    // User can still override before submitting.
    setCfc(defaultCashFlowCategoryFor(next))
    // Parent must share type — clear it on type change so the user re-picks.
    setParentCode('')
  }

  // Mig 246: a parent must be of the same type and not point at this row
  // (no self-parent). On create, also exclude the row being created (no code
  // yet, but exclude anything self-referencing). Inactive rows hidden.
  const parentOptions = useMemo(
    () =>
      allAccounts
        .filter((a) => a.type === type && a.is_active && a.code !== initial?.code)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [allAccounts, type, initial?.code],
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData()
        if (mode === 'edit') {
          fd.set('code', initial?.code ?? '')
          fd.set('name', name)
          fd.set('cash_flow_category', cfc)
          fd.set('is_active', isActive ? 'true' : 'false')
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
              {mode === 'create' ? '(auto-generated)' : ''}
            </span>
          </label>
          <input
            type="text"
            value={mode === 'edit' ? initial?.code ?? '' : 'auto-generated on save'}
            disabled
            className="w-full px-3 py-2 bg-stone border border-hairline rounded-md text-sm font-mono text-graphite"
          />
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

      {mode === 'create' ? (
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
            Pick a parent to group this account under (e.g. "4000 Amount due
            to related party" with child "4001 — Lim Wei Siang"). The parent
            then becomes a header — it can't be picked for posting in PV,
            fund-in, fund-out, or invoice forms. Must share the same type.
          </p>
        </div>
      ) : null}

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
