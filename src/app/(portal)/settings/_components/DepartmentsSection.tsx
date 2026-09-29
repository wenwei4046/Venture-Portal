'use client'

import { useState, useTransition } from 'react'
import { hasMode, type DepartmentMode } from '@/lib/department-mode'
import DepartmentModeSwitch from '@/components/department/DepartmentModeSwitch'
import { addDepartment, provisionDepartment, setDepartmentBillback } from '../actions'

// Departments management (2026-08-24, dynamic departments). ADD + 转正
// (provision): a lightweight department books under Venture; provisioning
// gives it its own segment, pool account and billing mode — after that every
// consumer (invoice modes, settle pools, report rails, bridge) picks it up
// automatically via the dept registry. No rename, no delete: names drive the
// core mappings, and enum values can't be removed once issued.

interface DeptRow {
  id: string
  name: string
  is_internal: boolean
  created_at: string | null
  segment_key: string | null
  pool_gl_code: string | null
  billing_mode_key: string | null
  own_share_billback: boolean
}

function slugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 31)
}

export default function DepartmentsSection({
  departments,
  modes = [],
}: {
  departments: DeptRow[]
  /** Cost center / centralized per department (2026-09-30) — empty when it could not be read. */
  modes?: DepartmentMode[]
}) {
  const modeById = new Map(modes.map((m) => [m.id, m]))
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [provisionId, setProvisionId] = useState<string | null>(null)
  const [segKey, setSegKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleAdd(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await addDepartment(formData)
        setShowAdd(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  // Own-share bill-back (2026-09-29): does the payroll this department did
  // not bill to a subsidiary go back to Venture Office, or stay in its own
  // pool? Saved immediately — one switch, no form.
  function handleBillback(d: DeptRow, next: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', d.id)
        fd.set('own_share_billback', String(next))
        await setDepartmentBillback(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  function handleProvision(d: DeptRow) {
    if (
      !window.confirm(
        `把 "${d.name}" 转正为完整部门?\n\nSegment: ${segKey}\nBilling mode: ${segKey}_attribution\nPool 科目: 自动开 (10xx)\n\n转正后不能撤销 (segment 发出去收不回)。`,
      )
    )
      return
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', d.id)
        fd.set('segment_key', segKey)
        await provisionDepartment(fd)
        setProvisionId(null)
        setSegKey('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-serif text-2xl text-ink">Departments</h2>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          {showAdd ? 'Cancel' : '+ Add department'}
        </button>
      </div>
      <p className="font-serif italic text-muted text-sm mb-4 max-w-2xl">
        普通部门:挂员工、挂 claims、被 inter-billing 开单,账记 Venture。按 <em>转正 Provision</em> 给它
        自己的 segment / P&amp;L / pool / 开单模式 — 全系统自动接上。名字不能改、部门不能删、转正不能撤销。
      </p>
      <p className="font-serif italic text-muted text-sm mb-4 max-w-2xl">
        <em>Bill back 薪水</em>:这个部门没 bill 给子公司的那部分薪水,勾了就转给 Venture Office
        承担(部门自己收回来),不勾就留在自己的 pool。开 own-share 单的时候照这里带出来,那一次可以临时改。
      </p>
      <p className="font-serif italic text-muted text-sm mb-4 max-w-2xl">
        <em>Mode</em>:<em>Cost center</em> 只是过一手 — 薪水在 Billing Allocation 分给子公司,pool
        应该归零。<em>Centralized</em> 自己开 invoice 给子公司、钱进自己的 pool、自己付 — 不进 Billing
        Allocation。只有 Principal 能切;切成 Centralized 会清掉它还在 draft 的 split。
      </p>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {showAdd ? (
        <form action={handleAdd} className="bg-surface border border-hairline rounded-md p-6 mb-6 max-w-xl">
          <h3 className="font-serif text-lg text-ink mb-4">New department</h3>
          <div className="mb-4">
            <label htmlFor="new_dept_name" className="block text-sm font-sans font-medium text-graphite mb-1">
              Department name
            </label>
            <input
              id="new_dept_name"
              name="name"
              type="text"
              required
              maxLength={40}
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
              placeholder="e.g. Operations"
            />
            <p className="font-serif italic text-muted text-xs mt-1">
              取好再按 — 加了之后名字改不了。
            </p>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add department'}
          </button>
        </form>
      ) : null}

      <div className="border border-hairline rounded-md bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-surface-2/30">
              <th className="text-left py-3 px-4 font-medium">Name</th>
              <th className="text-left py-3 px-4 font-medium">Segment</th>
              <th className="text-left py-3 px-4 font-medium">Pool GL</th>
              <th className="text-left py-3 px-4 font-medium">Billing mode</th>
              <th className="text-left py-3 px-4 font-medium">Mode</th>
              <th className="text-center py-3 px-4 font-medium">Bill back 薪水</th>
              <th className="text-right py-3 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => {
              const full = d.segment_key !== null
              return (
                <tr key={d.id} className="border-b border-hairline last:border-0">
                  <td className="py-3 px-4 font-serif text-ink">
                    {d.name}
                    {d.is_internal ? (
                      <span className="font-mono text-[10px] text-muted ml-2">internal</span>
                    ) : null}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">
                    {full ? (
                      <span className="text-ledger">{d.segment_key}</span>
                    ) : (
                      <span className="text-muted">Venture (轻量)</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-graphite">{d.pool_gl_code ?? '—'}</td>
                  <td className="py-3 px-4 font-mono text-xs text-graphite">{d.billing_mode_key ?? '—'}</td>
                  <td className="py-3 px-4">
                    {(() => {
                      const mode = modeById.get(d.id)
                      return mode && hasMode(mode) ? (
                        <DepartmentModeSwitch department={mode} variant="cell" />
                      ) : (
                        <span className="text-muted font-mono text-xs">—</span>
                      )
                    })()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {full && !d.is_internal ? (
                      <input
                        type="checkbox"
                        checked={d.own_share_billback}
                        onChange={(e) => handleBillback(d, e.target.checked)}
                        disabled={isPending}
                        className="accent-accent"
                        title={
                          d.own_share_billback
                            ? d.name + ' 没 bill 给子公司的薪水 → 转给 Venture Office 承担'
                            : d.name + ' 没 bill 给子公司的薪水 → 留在自己的 pool'
                        }
                      />
                    ) : (
                      <span className="text-muted font-mono text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {!full && !d.is_internal ? (
                      provisionId === d.id ? (
                        <span className="inline-flex items-center gap-2">
                          <input
                            value={segKey}
                            onChange={(e) => setSegKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                            placeholder="segment key"
                            className="px-2 py-1 bg-paper border border-hairline rounded-md text-xs font-mono text-ink w-44 focus:outline-none focus:border-accent-border"
                          />
                          <button
                            type="button"
                            onClick={() => handleProvision(d)}
                            disabled={isPending || !/^[a-z][a-z0-9_]{2,30}$/.test(segKey)}
                            className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-40"
                          >
                            {isPending ? 'Provisioning…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setProvisionId(null); setSegKey('') }}
                            className="text-xs text-muted hover:text-ink font-sans"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setProvisionId(d.id); setSegKey(slugOf(d.name)) }}
                          className="text-xs text-accent hover:text-accent-hover font-serif italic"
                        >
                          转正 Provision
                        </button>
                      )
                    ) : (
                      <span className="font-serif italic text-xs text-muted">{full && !d.is_internal ? 'full department' : '—'}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
