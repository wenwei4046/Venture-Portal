import dayjs from 'dayjs'

// Fixed assets and their depreciation (2026-11-24 — the user: "能做一个折旧表在系统吗？" … "这个我要自己能维护").
// Pure: the page reads fa_read() (classes, register, the purchase lines on the accounts the classes depreciate, what
// was posted) and everything below works the schedule out of it. A line no asset holds yet stands in an asset of its
// own making — the lines of one voucher for one thing grouped — until somebody keeps it.
//
// Straight line, month by month: from the first month (the purchase's, or the next) over the life, what is left to
// depreciate over the months left — so a class changed after some months were posted spreads the rest over what is
// left of the life, and nothing is posted twice. The last month takes what remains; a disposed asset stops with the
// month it went.

export type StartRule = 'purchase_month' | 'next_month'

export interface FaClass {
  id: string
  name: string
  lifeMonths: number
  residualPct: number
  startRule: StartRule
  assetAccount: string
  accumAccount: string
  expenseAccount: string
  isActive: boolean
}

export interface FaLine {
  id: string
  date: string
  entryNo: string | null
  entryDescription: string
  description: string | null
  account: string
  amount: number
  assetId: string | null
}

export interface FaAssetRow {
  id: string
  name: string
  classId: string
  inServiceDate: string
  lifeMonths: number | null
  disposedOn: string | null
  notes: string | null
}

export interface FaPosting {
  assetId: string
  month: string
  amount: number
}

/** An asset as the page shows it: kept in the register, or made up of lines nobody has kept yet. */
export interface FaAsset extends FaAssetRow {
  /** Not in the register yet — its id is `new:` and its first line's. */
  draft: boolean
  lineIds: string[]
  cost: number
  /** The voucher it was bought on. */
  voucher: string
}

export interface FaData {
  classes: FaClass[]
  assets: FaAsset[]
  lines: FaLine[]
  postings: FaPosting[]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const ym = (d: string) => d.slice(0, 7)
const addMonths = (m: string, n: number) => dayjs(`${m}-01`).add(n, 'month').format('YYYY-MM')
const monthsBetween = (a: string, b: string) => dayjs(`${b}-01`).diff(dayjs(`${a}-01`), 'month')

/** The voucher a line came on: the entry's number, else its description before " — ". */
export function voucherOf(l: Pick<FaLine, 'entryNo' | 'entryDescription'>): string {
  const head = l.entryDescription.split(' — ')[0].replace(/\s*\[[^\]]*\]\s*$/, '').trim()
  const pv = head.match(/^(PV\s+)?((HV-)?PV-[\w-]+|PV-\d+)/)
  return pv ? pv[2] : head || (l.entryNo ?? '')
}

/** What a line says was bought: its own words, without the department or pool in brackets. */
export function wordsOf(l: Pick<FaLine, 'description' | 'entryDescription'>): string {
  const own = (l.description ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  // A voucher's generic "expense - PAYEE" says less than the voucher's own first line.
  if (own && !/^expense\s*-/i.test(own)) return own
  const words = l.entryDescription.split(/\r?\n/)[0].replace(/^[^:—]*[:—]\s*/, '').replace(/\s*\[[^\]]*\]\s*$/, '').trim()
  return words || own || 'Asset'
}

