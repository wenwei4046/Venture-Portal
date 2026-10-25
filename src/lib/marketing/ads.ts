// A project's Ads report (2026-10-25 — the user's answer 57: "可以接crm 那边了 那边有一个proformance的 base 你看有什么能够
// sync 过来"; then: each Ads project picks its own CRM ads, its cadence "可以自己set", its figures "可以自己set 要加哪一个", the
// Ads person publishes it to the PIC's link, an ad not in the CRM keeps typed figures). What the CRM's Ads Performance
// counts (leads, appointments, show-ups, won) and what Meta's Ads Manager says (spend, impressions, reach, clicks,
// conversations), over a report's days; the figures built from them; a report's periods by its cadence; each figure as
// the PIC reads it, against its target. Pure.

import { officeTime } from '@/lib/office-time'
import { addDays, addMonths, shortDay } from './board'

// ── The cadence and the periods ───────────────────────────────────────────────────────────────────────────────

export type AdsEvery = '1w' | '2w' | '4w' | '1m'
export const ADS_EVERY: readonly AdsEvery[] = ['1w', '2w', '4w', '1m']
export const EVERY_WORDS: Readonly<Record<AdsEvery, string>> = {
  '1w': 'Every week', '2w': 'Every 2 weeks', '4w': 'Every 4 weeks', '1m': 'Every month',
}
const isEvery = (v: unknown): v is AdsEvery => typeof v === 'string' && (ADS_EVERY as readonly string[]).includes(v)

export interface AdsPeriod {
  no: number
  from: string
  until: string
}

/** Its n-th period's first day: weeks from its first day, or the same day n − 1 months on (the 31st on a shorter
 * month's last). */
function periodStart(every: AdsEvery, startsOn: string, no: number): string {
  if (every !== '1m') return addDays(startsOn, (no - 1) * (every === '1w' ? 7 : every === '2w' ? 14 : 28))
  const month = addMonths(startsOn, no - 1)
  const last = +addDays(addMonths(month, 1), -1).slice(8, 10)
  return `${month.slice(0, 8)}${String(Math.min(+startsOn.slice(8, 10), last)).padStart(2, '0')}`
}

/** The n-th period: its first day to the day before the next one's. */
export function adsPeriod(every: AdsEvery, startsOn: string, no: number): AdsPeriod {
  return { no, from: periodStart(every, startsOn, no), until: addDays(periodStart(every, startsOn, no + 1), -1) }
}

/** Its periods from the first to the one today is in (none before its first day, none after its last report) — the
 * newest first, at most `max`. */
export function adsPeriods(every: AdsEvery, startsOn: string, today: string, max = 60, lastNo: number | null = null): AdsPeriod[] {
  const out: AdsPeriod[] = []
  for (let no = 1; no <= Math.min(lastNo ?? 500, 1000); no++) {
    const p = adsPeriod(every, startsOn, no)
    if (p.from > today) break
    out.push(p)
  }
  return out.reverse().slice(0, max)
}

/** A period's Report day: the day after its last (the handoff's PIC Link — *20 Oct – 2 Nov*, *Next report 3 Nov*). */
export const reportDay = (p: Pick<AdsPeriod, 'until'>) => addDays(p.until, 1)

/** Its Report days, the first first — to its last report, else to a year after today. */
export function reportDays(every: AdsEvery, startsOn: string, lastNo: number | null, today: string): (AdsPeriod & { day: string })[] {
  const horizon = addDays(today, 366)
  const out: (AdsPeriod & { day: string })[] = []
  for (let no = 1; no <= Math.min(lastNo ?? 1000, 1000); no++) {
    const p = adsPeriod(every, startsOn, no)
    const day = reportDay(p)
    if (day > horizon) break
    out.push({ ...p, day })
  }
  return out
}

/** A year of its periods to pick the last report from — "#3 · 17 – 30 Nov", the year where it is not the first's — and
 * as far as `atLeast`. */
