'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import { parseRatio, teamCost, validateCostSetting, type CostSettingEdit } from '@/lib/catalogue/rule-edits'
import { saveCostSetting } from '../actions'
import type { BrandDivisorRow, CostRatioBrandRow, CostRatioRow, KivCostRow, PickSku, SchemeBrand } from '../load'
import KivCostsSection from './KivCostsSection'
import PageScrolledTable from './PageScrolledTable'
import ProductRowMenu, { type ProductRowMenuAnchor, type ProductRowMenuItem } from './ProductRowMenu'
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

/** The cost as the Revenue Team takes it, over every ratio it may be divided by: the lowest to the highest. */
function rangeLabel(range: CostRange, ratios: number | readonly number[] = 1): string {
  const list = typeof ratios === 'number' ? [ratios] : ratios.length > 0 ? ratios : [1]
  const low = teamCost(range.low, Math.max(...list))
  const high = teamCost(range.high, Math.min(...list))
  return money(low) === money(high) ? money(low) : `${money(low)} – ${money(high)}`
}

function readRatio(text: string): number | null | 'bad' {
  try {
    return parseRatio(text, 'Ratio')
  } catch {
    return 'bad'
  }
}

/** One key per SKU and brand. */
const brandKeyOf = (erpId: string, brand: string) => `${erpId}\u0000${brand}`

// Defaults that keep their identity from one render to the next: a save settles
// when the server's rows CHANGE, and a fresh `[]` every render would look like that.
const NO_KIV: KivCostRow[] = []
const NO_BRAND_RATIOS: CostRatioBrandRow[] = []
const NO_BRANDS: SchemeBrand[] = []
const NO_BRAND_DIVISORS: BrandDivisorRow[] = []

interface Line {
  erpId: string
  /** Its own ratio as saved; null = none of its own (new, or listed for its brands alone). */
  saved: CostRatioRow | null
  sku: PickSku | undefined
  /** On the list already — its own ratio or a ratio by brand saved. False: added this time. */
  listed: boolean
  /** The code a ratio of it was saved under. */
  savedCode: string | null
}

/**
 * Product List › Costing Setting (user 2026-09-27): "这边填的 costing 需要除以
 * 0.7 才会出现在 calculator 的 costing … 部分 SKU 它的除法 rate 不一样，比如
 * 可能是除以 0.6". One sub-department's ratio, and the SKUs divided by a ratio
 * of their own. What it moves is the Revenue Team's cost — the one every
 * margin in the calculator, the month and the run is judged against — never a
 * price on the SKU Master.
 *
 * A RIDER SKU BY BRAND (2026-11-07 — the user: "right click 出来后 spread out，
 * 也就是 by brand 可以有不同的除法 … Trion 我 right click 它，可以设成 0.6"; "在
 * Costing Setting 的 SKU 清单上对 Trion 按 special add … 再按 brand 各填一个除法";
 * "only special set in costing select there, if didnt set, then just follow the
 * defauly rate"): a bed frame or an accessory rides on a bill of any brand and is
 * judged on that brand's ladder, so it may divide by a ratio of its own for each
 * brand. A right-click on its row — or its ⋯ — splits it by brand (*Split by
 * brand*) or puts it back to one ratio (*One ratio for every brand*); the picker
 * adds the ticked SKUs with their brands at once. A brand left blank follows the
 * SKU's own ratio, else the sub-department's; a SKU may be listed for its brands
 * alone.
 *
 * THE SUB-DEPARTMENT'S RATIO BY BRAND (2026-11-14 — the user, of Fair's 0.70:
 * "我要这个 ratio 这边，它是可以能够被 separate by brand 去填的 … 它其实是有 4
 * 个，如果说我调主要的一个的话，这样它就是 override 全部"): under the ratio, a
 * box per brand with a ladder. A brand left blank divides by the main ratio (its
 * placeholder); a figure is that brand's own, for every line of a bill of it
 * whose SKU has no ratio of its own. Typing in the main ratio sends every brand
 * back to it — a brand's own ratio is taken off unless typed again after.
 */