/** The register, and an asset for each group of lines nobody keeps yet: one voucher, one thing bought, one date. */
export function assetsOf(rows: FaAssetRow[], lines: FaLine[], classes: FaClass[]): FaAsset[] {
  const byAccount = new Map(classes.filter((c) => c.isActive).map((c) => [c.assetAccount, c]))
  const kept: FaAsset[] = rows.map((a) => {
    const own = lines.filter((l) => l.assetId === a.id)
    return { ...a, draft: false, lineIds: own.map((l) => l.id), cost: r2(own.reduce((s, l) => s + l.amount, 0)), voucher: own[0] ? voucherOf(own[0]) : '' }
  })
  const groups = new Map<string, FaLine[]>()
  for (const l of lines) {
    if (l.assetId || l.amount <= 0) continue
    const key = `${voucherOf(l)}|${wordsOf(l)}|${l.date}|${l.account}`
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  const drafts: FaAsset[] = []
  for (const g of groups.values()) {
    const first = g[0]
    const cls = byAccount.get(first.account) ?? classes.find((c) => c.assetAccount === first.account)
    if (!cls) continue
    drafts.push({
      id: `new:${first.id}`,
      name: wordsOf(first),
      classId: cls.id,
      inServiceDate: first.date,
      lifeMonths: null,
      disposedOn: null,
      notes: null,
      draft: true,
      lineIds: g.map((l) => l.id),
      cost: r2(g.reduce((s, l) => s + l.amount, 0)),
      voucher: voucherOf(first),
    })
  }
  return [...kept, ...drafts].sort((a, b) => a.inServiceDate.localeCompare(b.inServiceDate) || a.name.localeCompare(b.name))
}

export interface ScheduleMonth {
  month: string
  amount: number
  posted: boolean
  /** Accumulated depreciation at the month's end. */
  accumulated: number
  /** Net book value at the month's end. */
  nbv: number
}

/** The asset's first month of depreciation, its life in months and the amount to depreciate. */
export function termsOf(asset: Pick<FaAsset, 'inServiceDate' | 'lifeMonths' | 'cost'>, cls: FaClass): { first: string; life: number; depreciable: number } {
  const start = ym(asset.inServiceDate)
  return {
    first: cls.startRule === 'next_month' ? addMonths(start, 1) : start,
    life: asset.lifeMonths ?? cls.lifeMonths,
    depreciable: r2(asset.cost * (1 - cls.residualPct / 100)),
  }
}

/**
 * The asset's months up to `through` (YYYY-MM): what each posted, or what it would — what is left over the months
 * left, the last taking the rest, nothing after the month it was disposed of.
 */
export function scheduleOf(asset: FaAsset, cls: FaClass, posted: ReadonlyMap<string, number>, through: string): ScheduleMonth[] {
  const { first, life, depreciable } = termsOf(asset, cls)
  const last = addMonths(first, life - 1)
  const stop = [through, last, asset.disposedOn ? ym(asset.disposedOn) : last].sort()[0]
  const out: ScheduleMonth[] = []
  let acc = 0
  // A month posted before the life began (a class changed since) still counts.
  for (const [m, amt] of [...posted].sort()) if (m < first && m <= through) acc = r2(acc + amt)
  for (let m = first; m <= stop; m = addMonths(m, 1)) {
    const done = posted.get(m)
    let amount: number
    if (done !== undefined) amount = done
    else {
      const left = r2(depreciable - acc)
      const monthsLeft = life - monthsBetween(first, m)
      amount = left <= 0 ? 0 : monthsLeft <= 1 ? left : r2(left / monthsLeft)
    }
    acc = r2(acc + amount)
    out.push({ month: m, amount, posted: done !== undefined, accumulated: acc, nbv: r2(asset.cost - acc) })
  }
  return out
}

export interface AssetFigures {
  asset: FaAsset
  cls: FaClass | undefined
  months: ScheduleMonth[]
  /** The monthly charge over the whole life. */
  monthly: number
  accumulated: number
  nbv: number
}

/** Every asset's schedule up to `through`, with what was posted for it. */
export function figuresOf(data: FaData, through: string): AssetFigures[] {
  const classes = new Map(data.classes.map((c) => [c.id, c]))
  return data.assets.map((asset) => {
    const cls = classes.get(asset.classId)
    const posted = new Map(data.postings.filter((p) => p.assetId === asset.id).map((p) => [p.month, p.amount]))
    const months = cls ? scheduleOf(asset, cls, posted, through) : []
    const lastRow = months[months.length - 1]
    const terms = cls ? termsOf(asset, cls) : null
    const monthly = terms ? r2(terms.depreciable / terms.life) : 0
    return { asset, cls, months, monthly, accumulated: lastRow?.accumulated ?? 0, nbv: lastRow?.nbv ?? asset.cost }
  })
}

export interface PostLine {
  account_code: string
  debit: number
  credit: number
  description: string
}

export interface PostRow {
  month: string
  date: string
  description: string
  lines: PostLine[]
  postings: { asset_id: string; amount: number }[]
}

/**
 * What posting through `through` writes: for each month not yet posted for an asset, one entry — the asset by asset
 * depreciation on its class's expense account, against its accumulated depreciation. Drafts are left out (the page keeps
 * them first); a month with nothing to charge is not posted.
 */
export function postRows(data: FaData, through: string): PostRow[] {
  const byMonth = new Map<string, { fig: AssetFigures; amount: number }[]>()
  for (const fig of figuresOf(data, through)) {
    if (fig.asset.draft || !fig.cls) continue
    for (const m of fig.months) {
      if (m.posted || m.amount <= 0) continue
      byMonth.set(m.month, [...(byMonth.get(m.month) ?? []), { fig, amount: m.amount }])
    }
  }
  return [...byMonth.keys()].sort().map((month) => {
    const items = byMonth.get(month)!
    const end = dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD')
    const lines: PostLine[] = []
    for (const { fig, amount } of items) {
      const what = `Depreciation ${dayjs(`${month}-01`).format('MMM YYYY')} — ${fig.asset.name}${fig.asset.voucher ? ` (${fig.asset.voucher})` : ''}`
      lines.push({ account_code: fig.cls!.expenseAccount, debit: amount, credit: 0, description: what })
      lines.push({ account_code: fig.cls!.accumAccount, debit: 0, credit: amount, description: what })
    }
    return {
      month,
      date: end,
      description: `Depreciation — ${dayjs(`${month}-01`).format('MMMM YYYY')}`,
      lines,
      postings: items.map(({ fig, amount }) => ({ asset_id: fig.asset.id, amount })),
    }
  })
}

/** The months a financial year runs through (`from` – `to`, YYYY-MM). */
export function monthsOf(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

/** fa_read()'s answer, as the page works with it. */
export function faDataOf(raw: unknown): FaData {
  const o = (raw ?? {}) as Record<string, unknown[]>
  const n = (v: unknown) => Number(v ?? 0)
  const s = (v: unknown) => (v == null ? null : String(v))
  const classes: FaClass[] = (o.classes ?? []).map((c) => {
    const x = c as Record<string, unknown>
    return {
      id: String(x.id), name: String(x.name), lifeMonths: n(x.life_months), residualPct: n(x.residual_pct),
      startRule: (x.start_rule === 'next_month' ? 'next_month' : 'purchase_month') as StartRule,
      assetAccount: String(x.asset_account), accumAccount: String(x.accum_account), expenseAccount: String(x.expense_account),
      isActive: x.is_active !== false,
    }
  })
  const lines: FaLine[] = (o.lines ?? []).map((l) => {
    const x = l as Record<string, unknown>
    return {
      id: String(x.id), date: String(x.date).slice(0, 10), entryNo: s(x.entry_no), entryDescription: String(x.entry_description ?? ''),
      description: s(x.description), account: String(x.account), amount: n(x.amount), assetId: s(x.asset_id),
    }
  })
  const rows: FaAssetRow[] = (o.assets ?? []).map((a) => {
    const x = a as Record<string, unknown>
    return {
      id: String(x.id), name: String(x.name), classId: String(x.class_id), inServiceDate: String(x.in_service_date).slice(0, 10),
      lifeMonths: x.life_months == null ? null : n(x.life_months), disposedOn: x.disposed_on == null ? null : String(x.disposed_on).slice(0, 10),
      notes: s(x.notes),
    }
  })
  const postings: FaPosting[] = (o.postings ?? []).map((p) => {
    const x = p as Record<string, unknown>
    return { assetId: String(x.asset_id), month: String(x.month), amount: n(x.amount) }
  })
  return { classes, lines, postings, assets: assetsOf(rows, lines, classes) }
}