export function lastChoices(every: AdsEvery, startsOn: string, atLeast = 0): { no: number; label: string }[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return []
  const n = Math.min(Math.max({ '1w': 52, '2w': 26, '4w': 13, '1m': 12 }[every], atLeast), 1000)
  return Array.from({ length: n }, (_, i) => {
    const p = adsPeriod(every, startsOn, i + 1)
    const year = p.until.slice(0, 4) !== startsOn.slice(0, 4) && p.from.slice(0, 4) === p.until.slice(0, 4) ? ` ${p.until.slice(0, 4)}` : ''
    return { no: p.no, label: `#${p.no} · ${reportRange(p)}${year}` }
  })
}

/** "6 – 19 Oct", "27 Oct – 9 Nov", "29 Dec 2026 – 11 Jan 2027". */
export function reportRange(p: Pick<AdsPeriod, 'from' | 'until'>): string {
  if (p.from.slice(0, 4) !== p.until.slice(0, 4)) return `${shortDay(p.from)} ${p.from.slice(0, 4)} – ${shortDay(p.until)} ${p.until.slice(0, 4)}`
  if (p.from.slice(0, 7) !== p.until.slice(0, 7)) return `${shortDay(p.from)} – ${shortDay(p.until)}`
  return `${+p.from.slice(8, 10)} – ${shortDay(p.until)}`
}

// ── The figures ─────────────────────────────────────────────────────────────────────────────────────────────────

export type AdsKey =
  | 'spendToDate' | 'spend' | 'leads' | 'cpl' | 'appt' | 'apptRate' | 'cpa' | 'showup' | 'showRate' | 'won' | 'winRate'
  | 'wonAmount' | 'roas' | 'impr' | 'reach' | 'clicks' | 'ctr' | 'msgconv' | 'cpmsg'
export type AdsFmt = 'rm' | 'rm2' | 'n' | 'pct' | 'x'

export interface AdsFigure {
  key: AdsKey
  label: string
  fmt: AdsFmt
  /** Where it comes from: Meta's Ads Manager, the CRM, or both. */
  from: 'meta' | 'crm' | 'both'
}

/** Every figure a report may show, in the CRM's Ads Performance's words where it has them. */
export const ADS_FIGURES: readonly AdsFigure[] = [
  { key: 'spendToDate', label: 'Spend so far', fmt: 'rm', from: 'meta' },
  { key: 'spend', label: 'Spend', fmt: 'rm', from: 'meta' },
  { key: 'leads', label: 'Leads', fmt: 'n', from: 'crm' },
  { key: 'cpl', label: 'Cost per lead', fmt: 'rm2', from: 'both' },
  { key: 'appt', label: 'Appointments', fmt: 'n', from: 'crm' },
  { key: 'apptRate', label: 'Appointment rate', fmt: 'pct', from: 'crm' },
  { key: 'cpa', label: 'Cost per appointment', fmt: 'rm2', from: 'both' },
  { key: 'showup', label: 'Showed up', fmt: 'n', from: 'crm' },
  { key: 'showRate', label: 'Show-up rate', fmt: 'pct', from: 'crm' },
  { key: 'won', label: 'Won', fmt: 'n', from: 'crm' },
  { key: 'winRate', label: 'Win rate', fmt: 'pct', from: 'crm' },
  { key: 'wonAmount', label: 'Won amount', fmt: 'rm', from: 'crm' },
  { key: 'roas', label: 'ROAS', fmt: 'x', from: 'both' },
  { key: 'impr', label: 'Impressions', fmt: 'n', from: 'meta' },
  { key: 'reach', label: 'Reach', fmt: 'n', from: 'meta' },
  { key: 'clicks', label: 'Link clicks', fmt: 'n', from: 'meta' },
  { key: 'ctr', label: 'CTR (link)', fmt: 'pct', from: 'meta' },
  { key: 'msgconv', label: 'Conversations started', fmt: 'n', from: 'meta' },
  { key: 'cpmsg', label: 'Cost per conversation', fmt: 'rm2', from: 'meta' },
]
export const ADS_KEYS = ADS_FIGURES.map(f => f.key)
const FIGURE = new Map(ADS_FIGURES.map(f => [f.key, f]))
export const figureOf = (key: AdsKey) => FIGURE.get(key) as AdsFigure
export const isAdsKey = (v: unknown): v is AdsKey => typeof v === 'string' && FIGURE.has(v as AdsKey)
/** The handoff's four: spend against the budget, cost per lead, appointments, ROAS. */
export const ADS_DEFAULT: readonly AdsKey[] = ['spendToDate', 'cpl', 'appt', 'roas']
export const ADS_MAX_FIGURES = 12
export const ADS_MAX_ADS = 40

