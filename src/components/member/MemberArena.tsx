"use client";

import { useEffect, useRef, useState } from "react";
import { formatIntlDate } from "@/lib/utils";
import { fetchMemberArena, saveMemberArenaBrandWeeks, savePrincipalArenaBrandWeeks } from "@/app/(member)/member/arena-actions";
import { arenaBrandWeeksFrom, arenaIncentive, arenaMonthFridays, arenaRankings, arenaShortDay, arenaWeekendLabel, closedWeekChanged, ARENA_WEEK_BRANDS, type ArenaBrandWeeks, type ArenaIncentive, type ArenaMetric, type ArenaPerson, type ArenaWeekBrand, type ArenaWeekPicks, type ArenaWindow, type MemberArenaSnapshot, type ArenaRankedPerson } from "@/lib/member/arena";
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

const pickedCount = (period: string, weeks: ArenaBrandWeeks | null) => arenaMonthFridays(period).filter(week => weeks?.picks?.[week]).length;

/**
 * Where each closed week nobody picked was auto-located for this person: the
 * booth they were placed at that week, as the Fair results have it.
 */
function autoLocatedWeeks(data: MemberArenaSnapshot, personId: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const event of data.history?.events ?? []) {
    if (!event.week || !event.brand || !event.locked) continue;
    if (event.people.some(person => person.id === personId && person.confirmed === false)) found.set(event.week, event.brand);
  }
  return found;
}

/**
 * The brand the member worked each week of the month (2026-10-03, user: 排行榜
 * 完全是跟着他自己选的 brand/week 来走的). One choice per fair weekend; the
 * Fair results rank them only at that brand's booth that week. A week closes
 * seven days after its fair (结束之后的一个星期 … 没有填就 closing 了): the
 * member can no longer change it, a week nobody picked is auto-located at the
 * booth with the most bills, and only the back office — the Principal's view
 * of the member — changes it after that.
 */
