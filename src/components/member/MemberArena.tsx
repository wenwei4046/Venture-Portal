"use client";

import { useEffect, useRef, useState } from "react";
import { formatIntlDate } from "@/lib/utils";
import { fetchMemberArena } from "@/app/(member)/member/arena-actions";
import { arenaIncentive, arenaMonthFridays, arenaRankings, arenaShortDay, arenaWeekendLabel, ARENA_WEEK_BRANDS, type ArenaIncentive, type ArenaMetric, type ArenaPerson, type ArenaWindow, type MemberArenaSnapshot, type ArenaRankedPerson } from "@/lib/member/arena";
import { Icon, initials } from "./MemberUI";
import { ArenaPodium } from "./design-preview/ArenaPodium";
import { ArenaFairResults } from "./design-preview/ArenaFairResults";
import { RankingList } from "./design-preview/ArenaRankingList";
import { arenaFairEvents, arenaFairRecords } from "@/lib/member/arena-history";
import type { Standing } from "./design-preview/arena-model";
import type { MemberReadContext } from "@/lib/member/types";
import s from "./MemberArena.module.css";

const metrics = [{ id: "sales", label: "Sales Ranking", icon: "chart", subtitle: "Total sales & by brand" },
  { id: "margin", label: "Margin Ranking", icon: "target", subtitle: "Margin achieved & by brand" },
  { id: "kpi", label: "KPI Ranking", icon: "receipt", subtitle: "KPI items sold" }] as const;
const format = (metric: ArenaMetric, value: number | null) => value === null ? "—" : metric === "margin" ? `${value.toFixed(2)}%`
  : metric === "sales" ? `RM ${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value)}` : `${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 3 }).format(value)} items`;
const currentMonth = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date()).slice(0, 7);

function Leaders({ rows, metric, selfId, readOnly, onOpen }: { rows: ArenaRankedPerson[]; metric: ArenaMetric; selfId: string; readOnly: boolean; onOpen: () => void }) {
  // Presentation adapter only: the shared podium reads names, values and places.
  // These placeholders never award points or become a Championship contribution.
  const presentation: Standing[] = rows.map(row => ({ id: row.id, name: row.name, value: row.value ?? 0,
    position: row.position, eligible: row.value !== null && !row.pending, active: row.hasActivity,
    scoringPosition: null, scoringValue: 0, basePoints: 0, incentivePoints: 0, points: 0 }));
  return <ArenaPodium rows={presentation} selfId={selfId} selfLabel={readOnly ? "Selected" : "You"} format={value => format(metric, value)} onOpen={onOpen} />;
}

/** The person's brand weeks of the month by Friday, as the history read them (2026-10-12). */
function brandWeeksOf(data: MemberArenaSnapshot, personId: string) {
  return new Map((data.history?.weeks ?? []).filter(week => !personId || week.staffId === personId).map(week => [week.week, week]));
}
const listedCount = (data: MemberArenaSnapshot, personId: string) => {
  const weeks = brandWeeksOf(data, personId);
  return arenaMonthFridays(data.period).filter(friday => weeks.get(friday)?.source === "erp").length;
};
const brandName = (code: string | null) => ARENA_WEEK_BRANDS.find(brand => brand.code === code)?.name ?? code ?? "No brand";

/**
 * The brand week of each fair weekend of the month — read only since
 * 2026-10-12 (the user: the ERP's Sales Attending fixes where every
 * salesperson works, so nobody picks a brand week any more). The booth the ERP
 * lists them at; a weekend it lists them nowhere, the booth they opened the
 * most bills at. The Fair results earn points at that booth only.
 */
function BrandWeeks({ data, personId, personName, readOnly }: { data: MemberArenaSnapshot; personId: string; personName: string; readOnly: boolean }) {
  const weeks = arenaMonthFridays(data.period);
  const mine = brandWeeksOf(data, personId);
  return <section className={s.weeks} aria-label={readOnly ? `${personName}’s brand weeks` : "My brand weeks"}>
    {readOnly && <h2>{personName}</h2>}
    <p>Where the Houzs ERP’s Sales Attending puts {readOnly ? personName : "you"} each fair weekend. Fair results earn points at that booth only; bills written at another booth still count in sales. A weekend the ERP lists {readOnly ? "them" : "you"} nowhere counts the booth with the most bills. HR changes the attendance in the ERP.</p>
    <ul className={s.weekList}>
      {weeks.map((week, index) => {
        const found = mine.get(week);
        const where = found ? [found.venue, found.organizer].filter(Boolean).join(" · ") : "";
        const state = !found ? "No fair this weekend" : found.source === "erp" ? "From the ERP’s Sales Attending" : "Auto-located · the booth with the most bills";
        return <li className={s.weekRow} key={week} data-closed={found ? undefined : true}>
          <span><strong>Week {index + 1}</strong><small>Weekend of {arenaWeekendLabel(week)}</small><small>{state}</small></span>
          <span><strong>{found ? brandName(found.brand) : "—"}</strong>{where && <small>{where}</small>}</span>
        </li>;
      })}
    </ul>
  </section>;
}

