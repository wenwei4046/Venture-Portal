'use client'

import { useState, useTransition } from 'react'
import { hasMode, type DepartmentMode } from '@/lib/department-mode'
import { billingModeLabel } from '@/lib/invoice-labels'
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
  poolNames = {},
}: {
  departments: DeptRow[]
  /** Cost center / centralized per department (2026-09-30) — empty when it could not be read. */
  modes?: DepartmentMode[]
  /** Pool account code → its name, so the Pool GL column reads "3120 · Marketing pool" (2026-10-09). */
  poolNames?: Record<string, string>
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

  // The Departments table per the user's Claude Design handoff (2026-10-09):
  // + New department in the band; Name, Segment, Pool GL with its name, the
  // billing mode in words, the Mode as a chip (a switch for whoever may
  // switch it), Bill back salary as a tick, Provision for a light one. The
  // notes on what each means sit in a fold.
  return (
    <section>
      <div className="gl-toolbar">
        <span className="flex-1 text-xs text-graphite">Names can&apos;t change, departments can&apos;t be deleted, and a provision can&apos;t be undone.</span>
        <button type="button" onClick={() => setShowAdd(!showAdd)} className={showAdd ? 'btn-quiet-sheet' : 'btn-pri-sheet'}>
          {showAdd ? 'Cancel' : '+ New department'}
        </button>
      </div>

      <details className="fin-fold">
        <summary>
          How departments work
          <small>LIGHT · PROVISION · BILL BACK · MODE</small>
        </summary>
        <div className="fin-fold-inner text-sm text-graphite space-y-3 max-w-3xl">
          <p>
            普通部门:挂员工、挂 claims、被 inter-billing 开单,账记 Venture。按 <em>Provision</em> 给它自己的 segment / P&amp;L / pool /
            开单模式 — 全系统自动接上。名字不能改、部门不能删、转正不能撤销。
          </p>
          <p>
            <em>Bill back 薪水</em>:这个部门没 bill 给子公司的那部分薪水,勾了就转给 Venture Office 承担(部门自己收回来),不勾就留在自己的
            pool。开 own-share 单的时候照这里带出来,那一次可以临时改。
          </p>
          <p>
            <em>Mode</em>:<em>Cost center</em> 只是过一手 — 薪水在 Billing Allocation 分给子公司,pool 应该归零。<em>Centralized</em>
            自己开 invoice 给子公司、钱进自己的 pool、自己付 — 不进 Billing Allocation。只有 Principal 能切;切成 Centralized 会清掉它还在 draft 的 split。
          </p>
        </div>
      </details>

      {error ? <div className="sheet-danger mb-4">{error}</div> : null}

      {showAdd ? (
        <form action={handleAdd} className="fin-form mb-6 max-w-xl">
          <div className="fin-field span-3">
            <label htmlFor="new_dept_name">Department name</label>
            <input id="new_dept_name" name="name" type="text" required maxLength={40} placeholder="e.g. Operations" />
            <p className="fin-hint">取好再按 — 加了之后名字改不了。</p>
          </div>
          <div className="span-3">
            <button type="submit" disabled={isPending} className="btn-pri-sheet">
              {isPending ? 'Adding…' : 'Add department'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sect-head">
        <h2>Departments</h2>
        <span className="rule" aria-hidden />
        <span className="count">{departments.length} ACTIVE</span>
      </div>
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="m-hide">Segment</th>
                <th className="m-hide">Pool GL</th>
                <th className="m-hide">Billing mode</th>
                <th>Mode</th>
                <th className="m-hide" style={{ textAlign: 'center' }}>
                  Bill back salary
                </th>
                <th className="right m-hide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => {
                const full = d.segment_key !== null
                const mode = modeById.get(d.id)
                return (
                  <tr key={d.id}>
                    <td className="font-medium">
                      {d.name}
                      {d.is_internal ? (
                        <span className="chip ml-2">
                          <span className="dot" />
                          internal
                        </span>
                      ) : null}
                    </td>
                    <td className="font-mono text-xs m-hide" data-label="Segment">
                      {full ? d.segment_key : <span className="text-graphite">Venture (light)</span>}
                    </td>
                    <td className="m-hide" data-label="Pool GL">
                      {d.pool_gl_code ? (
                        <>
                          <span className="font-mono text-xs">{d.pool_gl_code}</span>
                          {poolNames[d.pool_gl_code] ? ` · ${poolNames[d.pool_gl_code]}` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="m-hide" data-label="Billing mode">
                      {billingModeLabel(d.billing_mode_key)}
                    </td>
                    <td>
                      {mode && hasMode(mode) ? (
                        mode.canSwitch ? (
                          <DepartmentModeSwitch department={mode} variant="cell" />
                        ) : (
                          <span className={`chip ${mode.costModel === 'cost_center' ? 'accent' : 'info'}`}>
                            <span className="dot" />
                            {mode.costModel === 'cost_center' ? 'cost center' : 'centralized'}
                          </span>
                        )
                      ) : (
                        <span className="text-graphite">—</span>
                      )}
                    </td>
                    <td className="m-hide" style={{ textAlign: 'center' }} data-label="Bill back salary">
                      {full && !d.is_internal ? (
                        <input
                          type="checkbox"
                          checked={d.own_share_billback}
                          onChange={(e) => handleBillback(d, e.target.checked)}
                          disabled={isPending}
                          className="accent-accent"
                          aria-label={`${d.name} bills its own-share salary back`}
                          title={
                            d.own_share_billback
                              ? d.name + ' 没 bill 给子公司的薪水 → 转给 Venture Office 承担'
                              : d.name + ' 没 bill 给子公司的薪水 → 留在自己的 pool'
                          }
                        />
                      ) : (
                        <span className="text-graphite">—</span>
                      )}
                    </td>
                    <td className="right m-hide" data-label="Actions">
                      {!full && !d.is_internal ? (
                        provisionId === d.id ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-2">
                            <input
                              value={segKey}
                              onChange={(e) => setSegKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                              placeholder="segment key"
                              aria-label="Segment key"
                              className="px-2 py-1 bg-white border border-hairline rounded-md text-xs font-mono text-ink w-44 focus:outline-none focus:border-accent-border"
                            />
                            <button
                              type="button"
                              onClick={() => handleProvision(d)}
                              disabled={isPending || !/^[a-z][a-z0-9_]{2,30}$/.test(segKey)}
                              className="btn-pri-sheet"
                            >
                              {isPending ? 'Provisioning…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProvisionId(null)
                                setSegKey('')
                              }}
                              className="btn-quiet-sheet"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setProvisionId(d.id)
                              setSegKey(slugOf(d.name))
                            }}
                            className="btn-quiet-sheet"
                            title="转正 — its own segment, P&L, pool and billing mode"
                          >
                            Provision
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-graphite">{full && !d.is_internal ? 'Full department' : '—'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