export interface AdsTargets {
  /** RM over the whole campaign. */
  budget: number | null
  /** RM a lead — at most. */
  cpl: number | null
  /** Won amount ÷ spend — at least. */
  roas: number | null
  /** % of leads booking a visit — at least. */
  apptRate: number | null
}
export const NO_TARGETS: AdsTargets = { budget: null, cpl: null, roas: null, apptRate: null }

/** What the CRM counts for the picked ads over a report's days. */
export interface AdsCrm {
  leads: number
  appt: number
  showup: number
  won: number
  wonAmount: number
}
/** What Meta's Ads Manager says for them, summed (null: none could be read). */
export interface AdsMeta {
  spend: number
  impr: number
  reach: number
  clicks: number
  msgconv: number
}

export type AdsValues = Partial<Record<AdsKey, number | null>>

const per = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? a / b : null)
const pct = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? (a / b) * 100 : null)

/** Each figure from the CRM's and Meta's — null where what it needs is missing (no Meta, nothing to divide by). */
export function adsValues(crm: AdsCrm | null, meta: AdsMeta | null, spendToDate: number | null): AdsValues {
  const spend = meta ? meta.spend : null
  return {
    spendToDate,
    spend,
    leads: crm ? crm.leads : null,
    cpl: per(spend, crm?.leads),
    appt: crm ? crm.appt : null,
    apptRate: crm ? pct(crm.appt, crm.leads) : null,
    cpa: per(spend, crm?.appt),
    showup: crm ? crm.showup : null,
    showRate: crm ? pct(crm.showup, crm.appt) : null,
    won: crm ? crm.won : null,
    winRate: crm ? pct(crm.won, crm.leads) : null,
    wonAmount: crm ? crm.wonAmount : null,
    roas: per(crm?.wonAmount, spend),
    impr: meta ? meta.impr : null,
    reach: meta ? meta.reach : null,
    clicks: meta ? meta.clicks : null,
    ctr: meta ? pct(meta.clicks, meta.impr) : null,
    msgconv: meta ? meta.msgconv : null,
    cpmsg: per(spend, meta?.msgconv),
  }
}