const percent = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;
const points = (fraction: number) => { const value = fraction * 100; return `${value.toFixed(1)} point${Math.abs(value - 1) < .05 ? "" : "s"}`; };
const money = (value: number) => `RM ${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(value)}`;
const brandLabel = (code: string) => code === "UNCLASSIFIED" ? "No brand on the bill" : code;

/**
 * The month's margin incentive for ONE person: which tier it reaches, what is
 * holding it back, and how far the nearest rung is. Deliberately not a
 * ranking — the tier is money, and a board of everybody's tiers would be a
 * board of everybody's pay.
 */
function Incentive({ person, tiers, readOnly, name }: { person?: ArenaPerson; tiers: MemberArenaSnapshot["tiers"]; readOnly: boolean; name: string }) {
  const ladder = tiers ?? [];
  const result: ArenaIncentive | null = person ? arenaIncentive(person, ladder) : null;
  if (!result || !result.brands.length) return <section className={s.incentive}><p className={s.message}>Nothing to judge this month yet — the incentive reads deposit-cleared, commissionable sales.</p></section>;
  const subject = readOnly ? name : "you";
  const blocked = result.blocked;
  const reason = !blocked ? "" : blocked.reason === "no_brand"
    ? `A bill carries no brand at all, so its ladder is unknown.`
    : blocked.reason === "no_cost"
      ? `A ${blocked.brand} bill has no cost yet, so ${blocked.brand} has no margin to judge.`
      : `${blocked.brand} has no incentive ladder in the scheme rules.`;
  // The binding brand is the one furthest from its own next rung: clearing
  // that one is what moves the whole month, because every brand must clear.
  const binding = result.brands.filter(brand => brand.next).sort((a, b) => (b.next!.gap) - (a.next!.gap))[0];
  const given = result.brands.find(brand => brand.noSales);
  return <section className={s.incentive}>
    <div className={s.tier}>
      {blocked ? <><strong>Held, not lost</strong><small>{reason} The rule is that <em>every</em> brand {subject} sold has to clear a tier, so one unjudgeable brand holds the whole incentive. It pays as soon as that bill is costed.</small></>
        : result.earned.length ? <><strong>{result.earned[0].label}</strong><b>{money(result.amount)}</b><small>Cleared by every brand {subject} sold this month{result.earned.length > 1 ? `, and it stacks: ${result.earned.map(tier => tier.label).join(" + ")}` : ""}.</small></>
          : given ? <><strong>No tier yet</strong><small>{`${brandLabel(given.brand)} was given away and not sold this month, so it clears no rung, and every brand has to clear it.`}</small></>
          : <><strong>No tier yet</strong><small>{binding ? `${brandLabel(binding.brand)} is ${points(binding.next!.gap)} short of ${binding.next!.label} (${percent(binding.next!.marginPct)}), and every brand has to clear it.` : "No rung is within reach from this month's margin."}</small></>}
    </div>
    <div className={s.sectionHead}><h2>Brand by brand</h2><span>{result.brands.length} brand{result.brands.length === 1 ? "" : "s"}</span></div>
    {result.brands.map(brand => {
      const cleared = ladder.filter(tier => tier.brand === brand.brand && brand.cleared.includes(tier.bandKey)).sort((a, b) => b.marginPct - a.marginPct)[0];
      return <div className={s.brandRow} key={brand.brand} data-blocked={brand.marginPct === null || undefined}>
        <strong>{brandLabel(brand.brand)}</strong>
        <b>{brand.noSales ? "No sales" : brand.marginPct === null ? `${brand.blindOrders || "Some"} bill${brand.blindOrders === 1 ? "" : "s"} without cost` : percent(brand.marginPct)}</b>
        <small>{brand.noSales ? "Given away, not sold: below the first rung."
          : brand.marginPct === null
          ? brand.brand === "UNCLASSIFIED" ? "Give this bill a brand and it joins that brand's ladder." : "Its margin cannot be worked out until every bill of it has a cost."
          : `${cleared ? `Clears ${cleared.label}` : "Below the first rung"}${brand.next ? ` · ${points(brand.next.gap)} to ${brand.next.label} (${percent(brand.next.marginPct)})` : " · top rung"} · ${money(brand.revenue)} of goods`}</small>
      </div>;
    })}
    <details className={s.basis}><summary>How the incentive is judged</summary>
      <p>Each brand&apos;s margin is blended across the month&apos;s deposit-cleared, commissionable bills — the same figure the commission run pays on.</p>
      <p>Thresholds follow the brand and are not the same for all of them. A tier counts only when <em>every</em> brand sold that month clears it, and the tiers earned stack. A brand with a bill that has no cost, or a bill with no brand at all, holds the whole incentive until it is fixed.</p>
    </details>
  </section>;
}

