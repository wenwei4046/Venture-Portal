// Director Pool — printable Flow report (browser Print → Save as PDF).
// Port of the HTML tool's downloadPDF() individual-director report: one page
// per director for the selected month — header, calculation-chain boxes,
// accumulated ledger cards (with the same sub-notes) and the four streams.
// ?month=YYYY-MM-DD picks the month (default latest); ?director=CODE prints
// one director, omitted prints all four (page break between).
//
// Lives OUTSIDE the (portal) route group on purpose: the portal frame
// (sidebar + topbar) must not wrap a print view on screen.

import type { Metadata } from 'next'
import PrintButton from './PrintButton'
import { requirePermission } from '@/lib/auth'
import { loadDirectorPoolData } from '@/lib/director-pool-data'
import {
  calcAll,
  r2,
  showAllowStat,
  billingAccum,
  savingAccum,
  billingDeductAdjustment,
  contraOffset,
  type MonthResult,
  type DirectorMonthResult,
} from '@/lib/director-pool-engine'

interface Props {
  searchParams: Promise<{ month?: string; director?: string }>
}

export const metadata: Metadata = { title: 'Director Pool — Flow Report' }

const fmt = (v: number) =>
  (Math.abs(v) < 0.005 ? 0 : v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export default async function DirectorPoolPrintPage({ searchParams }: Props) {
  await requirePermission('director_pool')
  const { month: rawMonth, director: rawDirector } = await searchParams

  const data = await loadDirectorPoolData()
  const results = calcAll(data.settings, data.directors, data.months, data.dirInputs, data.fixedOverrides)
  if (!results.length) {
    return <div style={{ padding: 40, fontFamily: 'serif' }}>No data entered yet.</div>
  }

  const m: MonthResult =
    results.find((x) => x.month === rawMonth || x.month.slice(0, 7) === rawMonth) ??
    results[results.length - 1]
  const dirs = rawDirector
    ? data.directors.filter((d) => d.code === rawDirector)
    : data.directors
  if (!dirs.length) {
    return <div style={{ padding: 40, fontFamily: 'serif' }}>Director not found.</div>
  }

  const sas = showAllowStat(m.month, data.settings)
  const gb = data.settings.gbPct
  const bi = r2(100 - gb)
  const sv = data.settings.savingPct
  const generated = new Date().toLocaleString('en-MY', { dateStyle: 'long', timeStyle: 'short' })

  return (
    <div className="dp-print">
      <style>{`
        @media print {
          .dp-print { margin: 0; padding: 0; max-width: none; }
          .no-print { display: none; }
          .dp-print .dir-page { page-break-after: always; }
          .dp-print .dir-page:last-of-type { page-break-after: auto; }
        }
        .dp-print, .dp-print * { box-sizing: border-box; }
        .dp-print { font-family: 'Georgia', 'Times New Roman', serif; color: #1C160F; max-width: 860px; margin: 0 auto; padding: 24px; font-size: 12px; line-height: 1.5; }
        .dp-print .rpt-head { text-align: center; border-bottom: 1px solid #C6B99E; padding-bottom: 10px; margin-bottom: 14px; }
        .dp-print .rpt-head .co { font-size: 15px; font-weight: bold; letter-spacing: 2px; }
        .dp-print .rpt-head .sub { font-size: 11px; color: #5A4E40; margin-top: 2px; }
        .dp-print .dir-page { margin-bottom: 22px; }
        .dp-print .dhead { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid #C6B99E; border-radius: 6px; margin-bottom: 10px; background: #F4EEE2; }
        .dp-print .dhead .avatar { width: 32px; height: 32px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 15px; }
        .dp-print .dhead .nm { font-size: 14px; font-weight: bold; }
        .dp-print .dhead .meta { font-size: 10px; color: #5A4E40; }
        .dp-print .chain { display: flex; align-items: stretch; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
        .dp-print .box { flex: 1; border: 1px solid #A79878; border-radius: 6px; padding: 7px 8px; text-align: center; min-width: 80px; }
        .dp-print .box.hl { border-width: 2px; border-color: #1C160F; }
        .dp-print .box .l { font-size: 8px; text-transform: uppercase; letter-spacing: .4px; color: #5A4E40; margin-bottom: 3px; font-weight: bold; }
        .dp-print .box .v { font-size: 12px; font-weight: bold; font-family: 'Courier New', monospace; }
        .dp-print .op { display: flex; align-items: center; padding: 0 4px; font-weight: bold; font-size: 14px; }
        .dp-print .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
        .dp-print .cards.four { grid-template-columns: repeat(4, 1fr); }
        .dp-print .card { border: 1px solid #C6B99E; border-radius: 6px; padding: 8px 10px; }
        .dp-print .card .l { font-size: 9px; font-weight: bold; margin-bottom: 4px; }
        .dp-print .card .v { font-size: 14px; font-weight: bold; font-family: 'Courier New', monospace; }
        .dp-print .card .s { font-size: 8.5px; color: #5A4E40; margin-top: 3px; }
        .dp-print .streams { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
        .dp-print .stream { border: 1px solid #C6B99E; border-radius: 6px; overflow: hidden; }
        .dp-print .stream .hd { padding: 5px 10px; font-size: 10.5px; font-weight: bold; background: #EAE1CE; border-bottom: 1px solid #C6B99E; }
        .dp-print .row { display: flex; justify-content: space-between; padding: 4px 10px; border-bottom: 1px solid #EAE1CE; font-size: 10.5px; }
        .dp-print .row:last-child { border-bottom: none; }
        .dp-print .row.b { font-weight: bold; background: #F4EEE2; }
        .dp-print .row .amt { font-family: 'Courier New', monospace; white-space: nowrap; padding-left: 8px; }
        .dp-print .row.sec { color: #85775F; font-size: 8.5px; padding: 2px 10px; }
        /* User ruling 2026-07-26: the report prints in plain black — the
           neg/pos/warn accents stay as classes but all render ink-black. */
        .dp-print .neg { color: #1C160F; }
        .dp-print .pos { color: #1C160F; }
        .dp-print .warn { color: #1C160F; }
        .dp-print .footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #C6B99E; font-size: 9px; color: #85775F; }
        .dp-print .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 16px; background: #1C160F; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
      `}</style>
      <PrintButton />
        <div className="rpt-head">
          <div className="co">HOUZS VENTURE SDN BHD</div>
          <div className="sub">
            Director Pool — Flow Report · {m.name} {m.month.slice(0, 4)}
            {m.fullPayout && ' · 💯 Full Payout'}
            {m.includeBilling && ' · 📥 Incl. Billing'}
          </div>
        </div>

        {dirs.map((dir) => {
          const d = m.dirRes.find((x) => x.id === dir.id) as DirectorMonthResult | undefined
          if (!d) return null
          const inp = data.dirInputs[d.statKey] ?? {}
          const statSalVal = m.fullPayout ? 0 : (inp.billingStat ?? 0)
          const statAlVal = m.fullPayout || !sas ? 0 : (inp.allowBillingStat ?? 0)
          const billingVal = r2(statSalVal + statAlVal)
          const total25 = m.fullPayout ? 0 : r2(d.salKpiBillInv + statSalVal + d.allowBillInv + statAlVal)
          // Payout: Vr KPI offset repays old debt, statFromSurplus pays this
          // month's keyed statutory (user ruling 2026-07-31) — both come off.
          const totalHRPayout = r2(d.totalPay + Math.abs(d.advThisMonth) - d.advanceOffset - d.statFromSurplus)
          const totalAdvBox = r2(Math.abs(d.advThisMonth) + d.advStatAmount + d.allowStatAmount - d.statFromSurplus)
          // Net exceed reaching the payout (after offset + surplus-paid statutory).
          const netExceed = r2(d.vrKpi - d.advanceOffset - d.statFromSurplus)

          const advAdj = billingDeductAdjustment(d.id, m.id, results)
          const adjAccum = r2(d.accumulated + advAdj)
          const accumBill = r2(
            Math.max(0, billingAccum(d.id, m.id, results, data.dirInputs, data.settings) - contraOffset(d.id, m.id, results, data.contra)),
          )
          const accumSave = savingAccum(d.id, m.id, results, data.dirInputs)
          // Card sub-notes show THIS MONTH's events only, synced with the Flow
          // screen (user ruling 2026-07-31; were cumulative-to-date). The card
          // VALUES stay accumulated as-of.
          const monthWd = r2(inp.savingWithdrawal ?? 0)
          const monthDeduct = d.billingDeduct
          const monthAdvStat = r2(d.advStatAmount)
          const monthAllowStat = r2(d.allowStatAmount)
          // Only the statutory that actually entered the debt.
          const monthStatAll = r2(monthAdvStat + monthAllowStat - d.statFromSurplus)
          const contraOff = contraOffset(d.id, m.id, results, data.contra)
          // Note shows only on the month the contra was executed from —
          // synced with the Flow screen (user ruling 2026-07-31).
          const contraFromThisMonth = data.contra.some((ev) => ev.directorId === d.id && ev.fromMonthId === m.id)

          return (
            <div key={dir.id} className="dir-page">
              {/* Director header */}
              <div className="dhead">
                <div className="avatar" style={{ backgroundColor: dir.color }}>{dir.code.charAt(0)}</div>
                <div>
                  <div className="nm">{dir.code}</div>
                  <div className="meta">
                    Weight: {d.weight}% · Fixed Salary: RM {fmt(d.dirFixed)}/month · {m.name}
                    {m.fullPayout && ' (Full Payout)'}
                    {m.includeBilling && ' (Incl. Billing)'}
                  </div>
                </div>
              </div>

              {/* Summary boxes — same set and values as the Flow view (user
                  request 2026-07-26: no operators, mirror the screen exactly) */}
              <div className="chain">
                <div className="box hl"><div className="l">Total Gross</div><div className="v">RM {fmt(r2(d.salKpiGross + d.allowGross))}</div></div>
                <div className="box"><div className="l">Total Saving ({sv}%)</div><div className="v">RM {fmt(d.totalSaving)}</div></div>
                {m.fullPayout ? (
                  <div className="box"><div className="l">Balance (100%)</div><div className="v">RM {fmt(d.totalPay)}</div></div>
                ) : (
                  <>
                    {/* Boxes carry the TOTALS incl. keyed statutory — Total 25%
                        Billing Invoice and Total Advance, matching the stream
                        totals (user ruling 2026-07-31, supersedes 07-26). */}
                    <div className="box"><div className="l">{bi}% Billing Invoice</div><div className="v warn">RM {fmt(total25)}</div></div>
                    <div className="box"><div className="l">{gb}% Gross Balance</div><div className="v">RM {fmt(r2(d.salKpiGB + d.allowGB))}</div></div>
                  </>
                )}
                {d.advanceOffset > 0 ? (
                  <div className="box"><div className="l">Vr KPI Offset Advance</div><div className="v neg">RM {fmt(d.advanceOffset)}</div></div>
                ) : totalAdvBox > 0 ? (
                  <div className="box"><div className="l">Advance</div><div className="v neg">RM {fmt(totalAdvBox)}</div></div>
                ) : d.vrKpi > 0 && netExceed > 0 ? (
                  <div className="box"><div className="l">Exceed (KPI)</div><div className="v pos">+ RM {fmt(netExceed)}</div></div>
                ) : null}
                <div className="box hl"><div className="l">HR Payout Before Deduct Statutory</div><div className="v">RM {fmt(totalHRPayout)}</div></div>
              </div>

              {/* Accumulated ledger cards */}
              <div className={`cards${d.advanceSurplus > 0 ? ' four' : ''}`}>
                <div className="card">
                  <div className="l">⚠️ {dir.code} Accumulated Advance</div>
                  <div className={`v${adjAccum < 0 ? ' neg' : ''}`}>{adjAccum < 0 ? '-' : ''}RM {fmt(Math.abs(adjAccum))}</div>
                  <div className="s">
                    As of {m.name}
                    {monthDeduct > 0 && <> (billing deduct: +RM {fmt(monthDeduct)})</>}
                    {monthStatAll > 0 && (
                      <> (incl. statutory RM {fmt(monthStatAll)}{d.statFromSurplus === 0 && monthAdvStat > 0 && monthAllowStat > 0 ? ` : Adv RM ${fmt(monthAdvStat)} + Allow RM ${fmt(monthAllowStat)}` : ''})</>
                    )}
                    {d.prevAccum < 0 && adjAccum === 0 && <span className="pos"> · ✅ Advance cleared</span>}
                  </div>
                </div>
                {d.advanceSurplus > 0 && (
                  <div className="card">
                    <div className="l pos">🎁 Vr KPI Surplus → Allowance</div>
                    <div className="v pos">RM {fmt(d.advanceSurplus)}</div>
                    <div className="s">Prev: -RM {fmt(Math.abs(d.prevAccum))} | Vr KPI: +RM {fmt(d.vrKpi)}</div>
                  </div>
                )}
                <div className="card">
                  <div className="l">📄 {dir.code} Accumulated 25% Billing + Statutory</div>
                  <div className="v">RM {fmt(accumBill)}</div>
                  <div className="s">
                    As of {m.name}
                    {contraFromThisMonth && contraOff > 0 && <span className="neg"> (after contra -RM {fmt(contraOff)})</span>}
                  </div>
                </div>
                <div className="card">
                  <div className="l">💰 {dir.code} Accumulated Saving</div>
                  <div className="v">RM {fmt(accumSave)}</div>
                  <div className="s">
                    As of {m.name}
                    {monthWd > 0 && <span className="neg"> (withdraw: -RM {fmt(monthWd)})</span>}
                  </div>
                </div>
              </div>

              {/* Streams — 2×2 grid */}
              <div className="streams">
                <div className="stream">
                  <div className="hd">💼 Salary + KPI Stream</div>
                  <div className="row"><span>Gross (Sal+KPI Pool × Weight)</span><span className="amt">RM {fmt(d.salKpiGross)}</span></div>
                  <div className="row"><span>Less: Saving ({sv}%)</span><span className="amt">- RM {fmt(d.salKpiSaving)}</span></div>
                  <div className="row b"><span>= Balance ({r2(100 - sv)}%)</span><span className="amt">RM {fmt(d.salKpiBalance)}</span></div>
                  {m.fullPayout ? (
                    <div className="row"><span>💯 Full Payout (100%)</span><span className="amt">RM {fmt(d.salKpiGB)}</span></div>
                  ) : (
                    <>
                      <div className="row"><span>{gb}% → Gross Balance</span><span className="amt">RM {fmt(d.salKpiGB)}</span></div>
                      <div className="row"><span>{bi}% → Billing Invoice</span><span className="amt">RM {fmt(d.salKpiBillInv)}</span></div>
                    </>
                  )}
                </div>
                <div className="stream">
                  <div className="hd">🎁 Allowance Stream</div>
                  {d.allowGross > 0 ? (
                    <>
                      <div className="row"><span>Allowance Gross (Pool × Weight)</span><span className="amt">RM {fmt(d.allowGross)}</span></div>
                      <div className="row"><span>Less: Saving ({sv}%)</span><span className="amt">- RM {fmt(d.allowSaving)}</span></div>
                      <div className="row b"><span>= Allowance Balance ({r2(100 - sv)}%)</span><span className="amt">RM {fmt(d.allowBalance)}</span></div>
                      {m.fullPayout ? (
                        <div className="row"><span>💯 Full Payout (100%)</span><span className="amt">RM {fmt(d.allowGB)}</span></div>
                      ) : (
                        <>
                          <div className="row"><span>{gb}% → Gross Balance</span><span className="amt">RM {fmt(d.allowGB)}</span></div>
                          <div className="row"><span>{bi}% → Billing Invoice</span><span className="amt">RM {fmt(d.allowBillInv)}</span></div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="row"><span>No allowance data this month</span><span className="amt">-</span></div>
                  )}
                </div>
                <div className="stream">
                  <div className="hd">⚠️ Advance Tracking 预支追踪</div>
                  <div className="row"><span>Total Pay</span><span className="amt">RM {fmt(d.totalPay)}</span></div>
                  <div className="row"><span>Fixed Salary</span><span className="amt">RM {fmt(d.dirFixed)}</span></div>
                  <div className="row b"><span>Vr KPI (Total Pay − Fixed)</span><span className={`amt${d.vrKpi < 0 ? ' neg' : d.vrKpi > 0 ? ' pos' : ''}`}>{d.vrKpi < 0 ? '-' : d.vrKpi > 0 ? '+' : ''}RM {fmt(Math.abs(d.vrKpi))}</span></div>
                  {d.advanceOffset > 0 && (
                    <div className="row pos"><span>Less: Vr KPI Offset Advance (抵消预支)</span><span className="amt">- RM {fmt(d.advanceOffset)}</span></div>
                  )}
                  {d.advStatAmount > 0 && (
                    <div className="row neg"><span>+ Advance Statutory (自己填)</span><span className="amt">+ RM {fmt(d.advStatAmount)}</span></div>
                  )}
                  {d.allowStatAmount > 0 && (
                    <div className="row warn"><span>+ 75% Allow Statutory (自己填)</span><span className="amt">+ RM {fmt(d.allowStatAmount)}</span></div>
                  )}
                  {d.statFromSurplus > 0 && (
                    <div className="row pos"><span>Less: Statutory 由 Vr KPI 超额支付 (从 payout 扣)</span><span className="amt">- RM {fmt(d.statFromSurplus)}</span></div>
                  )}
                  {d.statFromSurplus > 0 && netExceed > 0 && (
                    <div className="row b pos"><span>Balance Advance (超额结余 → Payout)</span><span className="amt">+ RM {fmt(netExceed)}</span></div>
                  )}
                  {totalAdvBox > 0 && (
                    <div className="row b neg"><span>Total Advance</span><span className="amt">RM {fmt(totalAdvBox)}</span></div>
                  )}
                </div>
                {!m.fullPayout ? (
                  <div className="stream">
                    <div className="hd">📄 25% Billing Invoice + Statutory</div>
                    <div className="row sec"><span>── Salary + KPI ──</span></div>
                    <div className="row"><span>{bi}% Invoice (Salary Pay)</span><span className="amt">RM {fmt(d.salKpiBillInv)}</span></div>
                    <div className="row"><span>{bi}% Statutory (Sal+KPI 自己填)</span><span className="amt">RM {fmt(statSalVal)}</span></div>
                    <div className="row sec"><span>── Allowance ──</span></div>
                    <div className="row"><span>{bi}% Invoice (Allowance)</span><span className="amt">{d.allowGross > 0 ? `RM ${fmt(d.allowBillInv)}` : '-'}</span></div>
                    {sas && (
                      <div className="row"><span>{bi}% Statutory (Allow 自己填)</span><span className="amt">RM {fmt(statAlVal)}</span></div>
                    )}
                    <div className="row b pos"><span>Total {bi}% Billing Invoice</span><span className="amt">RM {fmt(total25)}</span></div>
                    {m.billingDeductAdv && (totalAdvBox > 0 || d.billingDeduct > 0) && (
                      <>
                        <div className="row neg"><span>(-) Total Advance Deduct{totalAdvBox > total25 ? ' (capped at billing)' : ''}</span><span className="amt">- RM {fmt(d.billingDeduct)}</span></div>
                        {d.billingDeduct > totalAdvBox && (
                          <div className="row pos"><span>↳ 含还旧账 (Old Advance Repaid)</span><span className="amt">RM {fmt(r2(d.billingDeduct - totalAdvBox))}</span></div>
                        )}
                        {totalAdvBox > d.billingDeduct && (
                          <div className="row neg"><span>⚠️ Remaining → Accum. Advance</span><span className="amt">RM {fmt(r2(totalAdvBox - d.billingDeduct))}</span></div>
                        )}
                        <div className="row b warn"><span>Net {bi}% Billing</span><span className="amt">RM {fmt(r2(Math.max(0, total25 - d.billingDeduct)))}</span></div>
                      </>
                    )}
                    <div className="row b"><span>→ Payout as Allowance</span><span className="amt">{m.includeBilling ? `RM ${fmt(billingVal)}` : '不算进'}</span></div>
                  </div>
                ) : (
                  <div className="stream">
                    <div className="hd">📌 Notes</div>
                    <div className="row"><span>💯 Full Payout month — 100% Balance paid out, no {gb}/{bi} split, no Billing Invoice.</span></div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

      <div className="footer">
        Generated {generated} · HOUZS Venture Portal — Director Pool Calculator · Settings: Fixed RM {fmt(data.settings.fixedSalary)} / Saving {sv}% / Split {gb}/{bi}
      </div>
    </div>
  )
}
