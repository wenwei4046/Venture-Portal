'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  BY_QUANTITY_POOL, FABRIC_UPGRADE_CATEGORIES, validateFabricUpgrades, validateOptionPrices, type FabricUpgradeCategory, type FabricUpgradesEdit,
} from '@/lib/catalogue/edits'
import { MAINTENANCE_SECTIONS } from '@/lib/catalogue/options'
import { saveFabricUpgrades, saveOptionPrices } from '../actions'
import type { FabricRow, FabricUpgradeRow, MaintenanceOption } from '../load'
import { EMPTY_UPGRADES_DRAFT, seriesOptions, upgradesChanges, upgradesEditOf, upgradesOf, type UpgradesDraft } from './fabric-upgrades'
import FabricUpgradesTable from './FabricUpgradesTable'
import PageScrolledTable from './PageScrolledTable'
import { useProductDraftGuard } from './ProductWorkspace'
import {
  ActionRow, CellChip, CellInput, CellSelect, Chip, ChipRow, Controls, EditButton, EditingButtons, FilterPanel, Heading, money,
  Notice, Note, plural, SearchField, SelectField, SubChipRow, TableFoot,
} from './ui'
import c from './products.module.css'

const FABRICS = 'fabrics'
/** Fabrics › Sofa / Bedframe upgrades (2026-10-29): a fabric series' charge, made here. */
const UPGRADE_POOLS: Readonly<Record<string, FabricUpgradeCategory>> = { fabric_upgrades_sofa: 'SOFA', fabric_upgrades_bedframe: 'BEDFRAME' }
const UPGRADE_TABS = [['fabric_upgrades_sofa', 'Sofa upgrades'], ['fabric_upgrades_bedframe', 'Bedframe upgrades']] as const
const PAGE_SIZE = 300
/** An option's unsaved change: its price as typed, and — a sofa special's — how it is charged. */
type Draft = { price?: string; byQuantity?: boolean }
type Drafts = Map<string, Map<string, Draft>>
type Prices = Map<string, Map<string, { price: number | null; byQuantity: boolean }>>
const CHARGED_OPTIONS = [['set', 'Full set'], ['qty', 'By quantity']] as const

const TIER_OPTIONS = [['', 'All tiers'], ['PRICE_1', 'P1'], ['PRICE_2', 'P2'], ['PRICE_3', 'P3'], ['unassigned', 'Unassigned category']] as const

/**
 * The pools whose blank price means FOC — a height or a leg is always offered,
 * free unless it is charged. A special charged nothing is not offered at all
 * (MAINTENANCE_SECTIONS' notes), so a blank there is just blank.
 */
const FOC_POOLS = new Set(['bedframe_divan_heights', 'bedframe_total_heights', 'bedframe_gaps', 'bedframe_leg_heights', 'sofa_leg_heights'])

