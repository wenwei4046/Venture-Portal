'use client'

import { useState, useTransition, useMemo } from 'react'
import { createPaymentCategory, updatePaymentCategory } from '../../payments/actions'

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

interface Category {
  code: string
  label: string
  account_type: AccountType | null
  gl_account_code: string | null
  // Phase 11.1: opt-in revenue GL for invoices using this category. NULL =
  // fall back to billing_mode→4030/4040 mapping at JE post.
  revenue_gl_account_code: string | null
  is_active: boolean
}

interface GlAccount {
  code: string
  name: string
  type: AccountType
}

interface Props {
  categories: Category[]
  glAccounts: GlAccount[]
}

const TYPE_LABELS: Record<AccountType, string> = {
  asset:     'Asset (Balance Sheet)',
  liability: 'Liability (Balance Sheet)',
  equity:    'Equity (Balance Sheet)',
  revenue:   'Revenue (P&L)',
  expense:   'Expense (P&L)',
}

const TYPE_BADGE: Record<AccountType, { label: string; className: string }> = {
  asset:     { label: 'BS · Asset',     className: 'text-info' },
  liability: { label: 'BS · Liability', className: 'text-info' },
  equity:    { label: 'BS · Equity',    className: 'text-info' },
  revenue:   { label: 'P&L · Revenue',  className: 'text-ledger' },
  expense:   { label: 'P&L · Expense',  className: 'text-danger' },
}