const fairDay = arenaShortDay;
const fairRange = (start: string, end: string) => start === end ? fairDay(start) : `${fairDay(start)} – ${fairDay(end)}`;

/**
 * Completed fairs, ranked. Reported, never awarded: there is no championship
 * ledger yet, and a recorded sale is not attendance — somebody who worked a
 * fair and sold nothing cannot be told apart here from somebody who was never
 * there. A bill that no fair could claim is missing information rather than a
 * zero, so it is counted out loud instead of being spread over the fairs that
 * did happen.
 */
function FairHistory({ data, viewedId, viewedName, readOnly, window, periodLabel }: {
  data: MemberArenaSnapshot; viewedId: string; viewedName: string; readOnly: boolean; window: ArenaWindow; periodLabel: string;
}) {
  const history = data.history;
  if (!history) return <section className={s.availability}><Icon name="trophy" size={32} /><h2>Fair history is not connected yet</h2>
    <p>{data.historyError ?? "Weekly finishes and Highest Fair Record need each fair’s venue, start date and end date."}</p>
    <h2>Championship</h2><p>{readOnly ? "Members can save their own brand weeks now." : "Your brand weeks can be saved now."} Championship totals will appear after all ranking sources and the scoring ledger are connected.</p>
    <p>Sales, Margin and KPI rankings already use {readOnly ? "the selected" : "your"} department’s real data.</p></section>;
  const events = arenaFairEvents(history, data.from, data.through);
  const records = arenaFairRecords(history);
  const selfLabel = readOnly ? "Selected" : "You";
  // A finish placed by guess (no brand picked for that week) says so: still
  // open to pick, or auto-located now that the week has closed.
  const autoLocated = events.filter(event => event.rows.some(row => row.id === viewedId && row.autoLocated)).length;
  const offWeek = history.offWeekOrders ?? 0;
  return <section className={s.availability}>
    {events.length
      ? <ArenaFairResults events={events} people={data.people.map(person => ({ id: person.id, name: person.name }))}
          cutoff={data.through} period={window} periodLabel={periodLabel} selfId={viewedId} selfLabel={selfLabel}
          personalLabel={readOnly ? `${viewedName}’s` : "Your"} provisional />
      : <p>No fair on the calendar closed inside {periodLabel}.</p>}
    {autoLocated > 0 && <p className={s.message}>{autoLocated} of {readOnly ? `${viewedName}’s` : "your"} fair finishes {autoLocated === 1 ? "was" : "were"} auto-located: the ERP’s Sales Attending lists {readOnly ? "them" : "you"} at no booth {autoLocated === 1 ? "that weekend" : "those weekends"}, so the booth with the most bills counts. HR changes it in the ERP.</p>}
    {records.length > 0 && <RankingList heading="Highest Fair Record" format={money} points={false}
      unrankedLabel="No record yet" selfId={viewedId} selfLabel={selfLabel} rows={records.map(record => ({
        id: record.id, name: record.name, value: record.value ?? Number.NaN, eligible: !record.pending, active: true,
        position: record.position, scoringPosition: null, scoringValue: 0, basePoints: 0, incentivePoints: 0, points: 0,
        note: `${record.brand ? `${record.brand} · ` : ""}${record.venue} · ${fairRange(record.start, record.end)}`,
      }))} />}
    {offWeek > 0 && <p className={s.message}>{money(history.offWeekSales ?? 0)} over {offWeek} bill{offWeek === 1 ? " was" : "s were"} written at another booth than the seller’s brand week, or at a second fair the same week. They are ranked on that booth’s board like any other sale and earn no points there — only the brand week’s booth scores.</p>}
    {history.unassignedOrders > 0 && <p className={s.message}>{money(history.unassignedSales)} over {history.unassignedOrders} bill{history.unassignedOrders === 1 ? "" : "s"} sits on no fair yet — a place the calendar has no dates for cannot claim its bills. Those sales still count in the rankings; only the finishes wait.</p>}
    <h2>Championship</h2><p>{history.championship.reason}</p>
  </section>;
}

