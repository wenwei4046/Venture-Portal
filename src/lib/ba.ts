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
