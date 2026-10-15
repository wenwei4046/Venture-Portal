// Bank BA maths (user 2026-08-07). The BA is HOUZS Century's facility with
// the bank; HV sits in the middle:
//   bank interest (reference, HC's cost) = face × annual rate × days ÷ 365
//   HV owes HC                           = face × hcRate/mo   × days ÷ 30
//   HV charges the borrower (sub)        = face × chargeRate/mo × days ÷ 30
//   HV margin                            = charge − owe
// Both internal rates prorate by days (user: 按天 prorate).

const r2 = (n: number) => Math.round(n * 100) / 100

export interface BaCalcInput {
  face: number
  /** Bank's annual rate as a decimal, e.g. 0.045 = 4.5%/yr. Reference only. */
  bankAnnualRate: number
  days: number
  /** Monthly rate HV charges the borrower, e.g. 0.025 = 2.5%/mo. */
  chargeRateMonthly: number
  /** Monthly rate HV owes HC, e.g. 0.015 = 1.5%/mo. */
  hcRateMonthly: number
}

export interface BaCalcResult {
  /** Bank's day-count interest — HC's cost, shown for reference. */
  bankInterest: number
  /** What HV bills the borrower for the tenor. */
  chargeToBorrower: number
  /** What HV owes HC for the tenor. */
  oweToHc: number
  /** HV's spread = charge − owe. */
  margin: number
  /** face + chargeToBorrower — what HV collects at maturity. */
  collectTotal: number
  /** face + oweToHc — what HV repays HC at maturity. */
  repayHcTotal: number
}

export function calcBa(i: BaCalcInput): BaCalcResult {
  const face = i.face > 0 ? i.face : 0
  const days = i.days > 0 ? i.days : 0
  const bankInterest = r2((face * i.bankAnnualRate * days) / 365)
  const chargeToBorrower = r2((face * i.chargeRateMonthly * days) / 30)
  const oweToHc = r2((face * i.hcRateMonthly * days) / 30)
  return {
    bankInterest,
    chargeToBorrower,
    oweToHc,
    margin: r2(chargeToBorrower - oweToHc),
    collectTotal: r2(face + chargeToBorrower),
    repayHcTotal: r2(face + oweToHc),
  }
}

/** Whole days from startDate to endDate (YYYY-MM-DD strings), endpoint exclusive. */
export function daysBetween(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T00:00:00Z`).getTime()
  const b = new Date(`${endDate}T00:00:00Z`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

// ── The financing form's rules (2026-10-15 — lifted out of the desktop form so
// the Finance phone app's sheet keeps exactly the same) ─────────────────────

/** The form's terms as typed: rates in percent, a maturity date (when set, the days follow from it) or days. */
export interface BaTermsFields {
  face: string
  bankRatePct: string
  startDate: string
  endDate: string
  days: string
  chargePct: string
  hcPct: string
}

/** `days` days after a YYYY-MM-DD day. */
function addDays(iso: string, days: number): string {
  const t = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(t.getTime())) return ''
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** What the terms come to: the days, the maturity and the figures — as the form shows them while typed. */
export function baTermsOf(f: BaTermsFields): BaCalcResult & { days: number; maturity: string } {
  const days = f.endDate && f.startDate ? daysBetween(f.startDate, f.endDate) : Number(f.days) || 0
  const result = calcBa({
    face: Number(f.face) || 0,
    bankAnnualRate: (Number(f.bankRatePct) || 0) / 100,
    days,
    chargeRateMonthly: (Number(f.chargePct) || 0) / 100,
    hcRateMonthly: (Number(f.hcPct) || 0) / 100,
  })
  const maturity = f.endDate || (f.startDate && days > 0 ? addDays(f.startDate, days) : '')
  return { days, maturity, ...result }
}

const moneyBare = (n: number) => {
  const s = Math.abs(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `(${s})` : s
}

/**
 * The over-limit warning — it WARNS only, never blocks (user 2026-08-11: 超了警告但不挡). An active
 * financing being edited already counts inside its company's `used`.
 */
export function baLimitWarning(args: {
  companyId: string
  face: number
  limits: ReadonlyArray<{ companyId: string; label: string; limit: number; used: number }>
  editing: { status: string; borrowerCompanyId: string | null; faceAmount: number } | null
}): string | null {
  if (!args.companyId) return null
  const l = args.limits.find((x) => x.companyId === args.companyId)
  if (!l || l.limit <= 0) return null
  if (args.face <= 0) return null
  const own = args.editing && args.editing.status === 'active' && args.editing.borrowerCompanyId === args.companyId ? args.editing.faceAmount : 0
  const after = l.used - own + args.face
  if (after <= l.limit) return null
  return `Over limit: ${l.label} has RM ${moneyBare(l.used - own)} active of RM ${moneyBare(l.limit)} — this BA takes it to RM ${moneyBare(after)}`
}

/** What saving still needs (2026-10-10, the handoff: a ref and a borrower too). */
export function baMissing(args: { face: number; days: number; baNo: string; borrowerCompanyId: string; borrowerName: string }): string[] {
  return [
    args.face > 0 ? null : 'the face amount',
    args.days > 0 ? null : 'the days',
    args.baNo.trim() ? null : 'the BA ref',
    args.borrowerCompanyId || args.borrowerName.trim() ? null : 'the borrower',
  ].filter((m): m is string => m !== null)
}