export default function CategoriesSection({ categories, glAccounts }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const visible = useMemo(
    () => categories.filter((c) => showInactive || c.is_active),
    [categories, showInactive],
  )

  return (
    <section>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-serif text-2xl text-ink">Payment Categories</h2>
        <button
          type="button"
          onClick={() => { setShowCreate((v) => !v); setError(null) }}
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          {showCreate ? 'Cancel' : '+ New category'}
        </button>
      </div>
      <p className="font-serif italic text-muted text-sm mb-6">
        Each category must declare whether it lands on the Balance Sheet or P&L,
        and which GL account to post against. The two must agree.
      </p>

      {error ? (
        <div className="mb-4 p-3 border border-danger bg-danger-bg rounded-md text-sm text-danger font-serif">
          {error}
        </div>
      ) : null}

      {showCreate ? (
        <CategoryForm
          glAccounts={glAccounts}
          onSubmit={(fd) => startTransition(async () => {
            try {
              await createPaymentCategory(fd)
              setShowCreate(false)
              setError(null)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to create')
            }
          })}
          isPending={isPending}
          mode="create"
        />
      ) : null}

      <div className="flex items-baseline gap-3 mb-3 mt-6">
        <span className="font-mono text-xs uppercase tracking-wide text-ledger font-semibold">
          {visible.length} {visible.length === 1 ? 'category' : 'categories'}
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
            No categories yet — click <strong>+ New category</strong> above to start.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Label</th>
                <th>Classification</th>
                <th>GL Account</th>
                <th>Invoice Revenue GL</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((cat) => {
                const isEditing = editing === cat.code
                const gl = glAccounts.find((g) => g.code === cat.gl_account_code)
                const badge = cat.account_type ? TYPE_BADGE[cat.account_type] : null
                return (
                  <tr key={cat.code}>
                    {isEditing ? (
                      <td colSpan={7} className="p-0">
                        <div className="p-4 bg-surface">
                          <CategoryForm
                            glAccounts={glAccounts}
                            initial={cat}
                            mode="edit"
                            isPending={isPending}
                            onSubmit={(fd) => startTransition(async () => {
                              try {
                                await updatePaymentCategory(fd)
                                setEditing(null)
                                setError(null)
                              } catch (e) {
                                setError(e instanceof Error ? e.message : 'Failed to update')
                              }
                            })}
                            onCancel={() => setEditing(null)}
                          />
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="font-mono text-xs text-graphite">{cat.code}</td>
                        <td className="text-ink">{cat.label}</td>
                        <td>
                          {badge ? (
                            <span className={`font-mono text-[10px] uppercase tracking-wider ${badge.className}`}>
                              {badge.label}
                            </span>
                          ) : (
                            <span className="font-serif italic text-danger text-xs">missing</span>
                          )}
                        </td>
                        <td className="font-mono text-xs text-graphite">
                          {cat.gl_account_code ? (
                            <>
                              {cat.gl_account_code}
                              {gl ? <span className="text-muted ml-2">— {gl.name}</span> : null}
                            </>
                          ) : (
                            <span className="text-danger italic">—</span>
                          )}
                        </td>
                        <td className="font-mono text-xs text-graphite">
                          {(() => {
                            const rgl = glAccounts.find((g) => g.code === cat.revenue_gl_account_code)
                            if (!cat.revenue_gl_account_code) {
                              return <span className="text-muted italic font-serif">fallback</span>
                            }
                            return (
                              <>
                                {cat.revenue_gl_account_code}
                                {rgl ? <span className="text-muted ml-2">— {rgl.name}</span> : null}
                              </>
                            )
                          })()}
                        </td>
                        <td>
                          <span className={`font-serif italic text-xs ${cat.is_active ? 'text-ledger' : 'text-muted'}`}>
                            {cat.is_active ? 'active' : 'inactive'}
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => { setEditing(cat.code); setError(null) }}
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
      )}
    </section>
  )
}

interface CategoryFormProps {
  glAccounts: GlAccount[]
  initial?: Category
  mode: 'create' | 'edit'
  isPending: boolean
  onSubmit: (fd: FormData) => void
  onCancel?: () => void
}

function CategoryForm({ glAccounts, initial, mode, isPending, onSubmit, onCancel }: CategoryFormProps) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [accountType, setAccountType] = useState<AccountType | ''>(initial?.account_type ?? '')
  const [glAccountCode, setGlAccountCode] = useState(initial?.gl_account_code ?? '')
  const [revenueGlAccountCode, setRevenueGlAccountCode] = useState(initial?.revenue_gl_account_code ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)

  const filteredGl = useMemo(
    () => accountType ? glAccounts.filter((g) => g.type === accountType) : [],
    [glAccounts, accountType],
  )
  const revenueGlOptions = useMemo(
    () => glAccounts.filter((g) => g.type === 'revenue'),
    [glAccounts],
  )

  // Auto-derive code from label on create
  function handleLabelChange(v: string) {
    setLabel(v)
    if (mode === 'create') {
      setCode(v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData()
        fd.set('code', code)
        fd.set('label', label)
        fd.set('account_type', accountType)
        fd.set('gl_account_code', glAccountCode)
        fd.set('revenue_gl_account_code', revenueGlAccountCode)
        fd.set('is_active', isActive ? 'true' : 'false')
        onSubmit(fd)
      }}
      className="space-y-4 border border-hairline rounded-md bg-surface p-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Label <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="e.g. Logistics"
            required
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
          />
        </div>
        <div>
          <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
            Code <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="auto-derived from label"
            required
            disabled={mode === 'edit'}
            className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border disabled:bg-stone disabled:text-graphite"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Account type <span className="text-danger">*</span>
        </label>
        <select
          value={accountType}
          onChange={(e) => { setAccountType(e.target.value as AccountType); setGlAccountCode('') }}
          required
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">Select…</option>
          {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Asset / Liability / Equity → Balance Sheet · Revenue / Expense → P&L
        </p>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          GL account <span className="text-danger">*</span>
        </label>
        <select
          value={glAccountCode}
          onChange={(e) => setGlAccountCode(e.target.value)}
          required
          disabled={!accountType}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border disabled:bg-stone disabled:text-muted"
        >
          <option value="">{accountType ? 'Select GL…' : 'Pick account type first'}</option>
          {filteredGl.map((g) => (
            <option key={g.code} value={g.code}>{g.code} — {g.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
          Invoice revenue GL <span className="text-muted font-serif italic text-xs">(optional)</span>
        </label>
        <select
          value={revenueGlAccountCode}
          onChange={(e) => setRevenueGlAccountCode(e.target.value)}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
        >
          <option value="">Fallback to billing_mode (4030 / 4040)</option>
          {revenueGlOptions.map((g) => (
            <option key={g.code} value={g.code}>{g.code} — {g.name}</option>
          ))}
        </select>
        <p className="font-serif italic text-muted text-xs mt-1.5">
          Only used when this category appears on an invoice. Leave blank to keep the default OPEX-recovery / Marketing-project routing by pool.
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
