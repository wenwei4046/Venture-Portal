"use client";
import { useState } from "react";
import { fixedSlot, pointsAt, MARGIN_TIER_POINTS, KPI_INCENTIVE_POINTS } from "./arena-model";
import s from "./ArenaScoreSimulator.module.css";
export default function ArenaScoreSimulator() {
  const [weeks, setWeeks] = useState(4);
  const [akemiWeeks, setAkemiWeeks] = useState(3);
  const [akemiRank, setAkemiRank] = useState(3);
  const [zanottiRank, setZanottiRank] = useState(8);
  const [kpiHit, setKpiHit] = useState(true);
  const akemiPoints = pointsAt(akemiRank);
  const zanottiPoints = pointsAt(zanottiRank);
  const mixed = fixedSlot([{ weight: akemiWeeks, base: akemiPoints }, { weight: weeks - akemiWeeks, base: zanottiPoints }]);
  const score = (value: number) => Number(value.toFixed(2)).toString();
  const sharedRecordAward = pointsAt(21);
  const sellerA = pointsAt(1) * 3 + pointsAt(4) * 2 + pointsAt(5) + sharedRecordAward;
  const sellerB = pointsAt(2) * 3 + pointsAt(3) * 3 + sharedRecordAward + (kpiHit ? KPI_INCENTIVE_POINTS : 0);
  const rankOptions = Array.from({ length: 26 }, (_, index) => index + 1);
  return <div className={s.simulator}>
    <p className={s.intro}>One monthly brand allowance, shared across your assignments. This example applies separately to Sales by Brand and Margin by Brand.</p>
    <section className={s.controls} aria-label="Assignment assumptions">
      <label>Your monthly schedule<select aria-label="Monthly fair count" value={weeks} onChange={e => { const count = Number(e.target.value); setWeeks(count); setAkemiWeeks(Math.min(akemiWeeks, count)); }}><option value={4}>4 weeks · 4 personal fairs</option><option value={5}>5 weeks · 5 personal fairs</option></select></label>
      <label>Your Akemi weeks <strong>{akemiWeeks} / {weeks}</strong><input aria-label="Your Akemi weeks" type="range" min="0" max={weeks} value={akemiWeeks} onChange={e => setAkemiWeeks(Number(e.target.value))} /></label>
      <label>Akemi rank<select value={akemiRank} onChange={e => setAkemiRank(Number(e.target.value))}>{rankOptions.map(rank => <option key={rank} value={rank}>#{rank} · {pointsAt(rank)} rank pts</option>)}</select></label>
      <label>Zanotti rank<select value={zanottiRank} onChange={e => setZanottiRank(Number(e.target.value))}>{rankOptions.map(rank => <option key={rank} value={rank}>#{rank} · {pointsAt(rank)} rank pts</option>)}</select></label>
      <p>Your remaining {weeks - akemiWeeks} week(s) are Zanotti. Shares use the weeks you save in My brand weeks. 26 salespeople compete; the two Revenue Directors are excluded. Each person attends at most one fair per week.</p>
    </section>
    <section className={s.result} aria-live="polite" aria-label="Brand contribution comparison">
      <span>Base contribution to Championship</span><h2>{score(mixed.total)} points, one allowance</h2>
      <div className={s.player}><span>Your mixed roster<strong>{score(mixed.total)} pts</strong></span><div><i style={{ width: `${mixed.total / pointsAt(1) * 100}%` }} /></div><small>{akemiPoints} × {score(akemiWeeks / weeks * 100)}% + {zanottiPoints} × {score((weeks - akemiWeeks) / weeks * 100)}% = {score(mixed.total)}</small></div>
      <div className={s.player} data-rival><span>One brand · rank #{akemiRank}<strong>{akemiPoints} pts</strong></span><div><i style={{ width: `${akemiPoints / pointsAt(1) * 100}%` }} /></div><small>{akemiPoints} × 100% = {akemiPoints}. This seller spends all {weeks} weeks on one brand.</small></div>
      <p>{mixed.total === akemiPoints ? "Both contribute the same points." : mixed.total > akemiPoints ? `The mixed roster contributes ${score(mixed.total - akemiPoints)} more because the second brand has a stronger rank award.` : `The mixed roster contributes ${score(akemiPoints - mixed.total)} fewer points.`} This compares given ranks, not predicted results. More assigned brands do not increase the {pointsAt(1)}-point base allowance.</p>
      <p>Margin tier bonuses follow the same shares: 75% at Tier 2 (+{MARGIN_TIER_POINTS[2]}) and 25% at Tier 1 (+{MARGIN_TIER_POINTS[1]}) add {score(fixedSlot([{ weight: 3, base: 0, incentive: MARGIN_TIER_POINTS[2] }, { weight: 1, base: 0, incentive: MARGIN_TIER_POINTS[1] }]).total)} in total. The comparison above excludes all bonuses.</p>
    </section>
    <section className={s.controls} aria-label="Overtake across disciplines"><h2>A different route to first</h2><p>Seller A leads the three Sales contributions. Seller B stays close in Sales and earns stronger Margin and KPI results.</p>
      <table className={s.comparison}><thead><tr><th>Points</th><th>Seller A</th><th>Seller B</th></tr></thead><tbody>
        <tr><td>Sales · brands</td><td>{pointsAt(1)}</td><td>{pointsAt(2)}</td></tr><tr><td>Fair placings</td><td>{pointsAt(1)}</td><td>{pointsAt(2)}</td></tr><tr><td>Total sales</td><td>{pointsAt(1)}</td><td>{pointsAt(2)}</td></tr><tr><td>Margin · brands</td><td>{pointsAt(4)}</td><td>{pointsAt(3)}</td></tr><tr><td>Total margin</td><td>{pointsAt(4)}</td><td>{pointsAt(3)}</td></tr><tr><td>KPI quantity</td><td>{pointsAt(5)}</td><td>{pointsAt(3)}</td></tr><tr><td>Highest Fair Record</td><td>{sharedRecordAward}</td><td>{sharedRecordAward}</td></tr><tr><td>KPI incentive</td><td>0</td><td>{kpiHit ? KPI_INCENTIVE_POINTS : 0}</td></tr><tr><th>Total</th><th>{score(sellerA)}</th><th>{score(sellerB)}</th></tr>
      </tbody></table>
      <label>Seller B hits monthly KPI threshold<select value={kpiHit ? "yes" : "no"} onChange={e => setKpiHit(e.target.value === "yes")}><option value="yes">Yes · +{KPI_INCENTIVE_POINTS} once</option><option value="no">Not yet · +0</option></select></label>
      <p aria-live="polite">{kpiHit ? `Seller B reaches ${score(sellerB)} and leads by ${score(sellerB - sellerA)}, without winning any Sales contribution.` : `Seller B has ${score(sellerB)} and is only ${score(sellerA - sellerB)} points behind.`} Illustrative monthly results; all other bonuses are assumed zero.</p>
      <p>Both sellers have positive historical records in the 21+ rank band, which awards {sharedRecordAward} points at every qualifying place in that band. They need not share the same rank. Their equal record awards leave the comeback gap unchanged.</p>
      <p>Four weekly second places give Fair placings ({Array(4).fill(pointsAt(2)).join(" + ")}) ÷ 4 = {pointsAt(2)}, only {score(pointsAt(1) - pointsAt(2))} behind four wins. In a five-week month, five second places still give {pointsAt(2)}. The company event count never enters this calculation.</p>
    </section>
    <section className={s.controls}><h2>How the points add up</h2><p>Sales = brand contribution + Fair placings contribution + total-sales points.</p><p>Margin = brand contribution + total-margin points + monthly tier incentives.</p><p>KPI = quantity-rank points + monthly threshold incentive.</p><p>Highest Fair Record = the monthly closing rank award for your all-time best single completed fair. An untied first place earns {pointsAt(1)} points again next month if still first. The sales record itself is never accumulated across fairs.</p><p>Championship = Sales + Margin + KPI + Highest Fair Record. Four brands share one brand score slot; more brands never create four full slots. Fair assignments share one Fair placings slot. Quarter and Annual sum the monthly awards; later records do not rewrite an earlier closed month.</p></section>
    <p className={s.intro}>This prevents duplicate brand awards. It cannot equalise brand size, time available to build monthly sales, or competitor strength. Report the weeks you actually worked across all brands. Known assigned zero activity stays in the share with zero points; missing data remains pending.</p>
  </div>;
}
