'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { parseRatio, teamCost, validateCostSetting, type CostSettingEdit } from '@/lib/catalogue/rule-edits'
import { saveCostSetting } from '../../catalogue-actions'
import type { CostRatioRow, PickSku } from '../load'
import PageScrolledTable from './PageScrolledTable'
import SubDepartmentChips, { type SubRef } from './SubDepartmentChips'
import { useProductDraftGuard } from './ProductWorkspace'
import { categoryLabel, MirrorFlags } from './ui'

const PICK_LIMIT = 20

/** A ratio as the page prints it: two decimals at least, four at most. */
export function formatRatio(n: number): string {
  return n.toFixed(4).replace(/0{1,2}$/, '')
}

interface CostRange {
  low: number
  high: number
}

/** A SKU's Product List cost: its one price, else its sofa grid's lowest and highest. */
export function costOf(sku: PickSku | undefined): CostRange | null {
  if (!sku) return null
  if (sku.price !== null) return { low: sku.price, high: sku.price }
  if (sku.priceLow !== null && sku.priceHigh !== null) return { low: sku.priceLow, high: sku.priceHigh }
  return null
}

function rangeLabel(range: CostRange, ratio = 1): string {
  const low = formatMoneyBare(teamCost(range.low, ratio))
  return range.low === range.high ? low : `${low} – ${formatMoneyBare(teamCost(range.high, ratio))}`
}

function readRatio(text: string): number | null | 'bad' {
  try {
    return parseRatio(text, 'Ratio')
  } catch {
    return 'bad'
  }
}

interface Line {
  erpId: string
  saved: CostRatioRow | null
  sku: PickSku | undefined
}

/**
 * Product List › Costing Setting (user 2026-09-27): "这边填的 costing 需要除以
 * 0.7 才会出现在 calculator 的 costing … 部分 SKU 它的除法 rate 不一样，比如
 * 可能是除以 0.6". One sub-department's ratio, and the SKUs divided by a ratio
 * of their own. What it moves is the Revenue Team's cost — the one every
 * margin in the calculator, the month and the run is judged against — never a
 * price on the SKU Master.
 */