export default function CostSettingTab({
  sub,
  subs,
  schemeId,
  divisor,
  ratios,
  skus,
  kivCosts = NO_KIV,
  byBrand = NO_BRAND_RATIOS,
  brands = NO_BRANDS,
  brandDivisors = NO_BRAND_DIVISORS,
}: {
  sub: SubRef
  subs: SubRef[]
  schemeId: string
  divisor: number
  ratios: CostRatioRow[]
  skus: PickSku[]
  /** KIV bed frames' four costs (2026-10-31) — every sub-department's alike. */
  kivCosts?: KivCostRow[]
  /** The rider SKUs' ratios by brand, as saved (2026-11-07). */
  byBrand?: CostRatioBrandRow[]
  /** The sub-department's brands with a ladder — what a ratio by brand is set for. */
  brands?: SchemeBrand[]
  /** The brands with a ratio of their own, as saved (2026-11-14); one left out divides by `divisor`. */
  brandDivisors?: BrandDivisorRow[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [divisorDraft, setDivisorDraft] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [brandDrafts, setBrandDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  /** The brands' own ratios as typed this time, by brand code; '' = back to the main ratio. */
  const [brandDivisorDrafts, setBrandDivisorDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  /** SKUs split by brand this time, before a brand of theirs has a figure. */
  const [split, setSplit] = useState<ReadonlySet<string>>(new Set())
  const [added, setAdded] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [pickRatio, setPickRatio] = useState('')
  const [pickBrands, setPickBrands] = useState<ReadonlyMap<string, string>>(new Map())
  const [menu, setMenu] = useState<{ erpId: string; anchor: ProductRowMenuAnchor } | null>(null)
  const [pending, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reset = useCallback(() => {
    setDivisorDraft(null)
    setDrafts(new Map())
    setBrandDrafts(new Map())
    setBrandDivisorDrafts(new Map())
    setSplit(new Set())
    setAdded([])
    setTicked(new Set())
    setQuery('')
    setPickRatio('')
    setPickBrands(new Map())
  }, [])

  // A save leaves its drafts on screen, read-only, until the refreshed rows
  // arrive; clearing them at once showed the rows from before the save for a
  // moment (prod, 2026-09-27). Settled when the server's rows change — or,
  // should the refresh never land, a little later.
  const [settling, setSettling] = useState(false)
  const settleFrom = useRef<{ ratios: CostRatioRow[]; divisor: number; byBrand: CostRatioBrandRow[]; brandDivisors: BrandDivisorRow[] } | null>(null)
  const settle = useCallback(() => {
    settleFrom.current = null
    setSettling(false)
    setEditing(false)
    reset()
  }, [reset])
  useEffect(() => {
    const from = settleFrom.current
    if (settling && from && (from.ratios !== ratios || from.divisor !== divisor || from.byBrand !== byBrand
      || from.brandDivisors !== brandDivisors)) settle()
  }, [settling, ratios, divisor, byBrand, brandDivisors, settle])
  useEffect(() => {
    if (!settling) return
    const timer = window.setTimeout(settle, 15_000)
    return () => window.clearTimeout(timer)
  }, [settling, settle])
  const saving = pending || settling

  const byBrandOn = brands.length > 0
  const skuById = useMemo(() => new Map(skus.map(s => [s.erpId, s])), [skus])
  const savedBrand = useMemo(() => new Map(byBrand.map(r => [brandKeyOf(r.erpId, r.brand), r.ratio])), [byBrand])
  const savedBrandDivisor = useMemo(() => new Map(brandDivisors.map(r => [r.brand, r.ratio])), [brandDivisors])
  const lines = useMemo<Line[]>(() => {
    const listed = new Map<string, Line>()
    for (const r of ratios) listed.set(r.erpId, { erpId: r.erpId, saved: r, sku: skuById.get(r.erpId), listed: true, savedCode: r.code })
    for (const r of byBrand) {
      if (!listed.has(r.erpId)) listed.set(r.erpId, { erpId: r.erpId, saved: null, sku: skuById.get(r.erpId), listed: true, savedCode: r.code })
    }
    return [
      // Added this time first, where the picker put them.
      ...added.filter(id => !listed.has(id)).map(id => ({ erpId: id, saved: null, sku: skuById.get(id), listed: false, savedCode: null })),
      ...listed.values(),
    ]
  }, [added, ratios, byBrand, skuById])
  const onList = useMemo(() => new Set(lines.map(l => l.erpId)), [lines])

  const codeOf = (l: Line) => l.savedCode ?? l.sku?.code ?? l.erpId
  // The ERP renamed the SKU: its new bills carry a code the ratio no longer matches.
  const renamed = (l: Line) => l.savedCode !== null && l.sku !== undefined && l.sku.code !== l.savedCode
  const differs = (text: string, saved: number) => {
    const n = readRatio(text)
    return n === null || n === 'bad' || n !== saved
  }
  const riderLine = (l: Line) => byBrandOn && l.sku?.rider === true

  /**
   * What saving sends for a line's own ratio: undefined = nothing; '' = back to
   * the sub-department's. A line added this time always says something — blank
   * is its brands alone, or nothing yet (which Save refuses).
   */
  const changeOf = (l: Line): string | undefined => {
    const text = drafts.get(l.erpId)
    if (!l.listed) return (text ?? '').trim()
    if (l.saved === null) return text !== undefined && text.trim() !== '' ? text.trim() : undefined
    if (text !== undefined && differs(text, l.saved.ratio)) return text.trim()
    if (renamed(l)) return String(l.saved.ratio)
    return undefined
  }
  /** A brand's figure as it stands in the draft: typed, else saved, else blank. */
  const brandTextOf = (erpId: string, brand: string): string => {
    const text = brandDrafts.get(brandKeyOf(erpId, brand))
    if (text !== undefined) return text
    const saved = savedBrand.get(brandKeyOf(erpId, brand))
    return saved === undefined ? '' : formatRatio(saved)
  }
  /** What saving sends for a SKU's brand: undefined = nothing; '' = taken off. */
  const brandChangeOf = (erpId: string, brand: string): string | undefined => {
    const text = brandDrafts.get(brandKeyOf(erpId, brand))
    if (text === undefined) return undefined
    const saved = savedBrand.get(brandKeyOf(erpId, brand))
    if (saved === undefined) return text.trim() === '' ? undefined : text.trim()
    return differs(text, saved) ? text.trim() : undefined
  }
  /** A brand's own ratio as it stands in the draft: typed, else saved, else blank (it divides by the main ratio). */
  const brandDivisorTextOf = (brand: string): string => {
    const text = brandDivisorDrafts.get(brand)
    if (text !== undefined) return text
    const saved = savedBrandDivisor.get(brand)
    return saved === undefined ? '' : formatRatio(saved)
  }
  /** What saving sends for a brand's own ratio: undefined = nothing; '' = taken off. */
  const brandDivisorChangeOf = (brand: string): string | undefined => {
    const text = brandDivisorDrafts.get(brand)
    if (text === undefined) return undefined
    const saved = savedBrandDivisor.get(brand)
    if (saved === undefined) return text.trim() === '' ? undefined : text.trim()
    return differs(text, saved) ? text.trim() : undefined
  }
  /** Split by brand: a brand of it has a figure, or it was split this time. */
  const isSplit = (l: Line): boolean =>
    riderLine(l) && (split.has(l.erpId) || brands.some(b => brandTextOf(l.erpId, b.code).trim() !== ''))
  /** Nothing of it would stay on the list once saved. */
  const goingOf = (l: Line): boolean => {
    if (!l.listed) return false
    const own = drafts.get(l.erpId) ?? (l.saved ? formatRatio(l.saved.ratio) : '')
    return own.trim() === '' && !brands.some(b => brandTextOf(l.erpId, b.code).trim() !== '')
  }

  const divisorChanged = divisorDraft !== null && differs(divisorDraft, divisor)
  const brandChanges = editing
    ? lines.flatMap(l => brands.flatMap(b => (brandChangeOf(l.erpId, b.code) !== undefined ? [{ l, brand: b.code }] : [])))
    : []
  /** Added this time with no ratio of its own but a brand's: its brands are what it changes. */
  const brandsOnly = (l: Line) =>
    !l.listed && changeOf(l) === '' && brandChanges.some(ch => ch.l.erpId === l.erpId && brandChangeOf(l.erpId, ch.brand) !== '')
  const changed = editing ? lines.filter(l => changeOf(l) !== undefined && !brandsOnly(l)) : []
  const brandDivisorChanges = editing ? brands.filter(b => brandDivisorChangeOf(b.code) !== undefined) : []
  const dirty = editing ? (divisorChanged ? 1 : 0) + changed.length + brandChanges.length + brandDivisorChanges.length : 0
  const renamedCount = lines.filter(renamed).length
  // The KIV costs below keep drafts of their own; one guard holds both.
  const [kivDraft, setKivDraft] = useState({ changes: 0, saving: false })
  useProductDraftGuard(dirty + kivDraft.changes, saving || kivDraft.saving)

  const draftDivisor = divisorDraft === null ? divisor : readRatio(divisorDraft)
  const shownDivisor = typeof draftDivisor === 'number' ? draftDivisor : divisor
  /** What a bill of this brand divides a SKU without a ratio of its own by, once saved: the brand's, else the main. */
  const brandDivisorOf = (brand: string): number => {
    const n = readRatio(brandDivisorTextOf(brand))
    return typeof n === 'number' ? n : shownDivisor
  }
  /** The brand has a ratio of its own once saved. */
  const ownBrandDivisor = (brand: string): boolean => {
    const n = readRatio(brandDivisorTextOf(brand))
    return typeof n === 'number'
  }
  /** Every ratio a SKU without one of its own may be divided by: the main (riders alone), and each brand's. */
  const everyDivisor = [shownDivisor, ...brands.map(b => brandDivisorOf(b.code))]
  const anyBrandOwn = brands.some(b => ownBrandDivisor(b.code) && brandDivisorOf(b.code) !== shownDivisor)
  /** The ratio a line is judged at once saved; null = its sub-department's. */
  const ratioOf = (l: Line): number | null => {
    const text = drafts.get(l.erpId)
    if (text === undefined) return l.saved?.ratio ?? null
    const n = readRatio(text)
    return n === 'bad' ? l.saved?.ratio ?? null : n
  }
  /** Every ratio a line may be divided by once saved: each brand's, else its own, else the brand's, else the main. */
  const ratiosOf = (l: Line): number[] => {
    const own = ratioOf(l)
    if (!isSplit(l)) return [own ?? shownDivisor]
    return brands.map(b => {
      const n = readRatio(brandTextOf(l.erpId, b.code))
      return typeof n === 'number' ? n : own ?? brandDivisorOf(b.code)
    })
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
  const shownFree = shown.filter(s => !onList.has(s.erpId))
  const allShownTicked = shownFree.length > 0 && shownFree.every(s => ticked.has(s.erpId))
  const pickRatioValue = readRatio(pickRatio)
  const pickBrandValues = brands.flatMap(b => {
    const text = (pickBrands.get(b.code) ?? '').trim()
    return text ? [{ brand: b.code, text, value: readRatio(text) }] : []
  })
  const pickBad = pickRatioValue === 'bad' || pickBrandValues.some(p => p.value === 'bad')
  const pickOk = !pickBad && (typeof pickRatioValue === 'number' || pickBrandValues.length > 0)

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

  /** The main ratio typed: every brand goes back to it (the user: "如果说我调主要的一个的话，这样它就是 override 全部"). */
  function setMainDraft(text: string) {
    setDivisorDraft(text)
    setBrandDivisorDrafts(new Map(brands.map(b => [b.code, ''])))
    setNotice(null)
  }

  function setBrandDivisorDraft(brand: string, text: string) {
    setBrandDivisorDrafts(previous => new Map(previous).set(brand, text))
    setNotice(null)
  }

  function setBrandDraft(erpId: string, brand: string, text: string) {
    setBrandDrafts(previous => new Map(previous).set(brandKeyOf(erpId, brand), text))
    setNotice(null)
  }

  /** Forget what was typed for a line this time: its own ratio and its brands. */
  function dropDrafts(erpId: string) {
    setDrafts(previous => {
      const next = new Map(previous)
      next.delete(erpId)
      return next
    })
    setBrandDrafts(previous => {
      const next = new Map(previous)
      for (const b of brands) next.delete(brandKeyOf(erpId, b.code))
      return next
    })
    setSplit(previous => {
      const next = new Set(previous)
      next.delete(erpId)
      return next
    })
  }

  /** Every brand of a line back to its own ratio: a saved one taken off, a typed one forgotten. */
  function mergeBrands(erpId: string) {
    setBrandDrafts(previous => {
      const next = new Map(previous)
      for (const b of brands) {
        const k = brandKeyOf(erpId, b.code)
        if (savedBrand.has(k)) next.set(k, '')
        else next.delete(k)
      }
      return next
    })
    setSplit(previous => {
      const next = new Set(previous)
      next.delete(erpId)
      return next
    })
    setNotice(null)
  }

  function splitByBrand(erpId: string) {
    setEditing(true)
    setSplit(previous => new Set(previous).add(erpId))
    setNotice(null)
  }

  function removeLine(l: Line) {
    setDrafts(previous => new Map(previous).set(l.erpId, ''))
    mergeBrands(l.erpId)
  }

  function toggle(erpId: string) {
    setTicked(previous => {
      const next = new Set(previous)
      if (next.has(erpId)) next.delete(erpId)
      else next.add(erpId)
      return next
    })
  }

  function tickAllShown() {
    setTicked(previous => {
      const next = new Set(previous)
      for (const s of shownFree) {
        if (allShownTicked) next.delete(s.erpId)
        else next.add(s.erpId)
      }
      return next
    })
  }

  function addTicked() {
    if (tickedHere.length === 0) return
    if (pickBad) {
      setError(`"${pickRatioValue === 'bad' ? pickRatio : pickBrandValues.find(p => p.value === 'bad')?.text}" is not a ratio above 0 and at most 10.`)
      return
    }
    if (!pickOk) {
      setError('Type the ratio the ticked SKUs are divided by, such as 0.6 — or one for a brand.')
      return
    }
    // A mattress or a sofa sells under its own brand: it takes the one ratio, never a brand's.
    const own = tickedHere.filter(id => !skuById.get(id)?.rider)
    if (pickRatioValue === null && own.length > 0) {
      const sku = skuById.get(own[0])
      setError(`${sku?.code ?? own[0]} sells under its own brand: type the ratio it divides by.`)
      return
    }
    setAdded(previous => [...tickedHere, ...previous])
    setDrafts(previous => {
      const next = new Map(previous)
      if (typeof pickRatioValue === 'number') for (const id of tickedHere) next.set(id, pickRatio.trim())
      return next
    })
    const riders = tickedHere.filter(id => skuById.get(id)?.rider)
    if (pickBrandValues.length > 0 && riders.length > 0) {
      setBrandDrafts(previous => {
        const next = new Map(previous)
        for (const id of riders) for (const p of pickBrandValues) next.set(brandKeyOf(id, p.brand), p.text)
        return next
      })
      setSplit(previous => {
        const next = new Set(previous)
        for (const id of riders) next.add(id)
        return next
      })
    }
    setTicked(new Set())
    setError(null)
    setNotice(null)
  }

  function save() {
    if (saving || dirty === 0) return
    const blank = changed.find(l => !l.listed && changeOf(l) === '')
    if (blank) {
      setError(`${codeOf(blank)}: give it a ratio, or take it off the list.`)
      return
    }
    const edit: CostSettingEdit = {
      divisor: divisorChanged && divisorDraft !== null ? divisorDraft : undefined,
      ratios: changed.map(l => ({ erpId: l.erpId, ratio: changeOf(l) ?? '', label: codeOf(l) })),
      ...(brandChanges.length > 0
        ? { brands: brandChanges.map(({ l, brand }) => ({ erpId: l.erpId, brand, ratio: brandChangeOf(l.erpId, brand) ?? '', label: codeOf(l) })) }
        : {}),
      ...(brandDivisorChanges.length > 0
        ? { brandRatios: brandDivisorChanges.map(b => ({ brand: b.code, ratio: brandDivisorChangeOf(b.code) ?? '', label: b.name })) }
        : {}),
    }
    try {
      validateCostSetting(edit)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the ratios.')
      return
    }
    setError(null)
    setNotice(null)
    const before = { ratios, divisor, byBrand, brandDivisors }
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

  /** A rider row's menu: split it by brand, or back to one ratio. */
  const menuItems = (l: Line): ProductRowMenuItem[] =>
    isSplit(l)
      ? [{ key: 'merge', label: 'One ratio for every brand', onSelect: () => { setEditing(true); mergeBrands(l.erpId) } }]
      : [{ key: 'split', label: 'Split by brand', onSelect: () => splitByBrand(l.erpId) }]
  const menuLine = menu ? lines.find(l => l.erpId === menu.erpId) : undefined
  const closeMenu = useCallback(() => setMenu(null), [])

  function openMenuAt(l: Line, e: ReactMouseEvent) {
    if (!riderLine(l) || saving || goingOf(l)) return
    // Shift + right-click, a field and selected text keep the browser's own menu.
    if (e.shiftKey || (e.target instanceof HTMLElement && e.target.closest('input, textarea, select'))) return
    if (window.getSelection()?.toString()) return
    e.preventDefault()
    setMenu({ erpId: l.erpId, anchor: { x: e.clientX, y: e.clientY } })
  }

  function openMenuFrom(l: Line, button: HTMLElement) {
    const r = button.getBoundingClientRect()
    setMenu({ erpId: l.erpId, anchor: { x: r.left, y: r.bottom + 4 } })
  }

  const msg = !q ? 'Type to find SKUs. Nothing shows until you search.'
    : matches.length === 0 ? 'No SKU matches.'
    : matches.length > PICK_LIMIT ? `Showing ${PICK_LIMIT} of ${matches.length.toLocaleString()}. Narrow the search to see the rest.`
    : null
  const columns = 6 + (byBrandOn ? 1 : 0) + (editing ? 1 : 0)
  const addLabel = tickedHere.length === 0
    ? 'Tick SKUs to add'
    : `Add ${tickedHere.length}${typeof pickRatioValue === 'number' ? ` at ${pickRatio.trim()}` : pickBrandValues.length === 0 ? ' at …' : ''}${pickBrandValues.length > 0 && !pickBad ? ' · by brand' : ''}`

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
                onChange={e => setMainDraft(e.target.value)}
                disabled={saving}
                inputMode="decimal"
                aria-label={`${sub.name} cost ratio`}
              />
            ) : (
              <span className={c.figBig}>{formatRatio(divisor)}</span>
            )}
            <span className={c.figAfter}>divides every SKU&rsquo;s cost</span>
          </div>
          {byBrandOn ? (
            <div className={c.figBrands} role="group" aria-label={`${sub.name} cost ratio by brand`}>
              <span className={c.figBrandsLabel}>BY BRAND</span>
              {brands.map(b =>
                editing ? (
                  <label key={b.code} className={c.brandInput}>
                    <span>{b.name}</span>
                    <CellInput value={brandDivisorTextOf(b.code)} onChange={v => setBrandDivisorDraft(b.code, v)}
                      edited={brandDivisorChangeOf(b.code) !== undefined} width={64} disabled={saving}
                      placeholder={formatRatio(shownDivisor)} label={`${b.name} cost ratio`} />
                  </label>
                ) : (
                  <span key={b.code} className={c.brandRatio} data-follows={!ownBrandDivisor(b.code) || undefined}>
                    {b.name} <b>{formatRatio(brandDivisorOf(b.code))}</b>
                  </span>
                ),
              )}
            </div>
          ) : null}
          <span className={c.figSub}>
            The Revenue Team&rsquo;s cost is the Product List cost divided by this ratio &mdash; or by the brand&rsquo;s, where a brand has one. Every margin in the calculator, the month and the run is judged against it. SKUs below divide by a ratio of their own.
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

      <KivCostsSection costs={kivCosts} divisors={everyDivisor} onDraft={setKivDraft} />

      <Heading title="SKUs at their own ratio" sub={plural(lines.filter(l => l.listed).length, 'SKU')} />
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
            {shownFree.length > 1 ? (
              <button type="button" className={c.cellLink} disabled={saving} onClick={tickAllShown}>
                {allShownTicked ? 'Untick all' : `Tick all ${shownFree.length}`}
              </button>
            ) : null}
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
                inputMode="decimal" placeholder={formatRatio(shownDivisor)} aria-label="Ratio for the ticked SKUs" />
            </label>
            <button type="button" className={c.pickerAdd} disabled={saving} data-idle={(tickedHere.length === 0 || !pickOk) || undefined} onClick={addTicked}>
              {addLabel}
            </button>
          </div>
          {byBrandOn ? (
            <div className={c.pickerBrands} role="group" aria-label="Ratios by brand for the ticked bed frames and accessories">
              <span className={c.pickerBrandsLabel}>BY BRAND</span>
              {brands.map(b => (
                <label key={b.code} className={c.pickerAmount}>
                  <span className={c.selectLabel}>{b.name}</span>
                  <input className={`${c.pickerAmountInput} ${c.pickerBrandInput}`} value={pickBrands.get(b.code) ?? ''} disabled={saving}
                    onChange={e => { const v = e.target.value; setPickBrands(previous => new Map(previous).set(b.code, v)) }}
                    inputMode="decimal" placeholder={pickRatio.trim() || formatRatio(brandDivisorOf(b.code))} aria-label={`${b.name} ratio for the ticked SKUs`} />
                </label>
              ))}
            </div>
          ) : null}
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
                {byBrandOn ? <th scope="col" className={c.th} style={{ minWidth: 260 }}>BY BRAND</th> : null}
                <th scope="col" className={c.th} data-num="" style={{ minWidth: 160 }}>TEAM COST</th>
                {editing ? <th scope="col" className={c.th} data-num="" style={{ minWidth: 110 }}><span className="sr-only">Remove</span>{' '}</th> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const text = drafts.get(l.erpId)
                const isNew = !l.listed
                const going = goingOf(l)
                const cost = costOf(l.sku)
                const rider = riderLine(l)
                const splitNow = isSplit(l)
                const ownText = text ?? (l.saved ? formatRatio(l.saved.ratio) : '')
                const ownPlaceholder = formatRatio(shownDivisor)
                return (
                  <tr key={l.erpId} className={c.row} data-stripe={(!isNew && i % 2 === 1) || undefined} data-new={isNew || undefined} data-removing={going || undefined}
                    onContextMenu={rider ? e => openMenuAt(l, e) : undefined}>
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
                        <CellInput value={ownText} onChange={v => setDraft(l.erpId, v)}
                          edited={text !== undefined && (isNew || (l.saved === null ? text.trim() !== '' : differs(text, l.saved.ratio)))} width={84} disabled={saving}
                          placeholder={ownPlaceholder} label={`${codeOf(l)} ratio`} />
                      ) : l.saved ? formatRatio(l.saved.ratio) : <span className={c.faint}>{ownPlaceholder}</span>}
                    </td>
                    {byBrandOn ? (
                      <td className={`${c.td} ${editing && splitNow && !going ? c.inputCell : ''}`} data-wrap="">
                        <div className={c.brandCell}>
                          {!rider || !splitNow ? (
                            <span className={c.faint}>—</span>
                          ) : editing && !going ? (
                            <div className={c.brandInputs} role="group" aria-label={`${codeOf(l)} by brand`}>
                              {brands.map(b => {
                                const typed = brandDrafts.get(brandKeyOf(l.erpId, b.code))
                                return (
                                  <label key={b.code} className={c.brandInput}>
                                    <span>{b.name}</span>
                                    <CellInput value={brandTextOf(l.erpId, b.code)} onChange={v => setBrandDraft(l.erpId, b.code, v)}
                                      edited={typed !== undefined && brandChangeOf(l.erpId, b.code) !== undefined} width={64} disabled={saving}
                                      placeholder={formatRatio(ratioOf(l) ?? brandDivisorOf(b.code))} label={`${codeOf(l)} · ${b.name} ratio`} />
                                  </label>
                                )
                              })}
                            </div>
                          ) : (
                            <span className={c.brandRatios}>
                              {brands.flatMap(b => {
                                const t = brandTextOf(l.erpId, b.code).trim()
                                return t ? [<span key={b.code} className={c.brandRatio}>{b.name} <b>{t}</b></span>] : []
                              })}
                            </span>
                          )}
                          {rider && !going ? (
                            <button type="button" className={c.rowDots} aria-label={`More for ${codeOf(l)}`} aria-haspopup="menu"
                              disabled={saving} onClick={e => openMenuFrom(l, e.currentTarget)}>⋯</button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    <td className={`${c.td} ${c.bold} ${c.accent}`} data-num="">{cost ? rangeLabel(cost, ratiosOf(l)) : '—'}</td>
                    {editing ? (
                      <td className={c.td} data-num="">
                        {isNew ? (
                          <button type="button" className={c.cellLink} data-tone="danger" disabled={saving}
                            onClick={() => { setAdded(previous => previous.filter(id => id !== l.erpId)); dropDrafts(l.erpId) }}>Take off</button>
                        ) : going ? (
                          <button type="button" className={c.cellLink} disabled={saving} onClick={() => dropDrafts(l.erpId)}>Keep</button>
                        ) : (
                          <button type="button" className={c.cellLink} data-tone="danger" disabled={saving} onClick={() => removeLine(l)}>Remove</button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
              {lines.length === 0 ? (
                <tr><td colSpan={columns} className={c.empty}>Every {sub.name} SKU divides by {formatRatio(divisor)}{anyBrandOwn ? <> or its brand&rsquo;s</> : null}.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PageScrolledTable>
        <TableFoot shown={`${plural(lines.length, 'SKU')} · every other SKU divides by ${formatRatio(shownDivisor)}${anyBrandOwn ? ' or its brand’s' : ''}`} />
      </div>

      {menu && menuLine ? (
        <ProductRowMenu title={codeOf(menuLine)} anchor={menu.anchor} items={menuItems(menuLine)} onClose={closeMenu} />
      ) : null}
    </>
  )
}
