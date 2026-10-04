'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { validateOptionPrices } from '@/lib/catalogue/edits'
import { MAINTENANCE_SECTIONS } from '@/lib/catalogue/options'
import { saveOptionPrices } from '../../catalogue-actions'
import type { FabricRow, MaintenanceOption } from '../load'
import PageScrolledTable from './PageScrolledTable'
import { useProductDraftGuard } from './ProductWorkspace'

const FABRICS = 'fabrics'
const PAGE_SIZE = 300
type Drafts = Map<string, Map<string, string>>
type Prices = Map<string, Map<string, number | null>>

/** ERP option values and fabric mappings stay read-only; only the portal's prices — a surcharge, or a bed frame option's charge — are editable. */
export default function MaintenanceTab({ options, fabrics }: { options: MaintenanceOption[]; fabrics: FabricRow[] }) {
  const router = useRouter()
  const [pool, setPool] = useState('bedframe_divan_heights')
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Drafts>(new Map())
  // Confirmed saves remain visible while the server refresh catches up, including partial saves.
  const [savedPrices, setSavedPrices] = useState<{ source: MaintenanceOption[]; values: Prices }>({ source: options, values: new Map() })
  const [saving, startSaving] = useTransition()
  const saveInFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const [sofaTier, setSofaTier] = useState('')
  const [bedframeTier, setBedframeTier] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const fabricView = pool === FABRICS
  const section = MAINTENANCE_SECTIONS.find(s => s.pools.some(p => p.pool === pool))
  const meta = section?.pools.find(p => p.pool === pool)
  const dirty = [...drafts.values()].reduce((sum, values) => sum + values.size, 0)
  const dirtyPools = drafts.size
  useProductDraftGuard(dirty > 0, saving)
  const byPool = useMemo(() => {
    const groups = new Map<string, MaintenanceOption[]>()
    for (const option of options) {
      if (option.removed && !showRemoved) continue
      const list = groups.get(option.pool) ?? []
      list.push(option)
      groups.set(option.pool, list)
    }
    for (const rows of groups.values()) rows.sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value))
    return groups
  }, [options, showRemoved])
  const rows = byPool.get(pool) ?? []
  const liveFabrics = useMemo(() => fabrics.filter(f => showRemoved || !f.removed), [fabrics, showRemoved])
  const search = query.trim().toLowerCase()
  const shownFabrics = useMemo(() => liveFabrics.filter(f =>
    [f.code, f.description, f.series, f.category].some(v => (v ?? '').toLowerCase().includes(search)) &&
    matchesTier(f.sofaTier, f.priceTier, sofaTier) && matchesTier(f.bedframeTier, f.priceTier, bedframeTier),
  ), [liveFabrics, search, sofaTier, bedframeTier])
  const count = fabricView ? shownFabrics.length : rows.length
  const total = fabricView ? liveFabrics.length : rows.length
  const visibleCount = Math.min(limit, count)

  function pick(next: string) {
    if (saveInFlight.current) return
    setPool(next)
    setQuery('')
    setLimit(PAGE_SIZE)
  }

  function touch(value: string, price: string) {
    if (saveInFlight.current) return
    setDrafts(previous => {
      const next = new Map(previous)
      const values = new Map(next.get(pool))
      values.set(value, price)
      next.set(pool, values)
      return next
    })
    setNotice(null)
  }

  function cancel() {
    if (saveInFlight.current) return
    setDrafts(new Map())
    setEditing(false)
    setError(null)
  }

  function save() {
    if (saveInFlight.current || dirty === 0) return
    // Validate the entire batch first, before any pool can be written.
    let pending: Array<{ pool: string; edits: Array<{ value: string; price: string }>; prices: Map<string, number | null> }>
    try {
      pending = [...drafts].map(([poolKey, values]) => {
        const edits = [...values].map(([value, price]) => ({ value, price }))
        const validated = validateOptionPrices(poolKey, edits)
        const prices = new Map<string, number | null>(validated.upserts.map(row => [row.value, row.price]))
        for (const value of validated.clears) prices.set(value, null)
        return { pool: poolKey, edits, prices }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the amounts.')
      return
    }
    saveInFlight.current = true
    setError(null)
    setNotice(null)
    startSaving(async () => {
      let saved = 0
      try {
        for (const batch of pending) {
          const result = await saveOptionPrices(batch.pool, batch.edits)
          saved += result.saved
          setSavedPrices(previous => {
            const next = new Map(previous.source === options ? previous.values : undefined)
            next.set(batch.pool, new Map([...(next.get(batch.pool) ?? []), ...batch.prices]))
            return { source: options, values: next }
          })
          setDrafts(previous => {
            const next = new Map(previous)
            next.delete(batch.pool)
            return next
          })
        }
        setEditing(false)
        setNotice(`${saved} price${saved === 1 ? '' : 's'} saved.`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the prices.')
        if (saved > 0) setNotice(`${saved} price${saved === 1 ? '' : 's'} saved. Remaining changes are kept for retry.`)
      } finally {
        saveInFlight.current = false
        if (saved > 0) router.refresh()
      }
    })
  }

  function optionPrice(option: MaintenanceOption) {
    const confirmed = savedPrices.source === options ? savedPrices.values.get(option.pool) : undefined
    return confirmed?.has(option.value) ? confirmed.get(option.value)! : option.price
  }

  return (
    <section className="sku-master maintenance-workspace" aria-label="Maintenance workspace">
      <div className="sku-filters">
        <div className="sku-categories" role="group" aria-label="Maintenance sections">
          {MAINTENANCE_SECTIONS.map(group => (
            <button key={group.section} type="button" className="sku-chip" aria-pressed={section?.section === group.section}
              disabled={saving} onClick={() => pick(group.pools[0].pool)}>{group.section}</button>
          ))}
          <button type="button" className="sku-chip" aria-pressed={fabricView} disabled={saving} onClick={() => pick(FABRICS)}>Fabrics</button>
        </div>
        {section ? (
          <div className="maintenance-pools" role="group" aria-label={`${section.section} option pools`}>
            {section.pools.map(item => (
              <button key={item.pool} type="button" className="sku-chip" aria-pressed={pool === item.pool} disabled={saving} onClick={() => pick(item.pool)}>
                {item.label}
                {drafts.has(item.pool) ? <span className="maintenance-draft-count" aria-label={`${drafts.get(item.pool)!.size} unsaved changes`}>{drafts.get(item.pool)!.size}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {/* No search on an option pool: the largest holds about twenty values,
            and the ERP's own Maintenance lists have none (user 2026-09-27).
            The fabrics run to the hundreds and keep theirs, as the ERP's
            Fabrics panel does. */}
        {fabricView ? (
          <div className="sku-filter-controls">
            <label className="sku-search">
              <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" />
              </svg>
              <input type="search" value={query} disabled={saving} onChange={e => { setQuery(e.target.value); setLimit(PAGE_SIZE) }}
                placeholder="Search fabric code, series or description…" aria-label="Search fabrics" />
            </label>
            <TierFilter label="Sofa tier" value={sofaTier} disabled={saving} onChange={value => { setSofaTier(value); setLimit(PAGE_SIZE) }} />
            <TierFilter label="Bedframe tier" value={bedframeTier} disabled={saving} onChange={value => { setBedframeTier(value); setLimit(PAGE_SIZE) }} />
          </div>
        ) : null}
      </div>

      <div className="sku-actions">
        <div className="maintenance-pool-heading">
          <h2>{fabricView ? 'Fabrics' : `${section?.section} · ${meta?.label}`}</h2>
          <p className="sku-count" aria-live="polite"><strong>{count.toLocaleString()}</strong> {fabricView ? 'fabrics' : 'options'}{count !== total ? ` of ${total.toLocaleString()}` : ''}
            {!meta?.priced ? <span className="maintenance-readonly">Read only</span> : null}
          </p>
        </div>
        <div className="sku-action-buttons">
          {editing ? <>
            <button type="button" className="sku-secondary-button" disabled={saving} onClick={cancel}>Cancel changes</button>
            <button type="button" className="sku-primary-button" disabled={saving || dirty === 0} onClick={save}>
              {saving ? 'Saving…' : dirty === 0 ? 'Save changes' : `Save ${dirty} price${dirty === 1 ? '' : 's'}`}
            </button>
          </> : meta?.priced ? (
            <button type="button" className="sku-primary-button" onClick={() => { setEditing(true); setNotice(null) }}>{meta.charge ? 'Edit charges' : 'Edit surcharges'}</button>
          ) : null}
        </div>
      </div>
      <p className="sku-edit-note">
        {fabricView ? 'Sofa and Bedframe mappings override the shared ERP tier independently. With neither mapping nor shared tier, P2 is used.' :
          meta?.charge ? 'What the customer pays (RM) when a member picks this option for a bed frame on the Quote — out of the margin on both sides, paid ordinary commission like the rest of the bill, never KPI. Blank or 0 is FOC: the Quote offers FOC plus every option charged here.' :
          meta?.priced ? 'Portal surcharge (RM) added to the cost when this option is chosen. Blank adds nothing; 0 is a zero surcharge.' :
            'ERP choices only. This pool has no surcharge; model availability is set on Modular.'}
        {editing && dirty > 0 ? ` ${dirty} unsaved change${dirty === 1 ? '' : 's'} across ${dirtyPools} pool${dirtyPools === 1 ? '' : 's'}; Save includes them all.` : ''}
      </p>
      {error ? <p className="sku-notice" data-tone="error" role="alert">{error}</p> : null}
      {notice ? <p className="sku-notice" data-tone="ok" role="status">{notice}</p> : null}

      <div className="sku-table-panel">
        <PageScrolledTable label={fabricView ? 'Fabric mappings table' : 'Maintenance options table'}>
          {fabricView ? (
            <table className="ledger-table sku-table">
              <thead><tr>
                <th scope="col" className="sku-code-column">Fabric code</th><th scope="col">Description</th><th scope="col">Series</th>
                <th scope="col">Category</th><th scope="col">Sofa tier</th><th scope="col">Bedframe tier</th><th scope="col">Status</th>
              </tr></thead>
              <tbody>
                {shownFabrics.slice(0, limit).map(f => <tr key={f.erpId}>
                  <td className="sku-code-column">{f.code}</td><td className="sku-description">{f.description ?? '—'}</td>
                  <td>{f.series ?? '—'}</td><td>{f.category ?? '—'}</td><td>{tierLabel(f.sofaTier, f.priceTier)}</td><td>{tierLabel(f.bedframeTier, f.priceTier)}</td>
                  <td className="sku-status">{statusLabel(f)}</td>
                </tr>)}
                {count === 0 ? <tr><td colSpan={7} className="sku-empty">No fabrics match these filters.</td></tr> : null}
              </tbody>
            </table>
          ) : (
            <table className="ledger-table sku-table">
              <thead><tr>
                <th scope="col" className="sku-code-column">Option value</th><th scope="col">Description</th>
                {meta?.priced ? <th scope="col" className="num">{meta.charge ? 'Charge (RM)' : 'Surcharge (RM)'}</th> : null}<th scope="col">Status</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, limit).map(o => {
                  const price = optionPrice(o)
                  return <tr key={o.value}>
                    <td className="sku-code-column">{o.value}</td><td className="sku-description">{o.label}</td>
                    {meta?.priced ? <td className="num">
                      {editing ? <input value={drafts.get(pool)?.get(o.value) ?? (price === null ? '' : String(price))}
                        onChange={e => touch(o.value, e.target.value)} disabled={saving} inputMode="decimal"
                        aria-label={`${o.label} ${meta.charge ? 'charge' : 'surcharge'}`} className="sku-price-input" /> :
                        price === null ? <span title={meta.charge ? 'No charge keyed — FOC' : 'No surcharge keyed — adds nothing'}>—</span> :
                          price < 0 ? `(${formatMoney(Math.abs(price))})` : formatMoney(price)}
                    </td> : null}
                    <td className="sku-status">{statusLabel(o)}{o.isNew ? ' · New' : ''}</td>
                  </tr>
                })}
                {count === 0 ? <tr><td colSpan={meta?.priced ? 4 : 3} className="sku-empty">No options match these filters.</td></tr> : null}
              </tbody>
            </table>
          )}
        </PageScrolledTable>
        <div className="sku-table-footer">
          <span>{visibleCount.toLocaleString()} of {count.toLocaleString()} {fabricView ? 'fabrics' : 'options'} shown</span>
          {visibleCount < count ? <button type="button" className="sku-load-more" disabled={saving} onClick={() => setLimit(value => value + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, count - visibleCount)} more
          </button> : null}
          <label className="sku-catalogue-filter"><span>Catalogue</span>
            <select value={showRemoved ? 'all' : 'current'} disabled={saving} onChange={e => { setShowRemoved(e.target.value === 'all'); setLimit(PAGE_SIZE) }}>
              <option value="current">Current records</option><option value="all">Include removed records</option>
            </select>
          </label>
        </div>
      </div>
    </section>
  )
}

function statusLabel(row: { active: boolean; removed: boolean }) {
  return row.removed ? 'Removed' : row.active ? 'Active' : 'Inactive'
}

function tierLabel(tier: string | null, shared: string | null) {
  const effective = tier ?? shared ?? 'PRICE_2'
  const match = /^PRICE_([123])$/.exec(effective)
  const label = match ? `P${match[1]}` : effective
  return tier ? label : `${label} · ${shared ? 'shared' : 'default'}`
}

function matchesTier(tier: string | null, shared: string | null, filter: string) {
  if (!filter) return true
  if (filter === 'unassigned') return !tier
  return (tier ?? shared ?? 'PRICE_2') === filter
}

function TierFilter({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="sku-model-filter"><span>{label}</span>
    <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      <option value="">All tiers</option><option value="PRICE_1">P1</option><option value="PRICE_2">P2</option>
      <option value="PRICE_3">P3</option><option value="unassigned">Unassigned category</option>
    </select>
  </label>
}