export default function MemberArena({ membershipId, context }: { membershipId: string; context?: MemberReadContext }) {
  const [period, setPeriod] = useState(currentMonth), [window, setWindow] = useState<ArenaWindow>("monthly");
  const [view, setView] = useState<"home" | ArenaMetric | "weeks" | "availability" | "incentive">("home");
  const [brand, setBrand] = useState("");
  const [data, setData] = useState<MemberArenaSnapshot | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [showAll, setShowAll] = useState(false);
  const request = useRef(0), table = useRef<HTMLElement>(null);
  const contextStaffId = context?.staffId, contextDepartmentId = context?.subDepartmentId;
  useEffect(() => {
    const sequence = ++request.current;
    let active = true;
    setBusy(true); setError(""); setData(null);
    const pending = contextStaffId !== undefined && contextDepartmentId !== undefined
      ? fetchMemberArena(membershipId, period, window, { staffId: contextStaffId, subDepartmentId: contextDepartmentId })
      : fetchMemberArena(membershipId, period, window);
    void pending.then(result => {
      if (!active || request.current !== sequence) return;
      if (result.ok) setData(result.data); else setError(result.error);
    }).catch(() => { if (active && request.current === sequence) setError("Arena could not be loaded. Please try again."); })
      .finally(() => { if (active && request.current === sequence) setBusy(false); });
    return () => { active = false; };
  }, [membershipId, period, window, revision, contextStaffId, contextDepartmentId]);
  useEffect(() => { setView("home"); setBrand(""); setShowAll(false); }, [membershipId, context?.staffId]);
  const readOnly = !!context || !!data?.principalView;
  const viewedId = context?.staffId ?? data?.viewedStaffId ?? data?.selfId ?? "";
  const viewedName = data?.people.find(person => person.id === viewedId)?.name ?? "Selected member";
  const selected = metrics.find(metric => metric.id === view);
  const rankings = selected && data ? arenaRankings(data.people, selected.id, selected.id !== "kpi" && brand ? brand : undefined) : [];
  const me = rankings.find(row => row.id === viewedId);
  const brands = data ? [...new Map([...data.people.flatMap(person => Object.keys(person.brands).map(code => ({ code, name: code === "UNCLASSIFIED" ? "Unclassified" : code }))), ...data.brands].map(item => [item.code, item])).values()] : [];
  function go(next: typeof view) { setView(next); setBrand(""); setShowAll(false); }
  const periodTitle = data ? `${data.from} – ${data.through}` : period;
  const fairsClosed = data?.history ? arenaFairEvents(data.history, data.from, data.through).length : null;

  return <div className={s.arena} data-arena-design="c">
    <header className={s.heading}>{view !== "home" && <button className={s.back} onClick={() => go("home")}><Icon name="back" size={19} />Arena</button>}
      <h1>{selected?.label ?? (view === "weeks" ? readOnly ? "Member brand weeks" : "My brand weeks" : view === "availability" ? "Championship & Fair results" : view === "incentive" ? "Margin Incentive" : "Arena")}</h1>
      <p>{view === "home" ? readOnly ? `${viewedName} · Performance and rankings` : "Your performance. Your next milestone." : data?.department}</p>
    </header>
    <div className={s.controls}><div className={s.segments} role="group" aria-label="Ranking period">{(["monthly", "quarterly", "annual"] as const).map(value => <button key={value} aria-pressed={window === value} onClick={() => { setWindow(value); if (view === "weeks") setView("home"); }}>{value === "monthly" ? "Monthly" : value === "quarterly" ? "Quarterly" : "Annual"}</button>)}</div>
      <label>Month<input type="month" value={period} max={currentMonth()} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setPeriod(event.target.value); }} /></label>
      {data && <p className={s.periodLabel}>{periodTitle}{data.live ? " · Live" : ""}</p>}
      {data && <div className={s.refresh}><span>Updated {formatIntlDate(new Date(data.asOf), { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" })}</span><button className={s.back} onClick={() => setRevision(value => value + 1)} disabled={busy}><Icon name="refresh" size={16} />Refresh</button></div>}
    </div>
    {busy ? <p className={s.message} role="status">Loading your rankings…</p> : error ? <div className={s.message} role="alert"><p>{error}</p><button className={s.primary} onClick={() => setRevision(value => value + 1)}>Try again</button></div> : data && <div key={`${view}-${window}-${period}-${brand}`} className={s.page}>
      {view === "home" && <><div className={s.overview}>{metrics.map(metric => {
        const own = arenaRankings(data.people, metric.id).find(row => row.id === viewedId);
        return <button key={metric.id} className={s.metric} data-metric={metric.id} onClick={() => go(metric.id)}><span className={s.metricIcon}><Icon name={metric.icon} size={28} /></span><span><strong>{metric.label}</strong><small>{metric.subtitle}</small><b>{format(metric.id, own?.value ?? null)}</b></span><span className={s.ownRank}>{own?.position ? `#${own.position}` : "—"}<Icon name="arrow" size={17} /></span></button>;
      })}</div>{window === "monthly" && <button className={s.feature} onClick={() => go("incentive")}><span><strong>Margin Incentive</strong><small>{readOnly ? `${viewedName}'s tier this month, brand by brand` : "Your tier this month, brand by brand"}</small></span><Icon name="arrow" /></button>}
        <button className={s.feature} onClick={() => go("availability")}><span><strong>Championship & Fair results</strong><small>{fairsClosed === null ? "Scoreboard and fair history setup" : `${fairsClosed} completed booth${fairsClosed === 1 ? "" : "s"} · Highest Fair Record`}</small></span><Icon name="arrow" /></button>
        {window === "monthly" && <button className={s.feature} onClick={() => go("weeks")}><span><strong>{readOnly ? "Member brand weeks" : "My brand weeks"}</strong><small>{`${listedCount(data, viewedId)} of ${arenaMonthFridays(data.period).length} weeks from the ERP`}</small></span><Icon name="arrow" /></button>}</>}
      {selected && <>{selected.id !== "kpi" && <label className={s.brand}>Ranking by<select value={brand} onChange={event => setBrand(event.target.value)}><option value="">All brands · Total</option>{brands.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>}
        <Leaders rows={rankings} metric={selected.id} selfId={viewedId} readOnly={readOnly} onOpen={() => { setShowAll(true); requestAnimationFrame(() => table.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })); }} />
        {me && <section className={s.personal}><span>{readOnly ? `${viewedName} · Result` : "Your result"}</span><div><strong>{me.position ? `Rank ${me.position}` : "Not ranked"}</strong><b>{format(selected.id, me.value)}</b></div>{me.pending && <p>Waiting for complete {selected.id === "margin" ? "cost" : "sales"} data.</p>}</section>}
        <section className={s.standings} ref={table}><div className={s.sectionHead}><h2>{brand ? "Brand ranking" : "Full ranking"}</h2><span>{rankings.length} people</span></div>
          <ol>{(showAll ? rankings : rankings.slice(0, 10)).map(row => <li key={row.id} data-self={row.id === viewedId || undefined}><span data-place={row.position !== null && row.position <= 3 ? row.position : undefined}>{row.position ?? "—"}</span><span className={s.avatar}>{initials(row.name)}</span><span><strong>{row.name}</strong>{row.id === viewedId && <small>{readOnly ? "Selected" : "You"}</small>}{row.pending && <small>Pending data</small>}</span><b>{format(selected.id, row.value)}</b></li>)}</ol>
          {!rankings.length && <p>No people in this department yet.</p>}{!showAll && rankings.length > 10 && <button className={s.textLink} onClick={() => setShowAll(true)}>View all {rankings.length} people<Icon name="arrow" /></button>}
        </section></>}
      {/* The member's own weeks — or, in the Principal's view of a member, the back office's (2026-10-03). */}
      {view === "weeks" && <BrandWeeks key={`${membershipId}-${period}-${viewedId}`} data={data} personId={viewedId} personName={viewedName} readOnly={readOnly} />}
      {view === "incentive" && <Incentive person={data.people.find(person => person.id === viewedId)} tiers={data.tiers} readOnly={readOnly} name={viewedName} />}
      {view === "availability" && <FairHistory data={data} viewedId={viewedId} viewedName={viewedName} readOnly={readOnly} window={window} periodLabel={periodTitle} />}
      {view !== "weeks" && view !== "incentive" && <details className={s.basis}><summary>How these rankings are measured</summary><p>Deposit-cleared commissionable sales and KPI items. Each order is counted once in its released commission month; unreleased orders are shown in the current open month. Quarterly and Annual aggregate those months.</p><p>Margin uses commissionable goods revenue and cost together. A salesperson with incomplete cost data stays pending for Margin Ranking. Directors are excluded. These are live performance figures, not a payroll statement.</p></details>}
    </div>}
  </div>;
}