/** ERP option values and fabric mappings stay read-only; only the portal's prices — what the customer is charged for an option — are editable. */
export default function MaintenanceTab({ options, fabrics, upgrades = [] }: {
  options: MaintenanceOption[]
  fabrics: FabricRow[]
  upgrades?: FabricUpgradeRow[]
}) {
  const router = useRouter()
  const [pool, setPool] = useState('bedframe_divan_heights')
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Drafts>(new Map())
  const [upgradeDrafts, setUpgradeDrafts] = useState<ReadonlyMap<FabricUpgradeCategory, UpgradesDraft>>(new Map())
  // A category saved: the rows the page had then. Its draft is what is saved until fresh rows arrive.
  const [settled, setSettled] = useState<ReadonlyMap<FabricUpgradeCategory, FabricUpgradeRow[]>>(new Map())
  const newUpgradeKey = useRef(0)
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
  const upgradeCategory: FabricUpgradeCategory | undefined = UPGRADE_POOLS[pool]
  const section = MAINTENANCE_SECTIONS.find(s => s.pools.some(p => p.pool === pool))
  const meta = section?.pools.find(p => p.pool === pool)
  const upgradeRows = useMemo(() => new Map(FABRIC_UPGRADE_CATEGORIES.map(cat => [cat, upgradesOf(upgrades, cat)])), [upgrades])
  const seriesList = useMemo(() => seriesOptions(fabrics), [fabrics])
  // Fresh rows arrived: what a category saved is in them now, and its draft goes.
  const stale = [...settled].filter(([, source]) => source !== upgrades).map(([cat]) => cat)
  if (stale.length > 0) {
    setSettled(previous => new Map([...previous].filter(([cat]) => !stale.includes(cat))))
    setUpgradeDrafts(previous => new Map([...previous].filter(([cat]) => !stale.includes(cat))))
  }
  const upgradeDraftOf = (cat: FabricUpgradeCategory) => upgradeDrafts.get(cat) ?? EMPTY_UPGRADES_DRAFT
  const upgradeChanges = (cat: FabricUpgradeCategory) => (settled.has(cat) ? 0 : upgradesChanges(upgradeRows.get(cat) ?? [], upgradeDraftOf(cat)))
  const dirty = [...drafts.values()].reduce((sum, values) => sum + values.size, 0)
    + FABRIC_UPGRADE_CATEGORIES.reduce((sum, cat) => sum + upgradeChanges(cat), 0)
  const dirtyPools = [...drafts.values()].filter(values => values.size > 0).length
    + FABRIC_UPGRADE_CATEGORIES.filter(cat => upgradeChanges(cat) > 0).length
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

  function touch(value: string, change: Draft) {
    if (saveInFlight.current) return
    setDrafts(previous => {
      const next = new Map(previous)
      const values = new Map(next.get(pool))
      values.set(value, { ...values.get(value), ...change })
      next.set(pool, values)
      return next
    })
    setNotice(null)
  }

  function touchUpgrades(cat: FabricUpgradeCategory, next: UpgradesDraft) {
    if (saveInFlight.current) return
    setUpgradeDrafts(previous => new Map(previous).set(cat, next))
    setNotice(null)
  }

  function cancel() {
    if (saveInFlight.current) return
    setDrafts(new Map())
    setUpgradeDrafts(new Map())
    setEditing(false)
    setError(null)
  }

  function save() {
    if (saveInFlight.current || dirty === 0) return
    // Validate the entire batch first, before any pool can be written.
    let pending: Array<{ pool: string; edits: Array<{ value: string; price: string; byQuantity?: boolean }>; prices: Map<string, { price: number | null; byQuantity: boolean }> }>
    let upgradeBatches: Array<{ category: FabricUpgradeCategory; edit: FabricUpgradesEdit; changes: number }>
    try {
      pending = [...drafts].map(([poolKey, values]) => {
        // An option sent whole: a price typed keeps how it is charged, a choice of how keeps its price.
        const edits = [...values].map(([value, d]) => {
          const held = options.find(o => o.pool === poolKey && o.value === value)
          const was = held ? optionPrice(held) : { price: null, byQuantity: false }
          return {
            value,
            price: d.price ?? (was.price === null ? '' : String(was.price)),
            ...(poolKey === BY_QUANTITY_POOL ? { byQuantity: d.byQuantity ?? was.byQuantity } : {}),
          }
        })
        const validated = validateOptionPrices(poolKey, edits)
        const prices = new Map<string, { price: number | null; byQuantity: boolean }>(
          validated.upserts.map(row => [row.value, { price: row.price, byQuantity: row.by_quantity === true }]))
        for (const value of validated.clears) prices.set(value, { price: null, byQuantity: false })
        return { pool: poolKey, edits, prices }
      })
      // And each category's upgrades: only what changed.
      upgradeBatches = FABRIC_UPGRADE_CATEGORIES.flatMap(category => {
        const changes = upgradeChanges(category)
        if (changes === 0) return []
        const edit = upgradesEditOf(upgradeRows.get(category) ?? [], upgradeDraftOf(category))
        validateFabricUpgrades(category, edit)
        return [{ category, edit, changes }]
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the amounts.')
      return
    }
    const rowsAtSave = upgrades
    saveInFlight.current = true
    setError(null)
    setNotice(null)
    startSaving(async () => {
      let saved = 0
      try {
        for (const batch of upgradeBatches) {
          const result = await saveFabricUpgrades(batch.category, batch.edit)
          if (!result.ok) throw new Error(result.reason)
          saved += batch.changes
          setSettled(previous => new Map(previous).set(batch.category, rowsAtSave))
        }
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
        setNotice(`${plural(saved, 'change')} saved.`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the prices.')
        if (saved > 0) setNotice(`${plural(saved, 'change')} saved. Remaining changes are kept for retry.`)
      } finally {
        saveInFlight.current = false
        if (saved > 0) router.refresh()
      }
    })
  }

  /** The option's price and how it is charged — a confirmed save's while the refresh catches up. */
  function optionPrice(option: MaintenanceOption): { price: number | null; byQuantity: boolean } {
    const confirmed = savedPrices.source === options ? savedPrices.values.get(option.pool) : undefined
    return confirmed?.get(option.value) ?? { price: option.price, byQuantity: option.byQuantity }
  }
  const counted = pool === BY_QUANTITY_POOL

  const unsaved = editing && dirty > 0 ? `${plural(dirty, 'unsaved change')} across ${plural(dirtyPools, 'pool')}; Save includes them all.` : ''
  const note = fabricView
    ? 'Sofa and Bedframe mappings override the shared ERP tier independently. With neither mapping nor shared tier, P2 is used.'
    : upgradeCategory
      ? unsaved
      : `${meta?.note ?? 'ERP choices only; model availability is set on Modular.'}${unsaved ? ` ${unsaved}` : ''}`
  const upgradeCount = upgradeCategory ? (upgradeRows.get(upgradeCategory)?.length ?? 0) : 0

  return (
    <>
      <FilterPanel>
        <ChipRow ariaLabel="Maintenance sections">
          {MAINTENANCE_SECTIONS.map(group => (
            <Chip key={group.section} on={section?.section === group.section} disabled={saving} onClick={() => pick(group.pools[0].pool)}>{group.section}</Chip>
          ))}
          <Chip on={fabricView || upgradeCategory !== undefined} disabled={saving} onClick={() => pick(FABRICS)}>Fabrics</Chip>
        </ChipRow>
        {section ? (
          <SubChipRow ariaLabel={`${section.section} option pools`}>
            {section.pools.map(item => (
              <Chip key={item.pool} small on={pool === item.pool} disabled={saving} count={drafts.get(item.pool)?.size || undefined} onClick={() => pick(item.pool)}>
                {item.label}
              </Chip>
            ))}
          </SubChipRow>
        ) : (
          <SubChipRow ariaLabel="Fabrics lists">
            <Chip small on={fabricView} disabled={saving} onClick={() => pick(FABRICS)}>All fabrics</Chip>
            {UPGRADE_TABS.map(([key, label]) => (
              <Chip key={key} small on={pool === key} disabled={saving} count={upgradeChanges(UPGRADE_POOLS[key]) || undefined} onClick={() => pick(key)}>
                {label}
              </Chip>
            ))}
          </SubChipRow>
        )}
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
        title={fabricView ? 'Fabrics' : upgradeCategory ? `Fabrics · ${upgradeCategory === 'SOFA' ? 'Sofa' : 'Bedframe'} upgrades` : `${section?.section} · ${meta?.label}`}
        sub={fabricView
          ? `${shownFabrics.length.toLocaleString()} of ${liveFabrics.length.toLocaleString()} fabrics`
          : upgradeCategory
            ? `${plural(upgradeCount, 'upgrade')} · ${upgradeCategory === 'SOFA' ? 'once per sofa' : 'per bed frame'}`
            : plural(rows.length, 'option')}
        readOnly={!fabricView && !upgradeCategory && !meta?.priced}
      />

      <ActionRow>
        {editing ? (
          <EditingButtons cancelLabel="Cancel changes" onCancel={cancel} onSave={save} changes={dirty} saving={saving}
            saveLabel={dirty === 0 ? 'Save changes' : `Save ${plural(dirty, 'change')}`} />
        ) : upgradeCategory ? (
          <EditButton label="Edit upgrades" onClick={() => { setEditing(true); setNotice(null) }} />
        ) : meta?.priced && !fabricView ? (
          <EditButton label={meta.charge ? 'Edit charges' : 'Edit surcharges'} onClick={() => { setEditing(true); setNotice(null) }} />
        ) : null}
      </ActionRow>
      {note ? <Note>{note}</Note> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      <div className={c.tableCard} data-page="">
        <PageScrolledTable label={fabricView ? 'Fabric mappings table' : upgradeCategory ? 'Fabric upgrades table' : 'Maintenance options table'}>
          {upgradeCategory ? (
            <FabricUpgradesTable upgrades={upgradeRows.get(upgradeCategory) ?? []} draft={upgradeDraftOf(upgradeCategory)}
              onDraft={next => touchUpgrades(upgradeCategory, next)} editing={editing && !settled.has(upgradeCategory)} saving={saving}
              options={seriesList} newKey={() => `new-${++newUpgradeKey.current}`} />
          ) : fabricView ? (
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
                {/* A sofa special's charge: once per sofa, or each times the Quote's quantity (2026-10-26). */}
                {counted ? <th scope="col" className={c.th} style={{ minWidth: 150 }}>CHARGED</th> : null}
                <th scope="col" className={c.th} style={{ minWidth: 120 }}>STATUS</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, limit).map((o, i) => {
                  const { price, byQuantity } = optionPrice(o)
                  const draft = drafts.get(pool)?.get(o.value)
                  const typed = draft?.price ?? (price === null ? '' : String(price))
                  const mode = draft?.byQuantity ?? byQuantity
                  return (
                    <tr key={o.value} className={c.row} data-stripe={i % 2 === 1 || undefined} data-dim={!o.active || undefined}>
                      <td className={c.td} data-first="">{o.value}</td>
                      <td className={c.td}>{o.label}</td>
                      {meta?.priced ? (
                        <td className={`${c.td} ${editing ? c.inputCell : ''}`} data-num="">
                          {editing ? (
                            <CellInput value={typed} onChange={v => touch(o.value, { price: v })} edited={draft?.price !== undefined}
                              disabled={saving} label={`${o.label} charge`} />
                          ) : price === null ? (
                            <span className={`${c.muted} ${c.strong}`} title={FOC_POOLS.has(pool) ? 'No charge keyed — FOC' : 'No charge keyed — not offered on the Quote'}>{FOC_POOLS.has(pool) ? 'FOC' : '—'}</span>
                          ) : <span className={c.strong}>{money(price)}</span>}
                        </td>
                      ) : null}
                      {counted ? (
                        <td className={`${c.td} ${editing ? c.inputCell : ''}`}>
                          {editing ? (
                            // How it is charged needs a charge to go with: no price, nothing to choose.
                            <CellSelect value={mode ? 'qty' : 'set'} options={CHARGED_OPTIONS} onChange={v => touch(o.value, { byQuantity: v === 'qty' })}
                              edited={draft?.byQuantity !== undefined} disabled={saving || typed.trim() === ''} label={`${o.label} charged`} />
                          ) : price === null ? <span className={c.muted}>—</span> : mode ? 'By quantity' : 'Full set'}
                        </td>
                      ) : null}
                      <td className={c.td}>{statusLabel(o)}{o.isNew ? <CellChip>NEW</CellChip> : null}</td>
                    </tr>
                  )
                })}
                {count === 0 ? <tr><td colSpan={(meta?.priced ? 4 : 3) + (counted ? 1 : 0)} className={c.empty}>No options match these filters.</td></tr> : null}
              </tbody>
            </table>
          )}
        </PageScrolledTable>
        {upgradeCategory ? (
          <TableFoot shown={`${plural(upgradeCount, 'upgrade')} shown`} />
        ) : (
          <TableFoot
            shown={`${visibleCount.toLocaleString()} of ${count.toLocaleString()} ${fabricView ? 'fabrics' : 'options'} shown`}
            more={visibleCount < count ? `Show ${Math.min(PAGE_SIZE, count - visibleCount)} more` : undefined}
            onMore={() => setLimit(value => value + PAGE_SIZE)}
          />
        )}
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
