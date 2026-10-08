'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { validateOptionPrices } from '@/lib/catalogue/edits'
import { MAINTENANCE_SECTIONS } from '@/lib/catalogue/options'
import { saveOptionPrices } from '../actions'
import type { FabricRow, MaintenanceOption } from '../load'
import PageScrolledTable from './PageScrolledTable'
import { useProductDraftGuard } from './ProductWorkspace'
import {
  ActionRow, CellChip, CellInput, Chip, ChipRow, Controls, EditButton, EditingButtons, FilterPanel, Heading, money,
  Notice, Note, plural, SearchField, SelectField, SubChipRow, TableFoot,
} from './ui'
import c from './products.module.css'

const FABRICS = 'fabrics'
const PAGE_SIZE = 300
type Drafts = Map<string, Map<string, string>>
type Prices = Map<string, Map<string, number | null>>

const TIER_OPTIONS = [['', 'All tiers'], ['PRICE_1', 'P1'], ['PRICE_2', 'P2'], ['PRICE_3', 'P3'], ['unassigned', 'Unassigned category']] as const

/**
 * The pools whose blank price means FOC — a height or a leg is always offered,
 * free unless it is charged. A special charged nothing is not offered at all
 * (MAINTENANCE_SECTIONS' notes), so a blank there is just blank.
 */
const FOC_POOLS = new Set(['bedframe_divan_heights', 'bedframe_total_heights', 'bedframe_gaps', 'bedframe_leg_heights', 'sofa_leg_heights'])