const money = (n: number, dp: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

/** A figure's value written: RM 3,240 · RM 18.40 · 46 · 26% · 3.2 — "—" for none. */
export function figureText(key: AdsKey, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  switch (figureOf(key).fmt) {
    case 'rm': return money(Math.round(v), 0)
    case 'rm2': return money(Math.round(v * 100) / 100, 2)
    case 'pct': return `${Math.round(v * 10) / 10}%`
    case 'x': return (Math.round(v * 10) / 10).toFixed(1)
    default: return Math.round(v).toLocaleString('en-MY')
  }
}

export type AdsTone = 'good' | 'bad' | 'muted'

export interface AdsCard {
  key: AdsKey
  label: string
  value: string
  /** Against its target — "Target RM 20 · on target" — or what it is of: "of RM 6,000 budget". */
  sub: string
  tone: AdsTone
}

/** A figure as the PIC reads it (the handoff's report cards): its words, its value, and against its target. */
export function adsCard(key: AdsKey, values: AdsValues, targets: AdsTargets): AdsCard {
  const v = values[key] ?? null
  const base = { key, label: figureOf(key).label, value: figureText(key, v) }
  const vs = (target: number | null, words: string, goodWhenHigh: boolean, high: string, low: string): AdsCard => {
    if (target == null) return { ...base, sub: '', tone: 'muted' }
    if (v == null) return { ...base, sub: words, tone: 'muted' }
    const good = goodWhenHigh ? v >= target : v <= target
    return { ...base, sub: `${words} · ${good ? 'on target' : goodWhenHigh ? low : high}`, tone: good ? 'good' : 'bad' }
  }
  switch (key) {
    case 'spendToDate':
      return { ...base, sub: targets.budget != null ? `of ${figureText('spend', targets.budget)} budget` : '', tone: 'muted' }
    case 'cpl':
      return vs(targets.cpl, `Target ${figureText('cpl', targets.cpl).replace(/\.00$/, '')}`, false, 'above', 'below')
    case 'roas':
      return vs(targets.roas, `Min ${figureText('roas', targets.roas)}`, true, 'above', 'below')
    case 'apptRate':
      return vs(targets.apptRate, `Target ${figureText('apptRate', targets.apptRate)}`, true, 'above', 'below')
    case 'appt': {
      const rate = values.apptRate ?? null
      if (rate == null) return { ...base, sub: '', tone: 'muted' }
      const good = targets.apptRate != null && rate >= targets.apptRate
      return { ...base, sub: `Appointment rate ${figureText('apptRate', rate)}`, tone: good ? 'good' : 'muted' }
    }
    default:
      return { ...base, sub: '', tone: 'muted' }
  }
}

/** A published report's cards, in its setup's order (a figure since taken off the setup last). */
export function reportCards(r: Pick<AdsReport, 'values' | 'targets'>, figures: readonly string[]): AdsCard[] {
  const at = (k: string) => (figures.indexOf(k) < 0 ? 99 : figures.indexOf(k))
  return (Object.keys(r.values) as AdsKey[]).filter(isAdsKey).sort((a, b) => at(a) - at(b)).map(k => adsCard(k, r.values, r.targets))
}

// ── What is kept: the setup, a report ────────────────────────────────────────────────────────────────────────────

export interface AdsSetup {
  ads: string[]
  every: AdsEvery
  startsOn: string
  figures: AdsKey[]
  targets: AdsTargets
  /** Its last report's number (⑤-3c) — null: it reports on. */
  lastNo: number | null
}

export interface AdsReport {
  no: number
  from: string
  until: string
  values: AdsValues
  /** The targets as they stood when it was published. */
  targets: AdsTargets
  note: string | null
  by: string
  at: string
  /** Published again since. */
  updatedAt: string | null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function targetsFromRow(v: unknown): AdsTargets {
  const o = isObj(v) ? v : {}
  return { budget: numOrNull(o.budget), cpl: numOrNull(o.cpl), roas: numOrNull(o.roas), apptRate: numOrNull(o.apptRate) }
}

export function valuesFromRow(v: unknown): AdsValues {
  const out: AdsValues = {}
  if (!isObj(v)) return out
  for (const [k, x] of Object.entries(v)) if (isAdsKey(k)) out[k] = numOrNull(x)
  return out
}

export function setupFromRow(v: unknown): AdsSetup | null {
  if (!isObj(v) || !isEvery(v.every) || typeof v.startsOn !== 'string' || !DAY_RE.test(v.startsOn)) return null
  const figures = (Array.isArray(v.figures) ? v.figures : []).filter(isAdsKey)
  return {
    ads: (Array.isArray(v.ads) ? v.ads : []).filter((a): a is string => typeof a === 'string' && /^\d{5,32}$/.test(a)),
    every: v.every, startsOn: v.startsOn, figures: figures.length ? figures : [...ADS_DEFAULT], targets: targetsFromRow(v.targets),
    lastNo: lastNoOf(v.lastNo) ?? null,
  }
}

/** A last report's number: 1 to 1000 — null for none, undefined for one that is not. */
function lastNoOf(v: unknown): number | null | undefined {
  if (v === null || v === undefined) return null
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1000 ? v : undefined
}

export function reportsFromRow(v: unknown): AdsReport[] {
  return (Array.isArray(v) ? v : []).flatMap(r => {
    if (!isObj(r) || typeof r.from !== 'string' || !DAY_RE.test(r.from) || typeof r.until !== 'string' || !DAY_RE.test(r.until)) return []
    const no = Number(r.no)
    if (!Number.isInteger(no) || no < 1) return []
    return [{
      no, from: r.from, until: r.until, values: valuesFromRow(r.values), targets: targetsFromRow(r.targets),
      note: typeof r.note === 'string' && r.note.trim() ? r.note : null, by: typeof r.by === 'string' ? r.by : '',
      at: typeof r.at === 'string' ? r.at : '', updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    }]
  }).sort((a, b) => b.no - a.no)
}

/** mkt_ads_page(project): its setup (null until set up), its reports (newest first), whether the PIC has a link — and the
 * project it is on (⑤-3e, mig 20261026003000: its Track ID, title and subsidiary, for its PDF's head). */
export interface AdsPage {
  today: string
  link: boolean
  project: { track: string; title: string; sub: string } | null
  setup: AdsSetup | null
  reports: AdsReport[]
}

export function adsPageFromRow(v: unknown): AdsPage {
  const o = isObj(v) ? v : {}
  const p = isObj(o.project) && typeof o.project.track === 'string' && o.project.track ? o.project : null
  return {
    today: typeof o.today === 'string' && DAY_RE.test(o.today) ? o.today : '',
    link: o.link === true,
    project: p ? { track: p.track as string, title: typeof p.title === 'string' ? p.title : '', sub: typeof p.sub === 'string' ? p.sub : '' } : null,
    setup: setupFromRow(o.setup),
    reports: reportsFromRow(o.reports),
  }
}

// ── Its PDF (⑤-3e — the user: "can do"; the handoff's PIC Link writes *PDF* at each report's right) ────────────────────

/** Where a report's PDF is read: the team's from the project's page (Marketing · View), the PIC's from their link. */
export const adsReportPdfUrl = (project: string, no: number) => `/marketing/projects/${encodeURIComponent(project)}/ads?no=${no}`
export const picReportPdfUrl = (code: string, no: number) => `/t/${encodeURIComponent(code)}/r/${no}`
/** Its file's name, without the .pdf: "TSK-CAR-2610-001_ads-report-2". */
export const adsPdfName = (track: string, no: number) => `${(track || 'ads').replace(/[^A-Za-z0-9-]/g, '')}_ads-report-${no}`
/** The office's day an instant fell on, as the PDF says it: "3 Nov 2026" — '' for none. */
export function publishedWords(at: string | null | undefined): string {
  const d = at ? officeTime(at) : null
  if (!d || !d.isValid()) return ''
  const day = d.format('YYYY-MM-DD')
  return `${shortDay(day)} ${day.slice(0, 4)}`
}

/** A period as the card lists it: its report if published, else due once its last day is over. */
export interface AdsRow extends AdsPeriod {
  report: AdsReport | null
  /** Over, and not published yet. */
  due: boolean
}

/** Its periods to today (to its last report), the newest first — each with its report, or due once over. */
export function adsRows(setup: AdsSetup, reports: readonly AdsReport[], today: string): AdsRow[] {
  const byNo = new Map(reports.map(r => [r.no, r]))
  return adsPeriods(setup.every, setup.startsOn, today, 60, setup.lastNo).map(p => {
    const report = byNo.get(p.no) ?? null
    return { ...p, report, due: !report && p.until < today }
  })
}

/** A CRM ad to pick: its name and Page, whether Meta runs it, how many leads it has brought. */
export interface AdsChoice {
  id: string
  name: string
  page: string | null
  status: string | null
  leads: number
  hidden: boolean
}

export function choicesFromRow(v: unknown): AdsChoice[] {
  return (Array.isArray(v) ? v : []).flatMap(r => {
    if (!isObj(r) || typeof r.id !== 'string' || !/^\d{5,32}$/.test(r.id)) return []
    return [{
      id: r.id, name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : r.id,
      page: typeof r.page === 'string' && r.page.trim() ? r.page.trim() : null,
      status: typeof r.status === 'string' && r.status ? r.status : null,
      leads: Math.max(0, Math.round(Number(r.leads) || 0)), hidden: r.hidden === true,
    }]
  })
}

export function crmFromRow(v: unknown): AdsCrm | null {
  if (!isObj(v)) return null
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  return { leads: n(v.leads), appt: n(v.appt), showup: n(v.showup), won: n(v.won), wonAmount: n(v.wonAmount) }
}

// ── Changing the setup; publishing ─────────────────────────────────────────────────────────────────────────────────

export type AdsPatch = Partial<{ ads: string[]; every: AdsEvery; startsOn: string; figures: AdsKey[]; targets: Partial<AdsTargets>; lastNo: number | null }>

export interface AdsDraft {
  ads: string[]
  every: AdsEvery
  startsOn: string
  figures: AdsKey[]
  /** As typed: '' for none. */
  targets: Record<keyof AdsTargets, string>
  lastNo: number | null
}

const targetText = (n: number | null) => (n == null ? '' : String(n))
export const draftOf = (s: AdsSetup | null, today: string): AdsDraft => ({
  ads: s ? [...s.ads] : [],
  every: s?.every ?? '2w',
  startsOn: s?.startsOn ?? today,
  figures: s ? [...s.figures] : [...ADS_DEFAULT],
  targets: {
    budget: targetText(s?.targets.budget ?? null), cpl: targetText(s?.targets.cpl ?? null),
    roas: targetText(s?.targets.roas ?? null), apptRate: targetText(s?.targets.apptRate ?? null),
  },
  lastNo: s?.lastNo ?? null,
})

/** A typed target: a number from 0 (an appointment rate at most 100) — '' for none, undefined for one that is not. */
export function targetOf(key: keyof AdsTargets, typed: string): number | null | undefined {
  const t = typed.trim().replace(/,/g, '')
  if (!t) return null
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined
  const n = Number(t)
  return Number.isFinite(n) && n <= (key === 'apptRate' ? 100 : 1e9) ? Math.round(n * 100) / 100 : undefined
}

/** What stops it being saved. */
export function draftProblems(d: AdsDraft): string[] {
  const out: string[] = []
  if (!DAY_RE.test(d.startsOn)) out.push('Pick the first report’s first day.')
  if (!d.figures.length) out.push('Pick at least one figure.')
  if (d.figures.length > ADS_MAX_FIGURES) out.push(`Pick ${ADS_MAX_FIGURES} figures at most.`)
  if (d.ads.length > ADS_MAX_ADS) out.push(`Pick ${ADS_MAX_ADS} ads at most.`)
  for (const k of ['budget', 'cpl', 'roas', 'apptRate'] as const) {
    if (targetOf(k, d.targets[k]) === undefined) out.push(k === 'apptRate' ? 'An appointment rate is a number from 0 to 100.' : 'A target is a number from 0.')
  }
  return [...new Set(out)]
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** What is sent: a new setup in full; else only what changed — null when nothing did. */
export function adsPatch(was: AdsSetup | null, d: AdsDraft): AdsPatch | null {
  const targets: Partial<AdsTargets> = {}
  for (const k of ['budget', 'cpl', 'roas', 'apptRate'] as const) {
    const t = targetOf(k, d.targets[k])
    if (t === undefined) continue
    if (!was || t !== was.targets[k]) targets[k] = t
  }
  const ads = [...new Set(d.ads)].sort()
  if (!was) return { ads, every: d.every, startsOn: d.startsOn, figures: [...d.figures], targets, ...(d.lastNo != null ? { lastNo: d.lastNo } : {}) }
  const out: AdsPatch = {}
  if (!sameList(ads, [...was.ads].sort())) out.ads = ads
  if (d.every !== was.every) out.every = d.every
  if (d.startsOn !== was.startsOn) out.startsOn = d.startsOn
  if (!sameList(d.figures, was.figures)) out.figures = [...d.figures]
  if (Object.keys(targets).length) out.targets = targets
  if (d.lastNo !== was.lastNo) out.lastNo = d.lastNo
  return Object.keys(out).length ? out : null
}

/** A patch as the server takes it: each key of its own kind — anything else left out; null when empty. */
export function adsPatchOf(v: unknown): AdsPatch | null {
  if (!isObj(v)) return null
  const out: AdsPatch = {}
  if (Array.isArray(v.ads)) out.ads = v.ads.filter((a): a is string => typeof a === 'string').slice(0, 60)
  if (isEvery(v.every)) out.every = v.every
  if (typeof v.startsOn === 'string') out.startsOn = v.startsOn.slice(0, 10)
  if (Array.isArray(v.figures)) out.figures = v.figures.filter(isAdsKey).slice(0, 20)
  if (isObj(v.targets)) {
    const t: Partial<AdsTargets> = {}
    for (const k of ['budget', 'cpl', 'roas', 'apptRate'] as const) {
      const x = v.targets[k]
      if (x === null || (typeof x === 'number' && Number.isFinite(x))) t[k] = x
    }
    out.targets = t
  }
  if ('lastNo' in v) {
    const last = lastNoOf(v.lastNo)
    if (last !== undefined) out.lastNo = last
  }
  return Object.keys(out).length ? out : null
}

/** A report's values as typed on the publish form: '' for none — undefined when one is not a number from 0. */
export function typedValues(figures: readonly AdsKey[], typed: Readonly<Partial<Record<AdsKey, string>>>): AdsValues | undefined {
  const out: AdsValues = {}
  for (const k of figures) {
    const t = (typed[k] ?? '').trim().replace(/,/g, '').replace(/^RM\s*/i, '').replace(/%$/, '')
    if (!t) { out[k] = null; continue }
    if (!/^\d+(\.\d+)?$/.test(t)) return undefined
    out[k] = Number(t)
  }
  return out
}

/** A value as the publish form starts it — what the report keeps: money to the sen, even a figure its cards write whole
 * (Meta's RM 516.74 kept so, written *RM 517*: the cost per lead worked out from it agrees with it), a rate or ROAS to a
 * tenth, a count whole. */
export function valueText(key: AdsKey, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ''
  const f = figureOf(key).fmt
  const r = f === 'n' ? Math.round(v) : f === 'x' || f === 'pct' ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100
  return String(r)
}

/** Values as the server takes them: the known figures, each a number from 0 or null — null when none is left. */
export function adsValuesOf(v: unknown): AdsValues | null {
  if (!isObj(v)) return null
  const out: AdsValues = {}
  for (const [k, x] of Object.entries(v)) {
    if (!isAdsKey(k)) continue
    if (x === null) out[k] = null
    else if (typeof x === 'number' && Number.isFinite(x) && x >= 0) out[k] = x
  }
  return Object.keys(out).length ? out : null
}

// ── Its lines on the project's trail ───────────────────────────────────────────────────────────────────────────────

const CHANGED_WORDS: Readonly<Record<string, string>> = {
  ads: 'its ads', every: 'how often', startsOn: 'its first day', figures: 'its figures', targets: 'its targets', lastNo: 'its last report',
}

/** An Ads report's line on the project's trail (mkt_ads_save, mkt_ads_publish) — null for any other line. */
export function adsEventText(who: string, action: string, data?: Record<string, unknown> | null): string | null {
  const no = Number(data?.no)
  const from = data?.from, until = data?.until
  const range = typeof from === 'string' && typeof until === 'string' && DAY_RE.test(from) && DAY_RE.test(until) ? ` · ${reportRange({ from, until })}` : ''
  switch (action) {
    case 'ads set up': {
      const n = Number(data?.ads) || 0
      return `${who} set up the Ads report${isEvery(data?.every) ? ` · ${EVERY_WORDS[data.every].toLowerCase()}` : ''} · ${n} CRM ad${n === 1 ? '' : 's'}`
    }
    case 'ads changed': {
      const what = (Array.isArray(data?.what) ? data.what : []).map(w => (typeof w === 'string' ? CHANGED_WORDS[w] : undefined)).filter(Boolean)
      return `${who} changed the Ads report${what.length ? ` · ${what.join(', ')}` : ''}`
    }
    case 'ads report': return `${who} published Ads report #${Number.isInteger(no) ? no : '?'}${range}`
    case 'ads report again': return `${who} published Ads report #${Number.isInteger(no) ? no : '?'} again${range}`
    default: return null
  }
}

/** Meta's figures for the picked ads, summed — null when none could be read. */
export function metaSum(figs: readonly ({ spend: number; impr: number; reach: number; clicks: number; msgconv: number } | null | undefined)[]): AdsMeta | null {
  const got = figs.filter((f): f is NonNullable<typeof f> => !!f)
  if (!got.length) return null
  return got.reduce((a, f) => ({ spend: a.spend + f.spend, impr: a.impr + f.impr, reach: a.reach + f.reach, clicks: a.clicks + f.clicks, msgconv: a.msgconv + f.msgconv }),
    { spend: 0, impr: 0, reach: 0, clicks: 0, msgconv: 0 })
}