function BrandWeeks({ data, personId, personName, backOffice, context, onSaved }: {
  data: MemberArenaSnapshot; personId: string; personName: string; backOffice: boolean; context?: MemberReadContext;
  onSaved: (value: ArenaBrandWeeks) => void;
}) {
  const weeks = arenaMonthFridays(data.period);
  const locks = new Map((data.weekLocks ?? []).map(lock => [lock.week, lock]));
  const stored = data.brandWeeks?.picks ?? {};
  const auto = autoLocatedWeeks(data, personId);
  const [draft, setDraft] = useState<ArenaWeekPicks>(() => ({ ...stored }));
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  const picked = weeks.filter(week => draft[week]).length;
  const open = weeks.filter(week => !locks.get(week)?.locked).length;
  return <form className={s.weeks} onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    const closed = backOffice ? null : closedWeekChanged(draft, stored, data.weekLocks ?? []);
    if (closed) { setFeedback(`The weekend of ${arenaWeekendLabel(closed)} has closed — only the back office can change it now.`); return; }
    setBusy(true); setFeedback("");
    try {
      const result = backOffice && context
        ? await savePrincipalArenaBrandWeeks(data.membershipId, data.period, draft, context)
        : await saveMemberArenaBrandWeeks(data.membershipId, data.period, draft);
      if (result.ok) { onSaved(arenaBrandWeeksFrom(data.period, draft)); setFeedback(backOffice ? `${personName}’s brand weeks are saved.` : "Your brand weeks are saved."); }
      else setFeedback(result.error);
    } catch { setFeedback("The weeks could not be saved. Please try again."); } finally { setBusy(false); }
  }}>
    {backOffice
      ? <><h2>{personName}</h2><p>Back office · any week can be changed here, closed ones too. The member picks their own weeks until seven days after each fair.</p></>
      : <p>Pick the brand you worked each week. Fair results rank you at that brand’s booth only — bills you write at another booth that week still count in your sales. Each week stays open until seven days after its fair.</p>}
    <fieldset disabled={busy}><legend>Weeks this month</legend>
      {weeks.map((week, index) => {
        const lock = locks.get(week);
        const closed = lock?.locked === true;
        const state = !lock ? "" : !closed ? `Open until ${arenaShortDay(lock.closesOn)}`
          : stored[week] ? `Closed ${arenaShortDay(lock.closesOn)}`
            : auto.get(week) ? `Closed ${arenaShortDay(lock.closesOn)} · auto-located: ${auto.get(week)}` : `Closed ${arenaShortDay(lock.closesOn)} · not picked`;
        return <label className={s.weekRow} key={week} data-closed={closed || undefined}>
          <span><strong>Week {index + 1}</strong><small>Weekend of {arenaWeekendLabel(week)}</small>{state && <small>{state}</small>}</span>
          <select aria-label={`Brand for week ${index + 1}`} value={draft[week] ?? ""} disabled={closed && !backOffice} onChange={event => {
            const brand = event.target.value as ArenaWeekBrand | "";
            setDraft(value => ({ ...value, [week]: brand || undefined })); setFeedback("");
          }}><option value="">Not picked</option>{ARENA_WEEK_BRANDS.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}</select></label>;
      })}
    </fieldset>
    <p>{picked} of {weeks.length} weeks picked{!backOffice && open > 0 && picked < weeks.length ? " · A week not picked counts the booth with the most bills — unconfirmed until it closes, then auto-located." : ""}</p>
    {(backOffice || open > 0) && <button className={s.primary} disabled={busy}>{busy ? "Saving…" : "Save brand weeks"}</button>}
    {!backOffice && open === 0 && <p>Every week of this month has closed. Ask the back office to change one.</p>}
    {feedback && <p role="status" aria-label="Brand weeks save status">{feedback}</p>}
  </form>;
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
  return <section className={s.incentive}>
    <div className={s.tier}>
      {blocked ? <><strong>Held, not lost</strong><small>{reason} The rule is that <em>every</em> brand {subject} sold has to clear a tier, so one unjudgeable brand holds the whole incentive. It pays as soon as that bill is costed.</small></>
        : result.earned.length ? <><strong>{result.earned[0].label}</strong><b>{money(result.amount)}</b><small>Cleared by every brand {subject} sold this month{result.earned.length > 1 ? `, and it stacks: ${result.earned.map(tier => tier.label).join(" + ")}` : ""}.</small></>
          : <><strong>No tier yet</strong><small>{binding ? `${brandLabel(binding.brand)} is ${points(binding.next!.gap)} short of ${binding.next!.label} (${percent(binding.next!.marginPct)}), and every brand has to clear it.` : "No rung is within reach from this month's margin."}</small></>}
    </div>
    <div className={s.sectionHead}><h2>Brand by brand</h2><span>{result.brands.length} brand{result.brands.length === 1 ? "" : "s"}</span></div>
    {result.brands.map(brand => {
      const cleared = ladder.filter(tier => tier.brand === brand.brand && brand.cleared.includes(tier.bandKey)).sort((a, b) => b.marginPct - a.marginPct)[0];
      return <div className={s.brandRow} key={brand.brand} data-blocked={brand.marginPct === null || undefined}>
        <strong>{brandLabel(brand.brand)}</strong>
        <b>{brand.marginPct === null ? `${brand.blindOrders || "Some"} bill${brand.blindOrders === 1 ? "" : "s"} without cost` : percent(brand.marginPct)}</b>
        <small>{brand.marginPct === null
          ? brand.brand === "UNCLASSIFIED" ? "Give this bill a brand and it joins that brand's ladder." : "Its margin cannot be worked out until every bill of it has a cost."
          : `${cleared ? `Clears ${cleared.label}` : "Below the first rung"}${brand.next ? ` · ${points(brand.next.gap)} to ${brand.next.label} (${percent(brand.next.marginPct)})` : " · top rung"} · ${money(brand.revenue)} of goods`}</small>
      </div>;
    })}
    <details className={s.basis}><summary>How the incentive is judged</summary>
      <p>Each brand&apos;s margin is blended across the month&apos;s deposit-cleared, commissionable bills, on the Revenue Team cost basis — the same figure the commission run pays on, not the company&apos;s own margin.</p>
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
  const guessed = events.filter(event => event.rows.some(row => row.id === viewedId && row.unconfirmed)).length;
  const autoLocated = events.filter(event => event.rows.some(row => row.id === viewedId && row.autoLocated)).length;
  const offWeek = history.offWeekOrders ?? 0;
  return <section className={s.availability}>
    {events.length
      ? <ArenaFairResults events={events} people={data.people.map(person => ({ id: person.id, name: person.name }))}
          cutoff={data.through} period={window} periodLabel={periodLabel} selfId={viewedId} selfLabel={selfLabel}
          personalLabel={readOnly ? `${viewedName}’s` : "Your"} provisional />
      : <p>No fair on the calendar closed inside {periodLabel}.</p>}
    {guessed > 0 && <p className={s.message}>{guessed} of {readOnly ? `${viewedName}’s` : "your"} fair finishes {guessed === 1 ? "is" : "are"} placed by the booth with the most bills that week, because no brand is picked for {guessed === 1 ? "that week" : "those weeks"} yet. {readOnly ? "The member picks" : "Pick"} the brand of each week in {readOnly ? "Member" : "My"} brand weeks before it closes, seven days after the fair.</p>}
    {autoLocated > 0 && <p className={s.message}>{autoLocated} of {readOnly ? `${viewedName}’s` : "your"} fair finishes {autoLocated === 1 ? "was" : "were"} auto-located: no brand was picked before the week closed, so the booth with the most bills that week counts. {readOnly ? "Change it in Member brand weeks if it is wrong." : "Only the back office can change it now."}</p>}
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
  /**
   * A saved brand week moves the Fair results: read them again without
   * blanking the page, so the form keeps its "saved" line. A newer read wins.
   */
  function reloadQuietly() {
    // Not a new load of its own: a month or member chosen meanwhile starts one,
    // and that one wins.
    const sequence = request.current;
    const pending = contextStaffId !== undefined && contextDepartmentId !== undefined
      ? fetchMemberArena(membershipId, period, window, { staffId: contextStaffId, subDepartmentId: contextDepartmentId })
      : fetchMemberArena(membershipId, period, window);
    void pending.then(result => { if (request.current === sequence && result.ok) setData(result.data); }).catch(() => {});
  }
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
        {window === "monthly" && <button className={s.feature} onClick={() => go("weeks")}><span><strong>{readOnly ? "Member brand weeks" : "My brand weeks"}</strong><small>{`${pickedCount(data.period, data.brandWeeks)} of ${arenaMonthFridays(data.period).length} weeks picked`}</small></span><Icon name="arrow" /></button>}</>}
      {selected && <>{selected.id !== "kpi" && <label className={s.brand}>Ranking by<select value={brand} onChange={event => setBrand(event.target.value)}><option value="">All brands · Total</option>{brands.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>}
        <Leaders rows={rankings} metric={selected.id} selfId={viewedId} readOnly={readOnly} onOpen={() => { setShowAll(true); requestAnimationFrame(() => table.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })); }} />
        {me && <section className={s.personal}><span>{readOnly ? `${viewedName} · Result` : "Your result"}</span><div><strong>{me.position ? `Rank ${me.position}` : "Not ranked"}</strong><b>{format(selected.id, me.value)}</b></div>{me.pending && <p>Waiting for complete {selected.id === "margin" ? "cost" : "sales"} data.</p>}</section>}
        <section className={s.standings} ref={table}><div className={s.sectionHead}><h2>{brand ? "Brand ranking" : "Full ranking"}</h2><span>{rankings.length} people</span></div>
          <ol>{(showAll ? rankings : rankings.slice(0, 10)).map(row => <li key={row.id} data-self={row.id === viewedId || undefined}><span data-place={row.position !== null && row.position <= 3 ? row.position : undefined}>{row.position ?? "—"}</span><span className={s.avatar}>{initials(row.name)}</span><span><strong>{row.name}</strong>{row.id === viewedId && <small>{readOnly ? "Selected" : "You"}</small>}{row.pending && <small>Pending data</small>}</span><b>{format(selected.id, row.value)}</b></li>)}</ol>
          {!rankings.length && <p>No people in this department yet.</p>}{!showAll && rankings.length > 10 && <button className={s.textLink} onClick={() => setShowAll(true)}>View all {rankings.length} people<Icon name="arrow" /></button>}
        </section></>}
      {/* The member's own weeks — or, in the Principal's view of a member, the back office's (2026-10-03). */}
      {view === "weeks" && <BrandWeeks key={`${membershipId}-${period}-${viewedId}`} data={data} personId={viewedId} personName={viewedName}
        backOffice={readOnly} context={context} onSaved={value => { setData(previous => previous ? { ...previous, brandWeeks: value } : previous); reloadQuietly(); }} />}
      {view === "incentive" && <Incentive person={data.people.find(person => person.id === viewedId)} tiers={data.tiers} readOnly={readOnly} name={viewedName} />}
      {view === "availability" && <FairHistory data={data} viewedId={viewedId} viewedName={viewedName} readOnly={readOnly} window={window} periodLabel={periodTitle} />}
      {view !== "weeks" && view !== "incentive" && <details className={s.basis}><summary>How these rankings are measured</summary><p>Deposit-cleared commissionable sales and KPI items. Each order is counted once in its released commission month; unreleased orders are shown in the current open month. Quarterly and Annual aggregate those months.</p><p>Margin uses commissionable goods revenue and cost together. A salesperson with incomplete cost data stays pending for Margin Ranking. Directors are excluded. These are live performance figures, not a payroll statement.</p></details>}
    </div>}
  </div>;
}
