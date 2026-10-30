'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { parseRatio, teamCost, validateCostSetting, type CostSettingEdit } from '@/lib/catalogue/rule-edits'
import { saveCostSetting } from '../actions'
import type { CostRatioRow, KivCostRow, PickSku } from '../load'
import KivCostsSection from './KivCostsSection'
import PageScrolledTable from './PageScrolledTable'
import SubDepartmentChips, { type SubRef } from './SubDepartmentChips'
import { useProductDraftGuard } from './ProductWorkspace'
import {
  ActionRow, categoryLabel, CellChip, CellInput, EditButton, EditingButtons, FilterPanel, Heading, MirrorFlags, money,
  Note, Notice, plural, SearchIcon, TableFoot, TickIcon,
} from './ui'
import c from './products.module.css'

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
  const low = money(teamCost(range.low, ratio))
  return range.low === range.high ? low : `${low} – ${money(teamCost(range.high, ratio))}`
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
  kivCosts = [],
}: {
  sub: SubRef
  subs: SubRef[]
  schemeId: string
  divisor: number
  ratios: CostRatioRow[]
  skus: PickSku[]
  /** KIV bed frames' four costs (2026-10-31) — every sub-department's alike. */
  kivCosts?: KivCostRow[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [divisorDraft, setDivisorDraft] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [added, setAdded] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [pickRatio, setPickRatio] = useState('')
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reset = useCallback(() => {
    setDivisorDraft(null)
    setDrafts(new Map())
    setAdded([])
    setTicked(new Set())
    setQuery('')
    setPickRatio('')
  }, [])

  // A save leaves its drafts on screen, read-only, until the refreshed rows
  // arrive; clearing them at once showed the rows from before the save for a
  // moment (prod, 2026-09-27). Settled when the server's rows change — or,
  // should the refresh never land, a little later.
  const [settling, setSettling] = useState(false)
  const settleFrom = useRef<{ ratios: CostRatioRow[]; divisor: number } | null>(null)
  const settle = useCallback(() => {
    settleFrom.current = null
    setSettling(false)
    setEditing(false)
    reset()
  }, [reset])
  useEffect(() => {
    const from = settleFrom.current
    if (settling && from && (from.ratios !== ratios || from.divisor !== divisor)) settle()
  }, [settling, ratios, divisor, settle])
  useEffect(() => {
    if (!settling) return
    const timer = window.setTimeout(settle, 15_000)
    return () => window.clearTimeout(timer)
  }, [settling, settle])
  const saving = pending || settling

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
  // The KIV costs below keep drafts of their own; one guard holds both.
  const [kivDraft, setKivDraft] = useState({ changes: 0, saving: false })
  useProductDraftGuard(dirty + kivDraft.changes, saving || kivDraft.saving)

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
  const tickedHere = [...ticked].filter(id => !onList.has(id))
  const pickOk = (() => { const n = readRatio(pickRatio); return typeof n === 'number' })()

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
    if (tickedHere.length === 0) return
    const ratio = readRatio(pickRatio)
    if (ratio === 'bad' || ratio === null) {
      setError(ratio === null ? 'Type the ratio the ticked SKUs are divided by, such as 0.6.' : `"${pickRatio}" is not a ratio above 0 and at most 10.`)
      return
    }
    setAdded(previous => [...tickedHere, ...previous])
    setDrafts(previous => {
      const next = new Map(previous)
      for (const id of tickedHere) next.set(id, pickRatio.trim())
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
    const before = { ratios, divisor }
    startSaving(async () => {
      try {
        await saveCostSetting(schemeId, edit)
        settleFrom.current = before
        setSettling(true)
        setNotice(
          'Saved. The calculator judges margins at these ratios from now on; a month already computed moves when its run is computed again.',
        )
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the costing setting.')
      }
    })
  }

  const msg = !q ? 'Type to find SKUs. Nothing shows until you search.'
    : matches.length === 0 ? 'No SKU matches.'
    : matches.length > PICK_LIMIT ? `Showing ${PICK_LIMIT} of ${matches.length.toLocaleString()}. Narrow the search to see the rest.`
    : null

  return (
    <>
      <FilterPanel>
        <SubDepartmentChips subs={subs} active={sub.slug} tab="costing" />
      </FilterPanel>

      <div className={c.fig}>
        <div className={c.figText}>
          <span className={c.figEye}>{sub.name.toUpperCase()} · COST RATIO</span>
          <div className={c.figLine}>
            {editing ? (
              <input
                className={c.figInput}
                value={divisorDraft ?? formatRatio(divisor)}
                onChange={e => {
                  setDivisorDraft(e.target.value)
                  setNotice(null)
                }}
                disabled={saving}
                inputMode="decimal"
                aria-label={`${sub.name} cost ratio`}
              />
            ) : (
              <span className={c.figBig}>{formatRatio(divisor)}</span>
            )}
            <span className={c.figAfter}>divides every SKU&rsquo;s cost</span>
          </div>
          <span className={c.figSub}>
            The Revenue Team&rsquo;s cost is the Product List cost divided by this ratio. Every margin in the calculator, the month and the run is judged against it. SKUs below divide by a ratio of their own.
          </span>
        </div>
        <div className={c.figSide}>
          <div className={c.figExample}>
            <div className={c.figExampleCell}><span className={c.figExampleLabel}>Product List cost</span><span className={c.figExampleValue}>{formatMoney(1000)}</span></div>
            <span className={c.figExampleOp}>÷ {formatRatio(shownDivisor)} =</span>
            <div className={c.figExampleCell}><span className={c.figExampleLabel}>Revenue Team cost</span><span className={c.figExampleResult}>{formatMoney(teamCost(1000, shownDivisor))}</span></div>
          </div>
        </div>
      </div>

      <KivCostsSection costs={kivCosts} divisor={shownDivisor} onDraft={setKivDraft} />

      <Heading title="SKUs at their own ratio" sub={plural(ratios.length, 'SKU')} />
      <ActionRow>
        {editing ? (
          <EditingButtons cancelLabel="Cancel changes" onCancel={cancel} onSave={save} changes={dirty} saving={saving} pending={pending}
            saveLabel={pending ? 'Saving…' : settling ? 'Saved' : dirty === 0 ? 'Save changes' : `Save ${plural(dirty, 'change')}`} />
        ) : (
          <EditButton label="Edit ratios" onClick={() => { setEditing(true); setNotice(null) }} />
        )}
      </ActionRow>
      {editing && renamedCount > 0 ? (
        <Note>{plural(renamedCount, 'SKU')} {renamedCount === 1 ? 'was' : 'were'} renamed in the ERP; saving follows {renamedCount === 1 ? 'it' : 'them'} to the new code.</Note>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      {editing ? (
        <div className={c.picker} role="group" aria-label="Add SKUs">
          <div className={c.pickerHead}>
            <span className={c.pickerTitle}>ADD SKUS AT A RATIO OF THEIR OWN</span>
          </div>
          <div className={c.pickerControls}>
            <label className={c.pickerSearch}>
              <SearchIcon />
              <input type="search" className={c.searchInput} value={query} disabled={saving} onChange={e => setQuery(e.target.value)}
                placeholder="Search SKU code, description or model…" aria-label="Find a SKU" />
            </label>
            <label className={c.pickerAmount}>
              <span className={c.selectLabel}>Ratio</span>
              <input className={c.pickerAmountInput} value={pickRatio} onChange={e => setPickRatio(e.target.value)} disabled={saving}
                inputMode="decimal" placeholder="0.60" aria-label="Ratio for the ticked SKUs" />
            </label>
            <button type="button" className={c.pickerAdd} disabled={saving} data-idle={(tickedHere.length === 0 || !pickOk) || undefined} onClick={addTicked}>
              {tickedHere.length ? `Add ${tickedHere.length} at ${pickOk ? pickRatio.trim() : '…'}` : 'Tick SKUs to add'}
            </button>
          </div>
          {msg ? <p className={c.pickerMsg}>{msg}</p> : null}
          {shown.length > 0 ? (
            <ul className={c.results}>
              {shown.map(s => {
                const listed = onList.has(s.erpId)
                const on = ticked.has(s.erpId)
                return (
                  <li key={s.erpId} className={c.result}>
                    {!listed ? (
                      <button type="button" role="checkbox" aria-checked={on} aria-label={`Tick ${s.code}`} className={c.resultTick} data-on={on || undefined}
                        disabled={saving} onClick={() => toggle(s.erpId)}>
                        <TickIcon size={12} />
                      </button>
                    ) : null}
                    <span className={c.resultCode}>{s.code}</span>
                    <span className={c.resultDesc}>{s.description ?? '—'}</span>
                    {listed ? <span className={c.pill}>On the list</span> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={c.tableCard} data-page="">
        <PageScrolledTable label="SKUs with their own cost ratio">
          <table className={c.table}>
            <thead>
              <tr>
                <th scope="col" className={c.th} data-first="" style={{ minWidth: 170 }}>SKU CODE</th>
                <th scope="col" className={c.th} style={{ minWidth: 230 }}>DESCRIPTION</th>
                <th scope="col" className={c.th} style={{ minWidth: 100 }}>CATEGORY</th>
                <th scope="col" className={c.th} data-num="" style={{ minWidth: 150 }}>PRODUCT LIST COST</th>
                <th scope="col" className={c.th} data-num="" style={{ minWidth: 110 }}>RATIO</th>
                <th scope="col" className={c.th} data-num="" style={{ minWidth: 160 }}>TEAM COST</th>
                {editing ? <th scope="col" className={c.th} data-num="" style={{ minWidth: 110 }}><span className="sr-only">Remove</span>{' '}</th> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const text = drafts.get(l.erpId)
                const isNew = l.saved === null
                const going = !isNew && text !== undefined && text.trim() === ''
                const cost = costOf(l.sku)
                const judged = ratioOf(l) ?? shownDivisor
                return (
                  <tr key={l.erpId} className={c.row} data-stripe={(!isNew && i % 2 === 1) || undefined} data-new={isNew || undefined} data-removing={going || undefined}>
                    <td className={c.td} data-first="">
                      {codeOf(l)}
                      {isNew ? <CellChip tone="new">NEW</CellChip> : going ? <CellChip tone="removing">REMOVING</CellChip> : null}
                      {l.sku ? <MirrorFlags isNew={false} active={l.sku.active} removed={l.sku.removed} /> : null}
                      {renamed(l) ? <div className={c.sub}>Now {l.sku?.code} in the ERP</div> : null}
                    </td>
                    <td className={`${c.td} ${going ? c.struck : ''}`}>{l.sku?.description ?? '—'}</td>
                    <td className={c.td}>{categoryLabel(l.sku?.category ?? null)}</td>
                    <td className={c.td} data-num="">{cost ? rangeLabel(cost) : <span className={c.faint}>No price</span>}</td>
                    <td className={`${c.td} ${editing && !going ? c.inputCell : c.bold}`} data-num="">
                      {editing && !going ? (
                        <CellInput value={text ?? (l.saved ? formatRatio(l.saved.ratio) : '')} onChange={v => setDraft(l.erpId, v)}
                          edited={text !== undefined && (isNew || differs(text, l.saved!.ratio))} width={84} disabled={saving}
                          placeholder={formatRatio(shownDivisor)} label={`${codeOf(l)} ratio`} />
                      ) : l.saved ? formatRatio(l.saved.ratio) : '—'}
                    </td>
                    <td className={`${c.td} ${c.bold} ${c.accent}`} data-num="">{cost ? rangeLabel(cost, judged) : '—'}</td>
                    {editing ? (
                      <td className={c.td} data-num="">
                        {isNew ? (
                          <button type="button" className={c.cellLink} data-tone="danger" disabled={saving}
                            onClick={() => { setAdded(previous => previous.filter(id => id !== l.erpId)); dropDraft(l.erpId) }}>Take off</button>
                        ) : going ? (
                          <button type="button" className={c.cellLink} disabled={saving} onClick={() => dropDraft(l.erpId)}>Keep</button>
                        ) : (
                          <button type="button" className={c.cellLink} data-tone="danger" disabled={saving} onClick={() => setDraft(l.erpId, '')}>Remove</button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr><td colSpan={editing ? 7 : 6} className={c.empty}>Every {sub.name} SKU divides by {formatRatio(divisor)}.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PageScrolledTable>
        <TableFoot shown={`${plural(lines.length, 'SKU')} · every other SKU divides by ${formatRatio(shownDivisor)}`} />
      </div>
    </>
  )
}
