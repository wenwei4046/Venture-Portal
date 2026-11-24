'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { SegmentedControl } from '@/components/ds/Controls'
import { DsSelect, Field, TextField } from '@/components/ds/Field'
import { Button } from '@/components/ds/Button'
import { CenterWindow, PanelHead } from '@/components/ds/Overlay'
import { formatMoney } from '@/lib/utils'
import { figuresOf, monthsOf, postRows, type FaAsset, type FaClass, type FaData, type StartRule } from '@/lib/fixed-assets'
import { postDepreciation, saveFaAsset, saveFaClass, undoDepreciation } from '../actions'

// The page's three views (2026-11-24): the register (each asset, what it cost, what is depreciated as at, what is
// left), the schedule (the financial year's months, asset by asset) and the classes Finance keeps.

export interface AccountChoice {
  code: string
  name: string
  kind: 'fixed_asset' | 'expense'
}

type View = 'register' | 'schedule' | 'classes'
const mon = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')
const money = (n: number) => (Math.abs(n) < 0.005 ? '—' : formatMoney(n))
const r2 = (n: number) => Math.round(n * 100) / 100

export default function FixedAssetsView({ data, accounts, fy, years, now, view: initialView, canEdit, canPost }: {
  data: FaData
  accounts: AccountChoice[]
  fy: { from: string; to: string }
  years: { from: string; to: string }[]
  now: string
  view: View
  canEdit: boolean
  canPost: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<View>(initialView)
  const [busy, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<FaAsset | null>(null)
  const [editingClass, setEditingClass] = useState<FaClass | 'new' | null>(null)

  // As at the year's end, or this month while the year runs.
  const asAt = fy.to < now ? fy.to : now
  const figures = useMemo(() => figuresOf(data, asAt), [data, asAt])
  const months = monthsOf(fy.from, fy.to)
  const classById = new Map(data.classes.map((c) => [c.id, c]))

  const inYear = (f: (typeof figures)[number]) => r2(f.months.filter((m) => m.month >= fy.from && m.month <= fy.to).reduce((s, m) => s + m.amount, 0))
  const totals = {
    cost: r2(figures.reduce((s, f) => s + f.asset.cost, 0)),
    accumulated: r2(figures.reduce((s, f) => s + f.accumulated, 0)),
    nbv: r2(figures.reduce((s, f) => s + f.nbv, 0)),
    year: r2(figures.reduce((s, f) => s + inYear(f), 0)),
  }
  const postedThrough = data.postings.reduce((m, p) => (p.month > m ? p.month : m), '')
  const postable = monthsOf(fy.from, asAt).reverse()
  // The month picked counts only while it is one of this year's (2026-11-24: picked on another year, it stayed — the
  // select showed June, Post would have taken November).
  const [picked, setThrough] = useState(asAt)
  const through = postable.includes(picked) ? picked : asAt
  const due = postRows({ ...data, assets: data.assets.map((a) => ({ ...a, draft: false })) }, through)
  const dueAmount = r2(due.reduce((s, r) => s + r.postings.reduce((t, p) => t + p.amount, 0), 0))

  const run = (work: () => Promise<string>) =>
    start(async () => {
      setMessage(null)
      try {
        setMessage(await work())
        router.refresh()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e))
      }
    })

  const pickYear = (from: string) => router.push(`/reconciliation/fixed-assets?fy=${from}${view !== 'register' ? `&view=${view}` : ''}`)

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · FIXED ASSETS · FY {mon(fy.from).toUpperCase()} – {mon(fy.to).toUpperCase()}
          </div>
          <h1 className="page-title">Fixed Assets</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href={`/reconciliation/fixed-assets/export?fy=${fy.from}`} className="btn-quiet-sheet">
            Excel
          </a>
        </div>
      </div>

      <StatCards label="Fixed assets">
        <StatCard label="Cost" value={formatMoney(totals.cost)} icon="wallet" note={`${figures.length} assets`} />
        <StatCard label={`Accumulated · ${mon(asAt)}`} value={formatMoney(totals.accumulated)} icon="chart" tone="out" note="Depreciation to date" />
        <StatCard label={`Net book value · ${mon(asAt)}`} value={formatMoney(totals.nbv)} icon="receipt" tone="primary" note="Cost − accumulated" />
        <StatCard label="Depreciation · this year" value={formatMoney(totals.year)} icon="chart" tone="danger" note={`${mon(fy.from)} – ${mon(asAt)}`} />
      </StatCards>

      <div className="flex flex-wrap items-end gap-3 mb-4" role="group" aria-label="Controls">
        <Field label="Financial year">
          <DsSelect
            ariaLabel="Financial year"
            value={fy.from}
            width={220}
            onChange={pickYear}
            options={years.map((y) => ({ value: y.from, label: `${mon(y.from)} – ${mon(y.to)}` }))}
          />
        </Field>
        <SegmentedControl
          options={[{ value: 'register', label: 'Register' }, { value: 'schedule', label: 'Schedule' }, { value: 'classes', label: 'Classes' }]}
          value={view}
          onChange={(v) => setView(v as View)}
        />
        {canPost ? (
          <div className="flex items-end gap-2 ml-auto">
            <Field label="Post through" hint={postedThrough ? `Posted through ${mon(postedThrough)}` : 'Nothing posted yet'}>
              <DsSelect ariaLabel="Post through" value={through} width={150} onChange={setThrough} options={postable.map((m) => ({ value: m, label: mon(m) }))} />
            </Field>
            <Button
              disabled={busy || due.length === 0}
              onClick={() =>
                run(async () => {
                  const { months: n } = await postDepreciation(through)
                  return n === 0 ? 'Nothing to post.' : `Posted ${n} month${n === 1 ? '' : 's'} of depreciation.`
                })
              }
            >
              {due.length === 0 ? 'Up to date' : `Post ${formatMoney(dueAmount)}`}
            </Button>
            {postedThrough ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`Reverse the depreciation posted from ${mon(through)} on?`)) return
                  run(async () => {
                    const { entries } = await undoDepreciation(through)
                    return entries === 0 ? 'Nothing was posted from that month.' : `Reversed ${entries} entr${entries === 1 ? 'y' : 'ies'}.`
                  })
                }}
              >
                Undo from {mon(through)}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {message ? <p className="text-sm text-graphite mb-3" role="status">{message}</p> : null}

      {view === 'register' ? (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Class</th>
                <th>In service</th>
                <th className="num">Cost</th>
                <th className="num">Life</th>
                <th className="num">Monthly</th>
                <th className="num">Accumulated</th>
                <th className="num">Net book value</th>
                {canEdit ? <th aria-label="Edit" /> : null}
              </tr>
            </thead>
            <tbody>
              {figures.map((f) => (
                <tr key={f.asset.id}>
                  <td>
                    <span className="font-medium text-ink">{f.asset.name}</span>
                    <span className="font-mono text-[11px] text-graphite ml-2">{f.asset.voucher}</span>
                    {f.asset.draft ? <span className="text-[11px] text-muted ml-2">· new</span> : null}
                    {f.asset.disposedOn ? <span className="text-[11px] text-muted ml-2">· disposed {dayjs(f.asset.disposedOn).format('D MMM YYYY')}</span> : null}
                  </td>
                  <td>{f.cls?.name ?? '—'}</td>
                  <td className="whitespace-nowrap">{dayjs(f.asset.inServiceDate).format('D MMM YYYY')}</td>
                  <td className="num">{formatMoney(f.asset.cost)}</td>
                  <td className="num">{f.asset.lifeMonths ?? f.cls?.lifeMonths ?? '—'} mo</td>
                  <td className="num">{money(f.monthly)}</td>
                  <td className="num">{money(f.accumulated)}</td>
                  <td className="num">{formatMoney(f.nbv)}</td>
                  {canEdit ? (
                    <td>
                      <Button variant="link" size="sm" onClick={() => setEditing(f.asset)}>
                        Edit
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num">{formatMoney(totals.cost)}</td>
                <td />
                <td />
                <td className="num">{formatMoney(totals.accumulated)}</td>
                <td className="num">{formatMoney(totals.nbv)}</td>
                {canEdit ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}

      {view === 'schedule' ? (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Asset</th>
                {months.map((m) => (
                  <th key={m} className="num whitespace-nowrap">{dayjs(`${m}-01`).format('MMM YY')}</th>
                ))}
                <th className="num">Year</th>
              </tr>
            </thead>
            <tbody>
              {figures.map((f) => {
                const byMonth = new Map(f.months.map((m) => [m.month, m]))
                return (
                  <tr key={f.asset.id}>
                    <td className="whitespace-nowrap"><span className="font-medium text-ink">{f.asset.name}</span></td>
                    {months.map((m) => {
                      const row = byMonth.get(m)
                      return (
                        <td key={m} className={`num ${row && !row.posted ? 'text-muted' : ''}`} title={row ? (row.posted ? 'Posted' : 'Not posted yet') : undefined}>
                          {row ? money(row.amount) : ''}
                        </td>
                      )
                    })}
                    <td className="num">{money(inYear(f))}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {months.map((m) => (
                  <td key={m} className="num">{money(r2(figures.reduce((s, f) => s + (f.months.find((x) => x.month === m)?.amount ?? 0), 0)))}</td>
                ))}
                <td className="num">{formatMoney(totals.year)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-xs text-muted mt-2">Grey: worked out, not posted yet. Months after {mon(asAt)} are not shown.</p>
        </div>
      ) : null}

      {view === 'classes' ? (
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Class</th>
                <th className="num">Life</th>
                <th className="num">Residual</th>
                <th>Starts</th>
                <th>Asset account</th>
                <th>Accumulated depreciation</th>
                <th>Depreciation</th>
                {canEdit ? <th aria-label="Edit" /> : null}
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => (
                <tr key={c.id} className={c.isActive ? '' : 'text-muted'}>
                  <td className="font-medium">{c.name}{c.isActive ? '' : ' · off'}</td>
                  <td className="num">{c.lifeMonths} mo ({r2(c.lifeMonths / 12)} yr)</td>
                  <td className="num">{c.residualPct}%</td>
                  <td>{c.startRule === 'next_month' ? 'Month after purchase' : 'Purchase month'}</td>
                  <td className="font-mono text-[12px]">{c.assetAccount}</td>
                  <td className="font-mono text-[12px]">{c.accumAccount}</td>
                  <td className="font-mono text-[12px]">{c.expenseAccount}</td>
                  {canEdit ? (
                    <td>
                      <Button variant="link" size="sm" onClick={() => setEditingClass(c)}>
                        Edit
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit ? (
            <div className="mt-3">
              <Button variant="secondary" onClick={() => setEditingClass('new')}>+ Add class</Button>
            </div>
          ) : null}
          <p className="text-xs text-muted mt-2">
            A changed life or residual spreads what is left over the months left; months already posted stay. To post them
            again, undo from the first month to change.
          </p>
        </div>
      ) : null}

      {editing ? (
        <AssetWindow
          asset={editing}
          data={data}
          classes={data.classes}
          classById={classById}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null)
            setMessage(m)
            router.refresh()
          }}
        />
      ) : null}
      {editingClass ? (
        <ClassWindow
          cls={editingClass === 'new' ? null : editingClass}
          accounts={accounts}
          onClose={() => setEditingClass(null)}
          onSaved={(m) => {
            setEditingClass(null)
            setMessage(m)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function AssetWindow({ asset, data, classes, classById, onClose, onSaved }: {
  asset: FaAsset
  data: FaData
  classes: FaClass[]
  classById: Map<string, FaClass>
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [name, setName] = useState(asset.name)
  const [classId, setClassId] = useState(asset.classId)
  const [date, setDate] = useState(asset.inServiceDate)
  const [life, setLife] = useState(asset.lifeMonths == null ? '' : String(asset.lifeMonths))
  const [disposed, setDisposed] = useState(asset.disposedOn ?? '')
  const [notes, setNotes] = useState(asset.notes ?? '')
  const [lineIds, setLineIds] = useState(asset.lineIds)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const cls = classById.get(classId)
  // The lines this asset may take: its own, and those on its class's account no kept asset holds… or any other's.
  const choices = data.lines.filter((l) => cls && l.account === cls.assetAccount && l.amount > 0)
  const cost = r2(choices.filter((l) => lineIds.includes(l.id)).reduce((s, l) => s + l.amount, 0))
  const holder = (id: string | null) => (id ? data.assets.find((a) => a.id === id)?.name ?? 'another asset' : null)

  const save = () =>
    start(async () => {
      setError(null)
      try {
        await saveFaAsset({
          id: asset.draft ? undefined : asset.id,
          name,
          classId,
          inServiceDate: date,
          lifeMonths: life.trim() ? Number(life) : null,
          disposedOn: disposed || null,
          notes: notes.trim() || null,
          lineIds,
        })
        onSaved(`Saved ${name}.`)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })

  return (
    <CenterWindow open onClose={onClose} width={640}>
      <PanelHead eyebrow={asset.draft ? 'New asset' : 'Asset'} title={asset.name} sub={asset.voucher} onClose={onClose} />
      <div style={{ padding: '16px 20px', display: 'grid', gap: 12, overflowY: 'auto' }}>
        <Field label="Name"><TextField ariaLabel="Name" value={name} onChange={setName} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Class">
            <DsSelect ariaLabel="Class" value={classId} onChange={setClassId} options={classes.filter((c) => c.isActive || c.id === classId).map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="In service">
            <input aria-label="In service" type="date" className="jv-input font-mono" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Life (months)" optional hint={cls ? `The class: ${cls.lifeMonths} months` : undefined}>
            <TextField ariaLabel="Life (months)" type="number" value={life} onChange={setLife} placeholder={cls ? String(cls.lifeMonths) : ''} />
          </Field>
          <Field label="Disposed of" optional hint="Depreciation stops with that month">
            <input aria-label="Disposed of" type="date" className="jv-input font-mono" value={disposed} onChange={(e) => setDisposed(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes" optional><TextField ariaLabel="Notes" value={notes} onChange={setNotes} /></Field>
        <Field label={`Purchase lines · cost ${formatMoney(cost)}`}>
          <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {choices.map((l) => {
              const on = lineIds.includes(l.id)
              const other = l.assetId && l.assetId !== asset.id ? holder(l.assetId) : null
              return (
                <label key={l.id} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={on} onChange={() => setLineIds(on ? lineIds.filter((x) => x !== l.id) : [...lineIds, l.id])} />
                  <span className="font-mono text-[12px] w-[86px]">{dayjs(l.date).format('D MMM YY')}</span>
                  <span className="flex-1 truncate">{l.description || l.entryDescription}</span>
                  <span className="font-mono">{formatMoney(l.amount)}</span>
                  {other ? <span className="text-[11px] text-muted">· in {other}</span> : null}
                </label>
              )
            })}
          </div>
        </Field>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || lineIds.length === 0 || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </CenterWindow>
  )
}

function ClassWindow({ cls, accounts, onClose, onSaved }: {
  cls: FaClass | null
  accounts: AccountChoice[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const fixed = accounts.filter((a) => a.kind === 'fixed_asset').map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))
  const expense = accounts.filter((a) => a.kind === 'expense').map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))
  const [name, setName] = useState(cls?.name ?? '')
  const [years, setYears] = useState(cls ? String(r2(cls.lifeMonths / 12)) : '3')
  const [residual, setResidual] = useState(String(cls?.residualPct ?? 0))
  const [startRule, setStartRule] = useState<StartRule>(cls?.startRule ?? 'purchase_month')
  const [assetAccount, setAssetAccount] = useState(cls?.assetAccount ?? fixed[0]?.value ?? '')
  const [accumAccount, setAccumAccount] = useState(cls?.accumAccount ?? '')
  const [expenseAccount, setExpenseAccount] = useState(cls?.expenseAccount ?? (expense.find((e) => e.value === '9100')?.value ?? ''))
  const [active, setActive] = useState(cls?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const save = () =>
    start(async () => {
      setError(null)
      try {
        const months = Math.round(Number(years) * 12)
        await saveFaClass({ id: cls?.id, name, lifeMonths: months, residualPct: Number(residual), startRule, assetAccount, accumAccount, expenseAccount, isActive: active })
        onSaved(`Saved ${name}.`)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })

  return (
    <CenterWindow open onClose={onClose} width={560}>
      <PanelHead eyebrow={cls ? 'Class' : 'New class'} title={cls?.name ?? 'New class'} onClose={onClose} />
      <div style={{ padding: '16px 20px', display: 'grid', gap: 12 }}>
        <Field label="Name"><TextField ariaLabel="Class name" value={name} onChange={setName} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Life (years)" hint={`${Math.round(Number(years) * 12) || 0} months`}>
            <TextField ariaLabel="Life (years)" type="number" step="0.5" value={years} onChange={setYears} />
          </Field>
          <Field label="Residual">
            <TextField ariaLabel="Residual" type="number" value={residual} onChange={setResidual} suffix="%" />
          </Field>
          <Field label="Starts">
            <DsSelect ariaLabel="Starts" value={startRule} onChange={(v) => setStartRule(v as StartRule)}
              options={[{ value: 'purchase_month', label: 'Purchase month' }, { value: 'next_month', label: 'Month after' }]} />
          </Field>
        </div>
        <Field label="Asset account"><DsSelect ariaLabel="Asset account" value={assetAccount} onChange={setAssetAccount} options={fixed} /></Field>
        <Field label="Accumulated depreciation account">
          <DsSelect ariaLabel="Accumulated depreciation account" value={accumAccount} onChange={setAccumAccount} options={[{ value: '', label: 'Pick an account' }, ...fixed]} />
        </Field>
        <Field label="Depreciation account">
          <DsSelect ariaLabel="Depreciation account" value={expenseAccount} onChange={setExpenseAccount} options={[{ value: '', label: 'Pick an account' }, ...expense]} />
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={active} onChange={() => setActive(!active)} /> In use — new purchases on its account take it
        </label>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !name.trim() || !accumAccount || !expenseAccount} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </CenterWindow>
  )
}