/** ERP option values and fabric mappings stay read-only; only the portal's prices — what the customer is charged for an option — are editable. */
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
  const dirtyPools = [...drafts.values()].filter(values => values.size > 0).length
  useProductDraftGuard(dirty, saving)
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
        setNotice(`${plural(saved, 'price')} saved.`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the prices.')
        if (saved > 0) setNotice(`${plural(saved, 'price')} saved. Remaining changes are kept for retry.`)
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

  const note = fabricView
    ? 'Sofa and Bedframe mappings override the shared ERP tier independently. With neither mapping nor shared tier, P2 is used.'
    : (meta?.note ?? 'ERP choices only; model availability is set on Modular.')
      + (editing && dirty > 0 ? ` ${plural(dirty, 'unsaved change')} across ${plural(dirtyPools, 'pool')}; Save includes them all.` : '')

  return (
    <>
      <FilterPanel>
        <ChipRow ariaLabel="Maintenance sections">
          {MAINTENANCE_SECTIONS.map(group => (
            <Chip key={group.section} on={section?.section === group.section} disabled={saving} onClick={() => pick(group.pools[0].pool)}>{group.section}</Chip>
          ))}
          <Chip on={fabricView} disabled={saving} onClick={() => pick(FABRICS)}>Fabrics</Chip>
        </ChipRow>
        {section ? (
          <SubChipRow ariaLabel={`${section.section} option pools`}>
            {section.pools.map(item => (
              <Chip key={item.pool} small on={pool === item.pool} disabled={saving} count={drafts.get(item.pool)?.size || undefined} onClick={() => pick(item.pool)}>
                {item.label}
              </Chip>
            ))}
          </SubChipRow>
        ) : null}
        {/* No search on an option pool: the largest holds about twenty values,
            and the ERP's own Maintenance lists have none (user 2026-09-27).
            The fabrics run to the hundreds and keep theirs, as the ERP's
            Fabrics panel does. */}
        {fabricView ? (
          <Controls ruled>
            <SearchField value={query} disabled={saving} onChange={v => { setQuery(v); setLimit(PAGE_SIZE) }}
              placeholder="Search fabric code, series or description…" label="Search fabrics" />
            <SelectField label="Sofa tier" value={sofaTier} disabled={saving} onChange={v => { setSofaTier(v); setLimit(PAGE_SIZE) }} options={TIER_OPTIONS} />
            <SelectField label="Bedframe tier" value={bedframeTier} disabled={saving} onChange={v => { setBedframeTier(v); setLimit(PAGE_SIZE) }} options={TIER_OPTIONS} />
            <SelectField label="Catalogue" value={showRemoved ? 'all' : 'cur'} disabled={saving} onChange={v => { setShowRemoved(v === 'all'); setLimit(PAGE_SIZE) }}
              options={[['cur', 'Current records'], ['all', 'Include removed']]} />
          </Controls>
        ) : null}
      </FilterPanel>

      <Heading
        title={fabricView ? 'Fabrics' : `${section?.section} · ${meta?.label}`}
        sub={fabricView ? `${shownFabrics.length.toLocaleString()} of ${liveFabrics.length.toLocaleString()} fabrics` : plural(rows.length, 'option')}
        readOnly={!fabricView && !meta?.priced}
      />

      <ActionRow>
        {editing ? (
          <EditingButtons cancelLabel="Cancel changes" onCancel={cancel} onSave={save} changes={dirty} saving={saving}
            saveLabel={dirty === 0 ? 'Save changes' : `Save ${plural(dirty, 'price')}`} />
        ) : meta?.priced && !fabricView ? (
          <EditButton label={meta.charge ? 'Edit charges' : 'Edit surcharges'} onClick={() => { setEditing(true); setNotice(null) }} />
        ) : null}
      </ActionRow>
      <Note>{note}</Note>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      <div className={c.tableCard} data-page="">
        <PageScrolledTable label={fabricView ? 'Fabric mappings table' : 'Maintenance options table'}>
          {fabricView ? (
            <table className={c.table}>
              <thead><tr>
                <th scope="col" className={c.th} data-first="" style={{ minWidth: 130 }}>FABRIC CODE</th>
                <th scope="col" className={c.th} style={{ minWidth: 240 }}>DESCRIPTION</th>
                <th scope="col" className={c.th} style={{ minWidth: 100 }}>SERIES</th>
                <th scope="col" className={c.th} style={{ minWidth: 110 }}>CATEGORY</th>
                <th scope="col" className={c.th} style={{ minWidth: 120 }}>SOFA TIER</th>
                <th scope="col" className={c.th} style={{ minWidth: 130 }}>BEDFRAME TIER</th>
                <th scope="col" className={c.th} style={{ minWidth: 90 }}>STATUS</th>
              </tr></thead>
              <tbody>
                {shownFabrics.slice(0, limit).map((f, i) => (
                  <tr key={f.erpId} className={c.row} data-stripe={i % 2 === 1 || undefined} data-dim={f.removed || undefined}>
                    <td className={c.td} data-first="">{f.code}</td>
                    <td className={c.td}>{f.description ?? '—'}</td>
                    <td className={c.td}>{f.series ?? '—'}</td>
                    <td className={c.td}>{f.category ?? '—'}</td>
                    <td className={c.td}>{tierText(f.sofaTier, f.priceTier)}</td>
                    <td className={c.td}>{tierText(f.bedframeTier, f.priceTier)}</td>
                    <td className={c.td}>{statusLabel(f)}</td>
                  </tr>
                ))}
                {count === 0 ? <tr><td colSpan={7} className={c.empty}>No fabrics match these filters.</td></tr> : null}
              </tbody>
            </table>
          ) : (
            <table className={c.table}>
              <thead><tr>
                <th scope="col" className={c.th} data-first="" style={{ minWidth: 150 }}>OPTION VALUE</th>
                <th scope="col" className={c.th} style={{ minWidth: 260 }}>DESCRIPTION</th>
                {meta?.priced ? <th scope="col" className={c.th} data-num="" style={{ minWidth: 150 }}>{meta.charge ? 'CHARGE (RM)' : 'SURCHARGE (RM)'}</th> : null}
                <th scope="col" className={c.th} style={{ minWidth: 120 }}>STATUS</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, limit).map((o, i) => {
                  const price = optionPrice(o)
                  const draft = drafts.get(pool)?.get(o.value)
                  return (
                    <tr key={o.value} className={c.row} data-stripe={i % 2 === 1 || undefined} data-dim={!o.active || undefined}>
                      <td className={c.td} data-first="">{o.value}</td>
                      <td className={c.td}>{o.label}</td>
                      {meta?.priced ? (
                        <td className={`${c.td} ${editing ? c.inputCell : ''}`} data-num="">
                          {editing ? (
                            <CellInput value={draft ?? (price === null ? '' : String(price))} onChange={v => touch(o.value, v)} edited={draft !== undefined}
                              disabled={saving} label={`${o.label} charge`} />
                          ) : price === null ? (
                            <span className={`${c.muted} ${c.strong}`} title={FOC_POOLS.has(pool) ? 'No charge keyed — FOC' : 'No charge keyed — not offered on the Quote'}>{FOC_POOLS.has(pool) ? 'FOC' : '—'}</span>
                          ) : <span className={c.strong}>{money(price)}</span>}
                        </td>
                      ) : null}
                      <td className={c.td}>{statusLabel(o)}{o.isNew ? <CellChip>NEW</CellChip> : null}</td>
                    </tr>
                  )
                })}
                {count === 0 ? <tr><td colSpan={meta?.priced ? 4 : 3} className={c.empty}>No options match these filters.</td></tr> : null}
              </tbody>
            </table>
          )}
        </PageScrolledTable>
        <TableFoot
          shown={`${visibleCount.toLocaleString()} of ${count.toLocaleString()} ${fabricView ? 'fabrics' : 'options'} shown`}
          more={visibleCount < count ? `Show ${Math.min(PAGE_SIZE, count - visibleCount)} more` : undefined}
          onMore={() => setLimit(value => value + PAGE_SIZE)}
        />
      </div>
    </>
  )
}

function statusLabel(row: { active: boolean; removed: boolean }) {
  return row.removed ? 'Removed' : row.active ? 'Active' : 'Inactive'
}

/** A fabric's tier: its own (P2), else the shared ERP tier (P2 · shared), else P2 · default. */
function tierText(tier: string | null, shared: string | null) {
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