export default function CostSettingTab({
  sub,
  subs,
  schemeId,
  divisor,
  ratios,
  skus,
}: {
  sub: SubRef
  subs: SubRef[]
  schemeId: string
  divisor: number
  ratios: CostRatioRow[]
  skus: PickSku[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [divisorDraft, setDivisorDraft] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [added, setAdded] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [pickRatio, setPickRatio] = useState('')
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const skuById = useMemo(() => new Map(skus.map(s => [s.erpId, s])), [skus])
  const lines = useMemo<Line[]>(() => {
    const saved = new Set(ratios.map(r => r.erpId))
    return [
      // Added this time first, where the picker put them.
      ...added.filter(id => !saved.has(id)).map(id => ({ erpId: id, saved: null, sku: skuById.get(id) })),
      ...ratios.map(r => ({ erpId: r.erpId, saved: r, sku: skuById.get(r.erpId) })),
    ]
  }, [added, ratios, skuById])
  const onList = useMemo(() => new Set(lines.map(l => l.erpId)), [lines])

  const codeOf = (l: Line) => l.saved?.code ?? l.sku?.code ?? l.erpId
  // The ERP renamed the SKU: its new bills carry a code the ratio no longer matches.
  const renamed = (l: Line) => l.saved !== null && l.sku !== undefined && l.sku.code !== l.saved.code
  const differs = (text: string, saved: number) => {
    const n = readRatio(text)
    return n === null || n === 'bad' || n !== saved
  }
  /** What saving sends for a line: undefined = nothing; '' = back to the sub-department's ratio. */
  const changeOf = (l: Line): string | undefined => {
    const text = drafts.get(l.erpId)
    if (l.saved === null) return text ?? ''
    if (text !== undefined && differs(text, l.saved.ratio)) return text.trim()
    if (renamed(l)) return String(l.saved.ratio)
    return undefined
  }

  const divisorChanged = divisorDraft !== null && differs(divisorDraft, divisor)
  const changed = editing ? lines.filter(l => changeOf(l) !== undefined) : []
  const dirty = editing ? (divisorChanged ? 1 : 0) + changed.length : 0
  const renamedCount = lines.filter(renamed).length
  useProductDraftGuard(dirty > 0, saving)

  const draftDivisor = divisorDraft === null ? divisor : readRatio(divisorDraft)
  const shownDivisor = typeof draftDivisor === 'number' ? draftDivisor : divisor
  /** The ratio a line is judged at once saved; null = its sub-department's. */
  const ratioOf = (l: Line): number | null => {
    const text = drafts.get(l.erpId)
    if (text === undefined) return l.saved?.ratio ?? null
    const n = readRatio(text)
    return n === 'bad' ? l.saved?.ratio ?? null : n
  }

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      q
        ? skus.filter(
            s =>
              !s.removed &&
              [s.code, s.description, s.model, s.category ? categoryLabel(s.category) : null].some(v =>
                (v ?? '').toLowerCase().includes(q),
              ),
          )
        : [],
    [skus, q],
  )
  const shown = matches.slice(0, PICK_LIMIT)
  const tickable = shown.filter(s => !onList.has(s.erpId))

  function reset() {
    setDivisorDraft(null)
    setDrafts(new Map())
    setAdded([])
    setTicked(new Set())
    setQuery('')
    setPickRatio('')
  }

  function cancel() {
    if (saving) return
    reset()
    setEditing(false)
    setError(null)
  }

  function setDraft(erpId: string, text: string) {
    setDrafts(previous => new Map(previous).set(erpId, text))
    setNotice(null)
  }

  function dropDraft(erpId: string) {
    setDrafts(previous => {
      const next = new Map(previous)
      next.delete(erpId)
      return next
    })
  }

  function toggle(erpId: string) {
    setTicked(previous => {
      const next = new Set(previous)
      if (next.has(erpId)) next.delete(erpId)
      else next.add(erpId)
      return next
    })
  }

  function addTicked() {
    const ratio = readRatio(pickRatio)
    if (ratio === 'bad' || ratio === null) {
      setError(ratio === null ? 'Type the ratio the ticked SKUs are divided by, such as 0.6.' : `"${pickRatio}" is not a ratio above 0 and at most 10.`)
      return
    }
    const ids = [...ticked].filter(id => !onList.has(id))
    setAdded(previous => [...ids, ...previous])
    setDrafts(previous => {
      const next = new Map(previous)
      for (const id of ids) next.set(id, pickRatio.trim())
      return next
    })
    setTicked(new Set())
    setError(null)
    setNotice(null)
  }

  function save() {
    if (saving || dirty === 0) return
    const blank = lines.find(l => l.saved === null && !(drafts.get(l.erpId) ?? '').trim())
    if (blank) {
      setError(`${codeOf(blank)}: give it a ratio, or take it off the list.`)
      return
    }
    const edit: CostSettingEdit = {
      divisor: divisorChanged && divisorDraft !== null ? divisorDraft : undefined,
      ratios: changed.map(l => ({ erpId: l.erpId, ratio: changeOf(l) ?? '', label: codeOf(l) })),
    }
    try {
      validateCostSetting(edit)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the ratios.')
      return
    }
    setError(null)
    setNotice(null)
    startSaving(async () => {
      try {
        await saveCostSetting(schemeId, edit)
        reset()
        setEditing(false)
        setNotice(
          'Saved. The calculator judges margins at these ratios from now on; a month already computed moves when its run is computed again.',
        )
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the costing setting.')
      }
    })
  }

  const columns = editing ? 7 : 6

  return (
    <section className="sku-master rule-setting" aria-label="Costing Setting">
      <div className="sku-filters">
        <SubDepartmentChips subs={subs} active={sub.slug} tab="costing" dirty={dirty > 0} saving={saving} />
      </div>

      <div className="rule-card">
        <div className="rule-card-figure">
          <span className="rule-card-label">{sub.name} · every SKU</span>
          {editing ? (
            <label className="rule-card-input">
              <span aria-hidden="true">÷</span>
              <input
                value={divisorDraft ?? formatRatio(divisor)}
                onChange={e => {
                  setDivisorDraft(e.target.value)
                  setNotice(null)
                }}
                disabled={saving}
                inputMode="decimal"
                aria-label={`${sub.name} cost ratio`}
                className="sku-price-input"
              />
            </label>
          ) : (
            <strong className="rule-card-value">÷ {formatRatio(divisor)}</strong>
          )}
        </div>
        <p>
          The Revenue Team&apos;s cost is the Product List cost divided by this — {formatMoney(1000)} of cost is judged as{' '}
          {formatMoney(teamCost(1000, shownDivisor))}. The calculator, the month&apos;s margins and the run all read it. A SKU
          below is divided by its own ratio instead.
        </p>
      </div>

      <div className="sku-actions">
        <div className="maintenance-pool-heading">
          <h2>SKUs with their own ratio</h2>
          <p className="sku-count" aria-live="polite">
            <strong>{ratios.length.toLocaleString()}</strong> SKU{ratios.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="sku-action-buttons">
          {editing ? (
            <>
              <button type="button" className="sku-secondary-button" disabled={saving} onClick={cancel}>
                Cancel changes
              </button>
              <button type="button" className="sku-primary-button" disabled={saving || dirty === 0} onClick={save}>
                {saving ? 'Saving…' : dirty === 0 ? 'Save changes' : `Save ${dirty} change${dirty === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sku-primary-button"
              onClick={() => {
                setEditing(true)
                setNotice(null)
              }}
            >
              Edit ratios
            </button>
          )}
        </div>
      </div>
      <p className="sku-edit-note">
        {editing
          ? `Blank a SKU's ratio, or remove it, and it is divided by ${formatRatio(shownDivisor)} again.`
          : `Every other SKU is divided by ${formatRatio(divisor)}.`}
        {editing && renamedCount > 0
          ? ` ${renamedCount} SKU${renamedCount === 1 ? ' was' : 's were'} renamed in the ERP; saving follows ${renamedCount === 1 ? 'it' : 'them'} to the new code.`
          : ''}
      </p>
      {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
      {notice ? <p className="sku-notice" data-tone="ok" role="status">{notice}</p> : null}

      {editing ? (
        <div className="rule-picker" role="group" aria-label="Add SKUs">
          <div className="rule-picker-head">
            <h3>Add SKUs with their own ratio</h3>
            <label className="sku-search">
              <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" />
              </svg>
              <input
                type="search"
                value={query}
                disabled={saving}
                onChange={e => setQuery(e.target.value)}
                placeholder="Find a SKU by code, model or description…"
                aria-label="Find a SKU"
              />
            </label>
          </div>
          {!q ? (
            <p className="rule-pick-empty">Type part of a SKU code, a model or a description.</p>
          ) : shown.length === 0 ? (
            <p className="rule-pick-empty">No SKU matches &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul className="rule-pick-list">
              {shown.map(s => {
                const listed = onList.has(s.erpId)
                const cost = costOf(s)
                return (
                  <li key={s.erpId}>
                    <label className="rule-pick-row" data-disabled={listed || undefined}>
                      <input type="checkbox" checked={ticked.has(s.erpId)} disabled={listed || saving} onChange={() => toggle(s.erpId)} />
                      <span className="rule-pick-code">{s.code}</span>
                      <span className="rule-pick-desc">
                        {s.description ?? '—'}
                        <span className="sku-model-name">
                          {[s.model, categoryLabel(s.category)].filter(v => v && v !== '—').join(' · ')}
                        </span>
                      </span>
                      <span className="rule-pick-cost">{listed ? 'On the list' : cost ? `RM ${rangeLabel(cost)}` : 'No price'}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
          {matches.length > shown.length ? (
            <p className="rule-pick-more">
              Showing {shown.length} of {matches.length.toLocaleString()} — narrow the search.
            </p>
          ) : null}
          <div className="rule-picker-foot">
            <button
              type="button"
              className="sku-secondary-button"
              disabled={saving || tickable.length === 0}
              onClick={() => setTicked(previous => new Set([...previous, ...tickable.map(s => s.erpId)]))}
            >
              Tick all {tickable.length} shown
            </button>
            <label className="rule-picker-field">
              <span>Divide by</span>
              <input
                value={pickRatio}
                onChange={e => setPickRatio(e.target.value)}
                disabled={saving}
                inputMode="decimal"
                placeholder="0.6"
                aria-label="Ratio for the ticked SKUs"
                className="sku-price-input"
              />
            </label>
            <button type="button" className="sku-primary-button" disabled={saving || ticked.size === 0} onClick={addTicked}>
              Add {ticked.size} SKU{ticked.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="sku-table-panel">
        <PageScrolledTable label="SKUs with their own cost ratio">
          <table className="ledger-table sku-table">
            <thead>
              <tr>
                <th scope="col" className="sku-code-column">SKU code</th>
                <th scope="col">Description</th>
                <th scope="col">Category</th>
                <th scope="col" className="num">Cost (RM)</th>
                <th scope="col" className="num">Ratio</th>
                <th scope="col" className="num">Team cost (RM)</th>
                {editing ? (
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {lines.map(l => {
                const text = drafts.get(l.erpId)
                const going = l.saved !== null && text !== undefined && text.trim() === ''
                const cost = costOf(l.sku)
                const judged = ratioOf(l) ?? shownDivisor
                return (
                  <tr key={l.erpId} data-state={l.saved === null ? 'new' : going ? 'removing' : undefined}>
                    <td className="sku-code-column">
                      {codeOf(l)}
                      {renamed(l) ? <span className="sku-model-name">Now {l.sku?.code} in the ERP</span> : null}
                    </td>
                    <td className="sku-description">
                      {l.sku?.description ?? '—'}
                      <span className="rule-flags">
                        {l.saved === null ? <span className="chip accent whitespace-nowrap">NEW</span> : null}
                        {going ? <span className="chip whitespace-nowrap">BACK TO {formatRatio(shownDivisor)}</span> : null}
                        {l.sku ? <MirrorFlags isNew={false} active={l.sku.active} removed={l.sku.removed} /> : null}
                      </span>
                    </td>
                    <td>{categoryLabel(l.sku?.category ?? null)}</td>
                    <td className="num">{cost ? rangeLabel(cost) : <span title="No price on the SKU Master">—</span>}</td>
                    <td className="num">
                      {editing ? (
                        <input
                          value={text ?? (l.saved ? formatRatio(l.saved.ratio) : '')}
                          onChange={e => setDraft(l.erpId, e.target.value)}
                          disabled={saving}
                          inputMode="decimal"
                          placeholder={formatRatio(shownDivisor)}
                          aria-label={`${codeOf(l)} ratio`}
                          className="sku-price-input"
                        />
                      ) : l.saved ? (
                        formatRatio(l.saved.ratio)
                      ) : null}
                    </td>
                    <td className="num">{cost ? rangeLabel(cost, judged) : '—'}</td>
                    {editing ? (
                      <td className="sku-nowrap">
                        {l.saved === null ? (
                          <button
                            type="button"
                            className="rule-row-button"
                            disabled={saving}
                            onClick={() => {
                              setAdded(previous => previous.filter(id => id !== l.erpId))
                              dropDraft(l.erpId)
                            }}
                          >
                            Take off
                          </button>
                        ) : going ? (
                          <button type="button" className="rule-row-button" disabled={saving} onClick={() => dropDraft(l.erpId)}>
                            Keep
                          </button>
                        ) : (
                          <button type="button" className="rule-row-button" disabled={saving} onClick={() => setDraft(l.erpId, '')}>
                            Remove
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={columns} className="sku-empty">
                    No SKU has a ratio of its own: every SKU is divided by {formatRatio(divisor)}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </PageScrolledTable>
        <div className="sku-table-footer">
          <span>
            {ratios.length.toLocaleString()} SKU{ratios.length === 1 ? '' : 's'} with their own ratio · every other SKU ÷{' '}
            {formatRatio(divisor)}
          </span>
        </div>
      </div>
    </section>
  )
}
