"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../MemberUI";
import { RankingList } from "./ArenaRankingList";
import { ArenaRankOverview } from "./ArenaRankOverview";
import { RevenuePreviewHeader, RevenuePreviewNav } from "./RevenuePreviewChrome";
import { ArenaPodium } from "./ArenaPodium";
import { ArenaFairResults } from "./ArenaFairResults";
import { ArenaBrandWeeksForm } from "./ArenaBrandWeeksForm";
import { isValidBrandWeeks, type BrandWeeksByMonth, type MonthlyBrandWeeks } from "./arena-brand-weeks";
import ArenaScoreSimulator from "./ArenaScoreSimulator";
import { arenaExample, periodInfo, RANK_POINTS, MARGIN_TIER_POINTS, MONTHLY_POINTS_MAX, pointsAt, BRANDS, SLOTS, type Period, type Metric, type Slot } from "./arena-model";
import s from "./ArenaDesignPreview.module.css";
import motion from "./ArenaMotion.module.css";

const views = ["arena", "sales", "margin", "kpi", "overall", "standings", "records", "simulator", "brand-weeks", "profile", "badges"] as const;
type View = typeof views[number];
type SalesTab = "total" | "brand" | "finishes";
const viewOf = (value?: string | null): View => views.includes(value as View) ? value as View : value === "brand" || value === "fairs" ? "sales" : "arena";
const money = (value: number) => `RM ${value.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
const points = (value: number) => Number(value.toFixed(2)).toString();
const titles: Record<View, string> = { arena: "Arena", sales: "Sales Ranking", margin: "Margin Ranking", kpi: "KPI Ranking", overall: "Championship", standings: "Championship ranking", records: "Highest Fair Record", simulator: "Brand points explained", "brand-weeks": "My brand weeks", profile: "Profile", badges: "My honours" };
const BRAND_WEEKS_STORAGE_KEY = "houzs:arena:preview:jia:brand-weeks:v1";
const slotNames: Record<Slot, string> = { salesBrand: "Sales · brands", salesVenue: "Sales · fair placings", salesTotal: "Sales · total", marginBrand: "Margin · brands", marginTotal: "Margin · total", kpi: "KPI quantity", fairRecord: "Highest Fair Record" };
function Entry({ title, description, icon, onClick, tone = "secondary" }: { title: string; description: string; icon: string; onClick: () => void; tone?: string }) {
  return <button className={s.entry} data-tone={tone} onClick={onClick}><span className={s.entryIcon}><Icon name={icon} size={22} /></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="arrow" size={19} /></button>;
}
export default function ArenaDesignPreview({ design, initialView }: { design: "a" | "b" | "c"; initialView?: string }) {
  const [view, setView] = useState<View>(viewOf(initialView));
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const department = "fair";
  const [brand, setBrand] = useState("AKEMI");
  const [period, setPeriod] = useState<Period>("monthly");
  const [selection, setSelection] = useState("9");
  const [salesTab, setSalesTab] = useState<SalesTab>("total");
  const [marginTab, setMarginTab] = useState("total");
  const [showAll, setShowAll] = useState(false);
  const [brandWeeksByMonth, setBrandWeeksByMonth] = useState<BrandWeeksByMonth>({});
  const [brandWeeksLoaded, setBrandWeeksLoaded] = useState(false);
  const headingRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(BRAND_WEEKS_STORAGE_KEY) ?? "{}");
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        setBrandWeeksByMonth(Object.fromEntries(Object.entries(stored).filter(([key, value]) => /^2026-(0[1-9]|1[0-2])$/.test(key) && isValidBrandWeeks(value))));
      }
    } catch { /* An unavailable or malformed preview cache never replaces valid input. */ }
    setBrandWeeksLoaded(true);
  }, []);
  useEffect(() => {
    const sync = () => {
      setDirection("back");
      const p = new URL(window.location.href).searchParams;
      setView(viewOf(p.get("view")));
      setBrand(BRANDS.some(b => b.code === p.get("brand")) ? p.get("brand")! : "AKEMI");
      const next = p.get("period"); const nextPeriod = next === "quarterly" || next === "annual" ? next : "monthly";
      setPeriod(nextPeriod);
      const valid = nextPeriod === "monthly" ? ["1","2","3","4","5","6","7","8","9"] : nextPeriod === "quarterly" ? ["1","2","3"] : ["2026"];
      setSelection(valid.includes(p.get("selection") ?? "") ? p.get("selection")! : valid[valid.length - 1]);
      setSalesTab(p.get("salesTab") === "brand" ? "brand" : ["finishes", "venue"].includes(p.get("salesTab") ?? "") ? "finishes" : "total");
      setMarginTab(p.get("marginTab") === "brand" ? "brand" : "total");
    };
    sync(); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo({ top: 0, behavior: "instant" }); headingRef.current?.focus({ preventScroll: true });
  }, [view]);
  function replaceParams(values: Record<string, string>) {
    const url = new URL(window.location.href); Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value)); window.history.replaceState({}, "", url);
  }
  function navigate(next: View, movement: "forward" | "back" = "forward") {
    setDirection(movement);
    const url = new URL(window.location.href); url.searchParams.set("view", next); window.history.pushState({}, "", url); setView(next); setShowAll(false);
  }
  function changePeriod(value: Period) {
    const next = value === "monthly" ? "9" : value === "quarterly" ? "3" : "2026";
    replaceParams({ period: value, selection: next }); setPeriod(value); setSelection(next); setShowAll(false);
  }
  const data = arenaExample(period, selection, department, brand, brandWeeksByMonth);
  const { info, self } = data;
  const nextPlace = data.overall.filter(row => row.value > self.value).at(-1);
  const nextPlaceNote = nextPlace ? `${points(nextPlace.value - self.value)} pts to match #${nextPlace.position}` : "You’re leading this period";
  // The record board is always the latest demo snapshot; period filters apply to ledgers.
  const liveRecordData = view === "records" ? arenaExample("monthly", "9", department, brand, brandWeeksByMonth) : null;
  const isProfile = view === "profile" || view === "badges";
  const back: View = view === "badges" ? "profile" : view === "simulator" || view === "standings" ? "overall" : "arena";
  const brandName = BRANDS.find(b => b.code === brand)?.label ?? "Akemi";
  const formatMetric = (metric: Metric, value: number) => metric.startsWith("margin") ? `${value.toFixed(2)}%` : metric === "kpi" ? `${value} items` : money(value);
  const showBrand = (view === "sales" && salesTab === "brand") || (view === "margin" && marginTab === "brand");
  const formatLedger = period === "monthly" ? "This month’s points" : "Accumulated monthly points";
  const planMonth = String(info.months[info.months.length - 1]);
  const planMonthKey = `2026-${planMonth.padStart(2, "0")}`;
  const savedBrandWeeks = brandWeeksByMonth[planMonthKey];
  const planMonthLabel = periodInfo("monthly", planMonth).label;
  const periodOptions = period === "monthly" ? [9,8,7,6,5,4,3,2,1].map(month => <option key={month} value={month}>{periodInfo("monthly", `${month}`).label}</option>) : period === "quarterly" ? [3,2,1].map(q => <option key={q} value={q}>Q{q} 2026</option>) : <option value="2026">2026 · through September</option>;
  function changeSelection(value: string) { setSelection(value); replaceParams({ selection: value }); setShowAll(false); }
  function openRanking(next: "sales" | "margin" | "kpi") {
    if (next === "sales") { setSalesTab("total"); replaceParams({ salesTab: "total" }); }
    if (next === "margin") { setMarginTab("total"); replaceParams({ marginTab: "total" }); }
    navigate(next);
  }
  function openBrandWeeks() {
    setPeriod("monthly"); setSelection(planMonth);
    replaceParams({ period: "monthly", selection: planMonth });
    navigate("brand-weeks");
  }
  function saveBrandWeeks(value: MonthlyBrandWeeks): { ok: boolean; error?: string } {
    if (!isValidBrandWeeks(value)) return { ok: false, error: "Brand weeks must add up to your selected total." };
    const updated = { ...brandWeeksByMonth, [planMonthKey]: value };
    try { window.localStorage.setItem(BRAND_WEEKS_STORAGE_KEY, JSON.stringify(updated)); }
    catch { return { ok: false, error: "Could not save on this device. Your entries are still here; please try again." }; }
    setBrandWeeksByMonth(updated);
    return { ok: true };
  }
  let content: ReactNode;
  if (view === "arena") {
    content = <>
      <ArenaRankOverview rows={([
        { view: "sales", label: "Sales Ranking", metric: "salesTotal" },
        { view: "margin", label: "Margin Ranking", metric: "marginTotal" },
        { view: "kpi", label: "KPI Ranking", metric: "kpi" },
      ] as const).map(item => { const row = data.boards[item.metric].find(person => person.id === "jia")!; return { view: item.view, label: item.label, rank: row.position, value: formatMetric(item.metric, row.value) }; })} onNavigate={openRanking} />
      <button className={s.brandWeeksEntry} onClick={() => navigate("overall")}><span><strong>Championship</strong><small>#{self.position} overall · {points(self.value)} pts</small></span><span>View<Icon name="arrow" size={17} /></span></button>
      <button className={s.brandWeeksEntry} onClick={openBrandWeeks}><span><strong>My brand weeks</strong><small>{planMonthLabel} · {savedBrandWeeks ? `${savedBrandWeeks.weeks} weeks saved` : "Choose 4 or 5 weeks"}</small></span><span>{savedBrandWeeks ? "Edit" : "Set up"}<Icon name="arrow" size={17} /></span></button>
      <button className={s.moreLink} onClick={() => navigate("records")}><span>Highest Fair Record<small>All-time personal best</small></span><Icon name="arrow" size={20} /></button>
    </>;
  } else if (view === "sales" || view === "margin" || view === "kpi") {
    const finishesView = view === "sales" && salesTab === "finishes";
    const metric: Metric = view === "sales" ? salesTab === "brand" ? "salesBrand" : "salesTotal" : view === "margin" ? marginTab === "brand" ? "marginBrand" : "marginTotal" : "kpi";
    const rows = data.boards[metric];
    const mine = rows.find(row => row.id === "jia");
    const topFive = view === "sales" && salesTab === "brand" && !showAll;
    content = <>
      {view === "sales" && <div className={s.boardTabs} role="group" aria-label="Sales view">{(["total","brand","finishes"] as SalesTab[]).map(tab => <button key={tab} aria-pressed={salesTab === tab} onClick={() => { setSalesTab(tab); setShowAll(false); replaceParams({ salesTab: tab }); }}>{tab === "total" ? "Total sales" : tab === "brand" ? "By brand" : "Fair results"}</button>)}</div>}
      {view === "margin" && <div className={s.boardTabs} role="group" aria-label="Margin view">{["total","brand"].map(tab => <button key={tab} aria-pressed={marginTab === tab} onClick={() => { setMarginTab(tab); setShowAll(false); replaceParams({ marginTab: tab }); }}>{tab === "total" ? "Total margin" : "By brand"}</button>)}</div>}
      {showBrand && <label className={s.fieldLabel}>Brand<select value={brand} onChange={e => { setBrand(e.target.value); setShowAll(false); replaceParams({ brand: e.target.value }); }}>{BRANDS.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>}
      {finishesView ? <ArenaFairResults events={data.events} people={data.facts} cutoff={info.cutoff} period={period} periodLabel={info.label} /> : <>
      <ArenaPodium rows={rows} format={value => formatMetric(metric, value)} />
      {mine && <section className={s.positionNote} aria-label="Your performance"><span>{showBrand ? brandName : view === "kpi" ? "Your KPI quantity" : view === "margin" ? "Your total margin" : "Your total sales"}</span>
        <div className={s.performanceSummary}><div className={s.performanceRank}><span>Rank</span><strong>{mine.position ?? "—"}</strong></div><div className={s.performanceAmount}><span>{view === "margin" ? "Margin" : view === "kpi" ? "Quantity" : "Sales amount"}</span><strong>{mine.eligible && Number.isFinite(mine.value) ? formatMetric(metric, mine.value) : "—"}</strong></div></div>
        {!Number.isFinite(mine.value) ? <p>Pending data</p> : !mine.eligible ? <p>Not assigned this period</p> : null}
      </section>}
      <RankingList points={false} showNotes={false} rows={topFive ? rows.filter(row => row.position !== null && row.position <= 5) : rows} heading={topFive ? "Brand top 5 · ties included" : "All sellers"} format={value => formatMetric(metric, value)} />
      {view === "sales" && salesTab === "brand" && <button className={s.loadMore} onClick={() => setShowAll(!showAll)}>{showAll ? "Show top 5" : `See all ${rows.length} sellers`}</button>}
      <details className={s.ruleDetails}><summary>About this ranking <Icon name="info" size={16} /></summary>
        <p>{view === "sales" ? "Net sales in the selected period, filtered by brand when selected." : view === "margin" ? "Margin = total goods profit ÷ total goods revenue in the selected period, filtered by brand when selected." : "Total configured KPI item quantities in the selected period, including eligible giveaway units."}</p>
        <p>Equal results share ranks. Missing data remains pending.</p>
      </details>
      </>}
    </>;
  } else if (view === "overall") {
    content = <>
      <ArenaPodium rows={data.overall} format={value => `${points(value)} pts`} onOpen={() => navigate("standings")} />
      <section className={s.championshipHero} aria-label="Your Championship points"><div className={s.heroTop}><span>{formatLedger}</span><span>#{self.position} overall</span></div><p className={s.heroNumber}>{points(self.value)}<span>pts</span></p></section>
      <p className={s.nextPlace}>{nextPlaceNote}</p>
      <section className={s.scoreBreakdown} aria-label="Your points breakdown"><h2>Your points breakdown</h2>{(Object.keys(slotNames) as Slot[]).map(slot => <div key={slot}><span>{slotNames[slot]}<small>{points(self.components[slot].base)} rank pts{self.components[slot].incentive > 0 ? ` + ${points(self.components[slot].incentive)} incentive` : ""}</small></span><strong>{points(self.components[slot].total)}</strong></div>)}</section>
      <button className={s.simulationLink} onClick={() => navigate("simulator")}><span>See how brand points are shared</span><Icon name="arrow" size={18} /></button>
      <details className={s.ruleDetails}><summary>How accumulation works <Icon name="info" size={16} /></summary><p>Monthly rank points and monthly incentives are recorded once. Quarterly = the three monthly ledgers. Annual = the monthly ledgers in the year. A quarter or year does not award Tier or KPI bonuses again.</p><p>Proposed rank ladder 1–10: {RANK_POINTS.join(" / ")}. Ranks 11–20 run from {pointsAt(11)} to {pointsAt(20)} points, then {pointsAt(21)} for qualifying ranks 21+. Performance with zero activity earns 0; a valid historical Fair Record remains eligible for its monthly award.</p><p>{SLOTS.length} contributions of up to {RANK_POINTS[0]} base points; monthly maximum {MONTHLY_POINTS_MAX} including all incentives.</p><p>Highest Fair Record uses the all-time standings at each month-end. First place earns {RANK_POINTS[0]} points that month, and another {RANK_POINTS[0]} next month if still first. New records change future standings, not already settled months.</p><p>Margin brand and total slots can each earn their monthly incentive. Brand incentives follow your saved brand-week shares. Tier 2 awards +{MARGIN_TIER_POINTS[2]} total and replaces Tier 1’s +{MARGIN_TIER_POINTS[1]}.</p></details>
    </>;
  } else if (view === "standings") {
    content = <><ArenaPodium rows={data.overall} format={value => `${points(value)} pts`} /><RankingList rows={data.overall} heading="Championship standings" format={value => `${points(value)} pts`} points={false} showNextGap /></>;
  } else if (view === "records") {
    content = <><p className={s.recordNotice}>All-time record · Demo snapshot as of {liveRecordData!.info.cutoff}</p><ArenaPodium rows={liveRecordData!.records} format={money} /><RankingList rows={liveRecordData!.records} heading="All-time personal best" format={money} points={false} unrankedLabel="No record yet" /><details className={s.ruleDetails}><summary>How records and monthly awards work <Icon name="info" size={16} /></summary><p>Your record is your highest net sales from one completed fair, usually three days. A RM100,000 January record stays on this all-time board until someone beats it.</p><p>At each month-end, the record standings award rank points once. Keep first place next month and receive the first-place award again. Monthly, Quarterly and Annual awards appear in Championship.</p><p>This preview uses fictional completed-fair history through September 2026. The live version needs verified fair dates and historical sales before records and monthly awards can be official.</p></details></>;
  } else if (view === "simulator") content = <ArenaScoreSimulator />;
  else if (view === "brand-weeks") content = brandWeeksLoaded ? <ArenaBrandWeeksForm key={planMonthKey} initialValue={savedBrandWeeks} monthLabel={planMonthLabel} onSave={saveBrandWeeks} /> : <p className={s.simpleNote}>Loading your brand weeks…</p>;
  else if (view === "profile") content = <><div className={s.profileIntro}><span className={s.profileAvatar}>JE</span><div><h2>Jia En</h2><p>{department === "fair" ? "Fair" : "IR"} · Team Leader</p></div></div><div className={s.entries}><Entry title="My honours" description="Champions, personal bests & milestones" icon="trophy" onClick={() => navigate("badges")} /><a className={s.profileLink} href={`/member/preview?design=${design}&page=team`}><Icon name="team" /><span>My team</span><Icon name="arrow" /></a><a className={s.profileLink} href={`/member/preview?design=${design}&page=account`}><Icon name="user" /><span>Account & requests</span><Icon name="arrow" /></a></div></>;
  else content = <><div className={s.honoursHero}><Icon name="trophy" size={28} /><span>Arena honours</span><strong>Make your mark.</strong><p>Monthly · Quarterly · Annual</p></div><p className={s.simpleNote}>Championship awards follow settled points, including the monthly award for your all-time Highest Fair Record rank.</p></>;
  return <div className={`${s.app} ${motion.shell}`} data-arena-design={design}>
    <RevenuePreviewHeader design={design} />
    <main key={view} ref={headingRef} tabIndex={-1} className={`${s.content} ${motion.page}`} data-direction={direction}>
      {view === "arena" ? <div className={s.overviewHeading}><h1>Arena</h1><span>Demo data</span></div> : <div className={view === "brand-weeks" ? s.formHeading : s.detailHeading}><button className={s.backButton} onClick={() => navigate(back, "back")}><Icon name="back" size={18} />{titles[back]}</button><h1>{titles[view]}</h1>{!isProfile && view !== "brand-weeks" && <p>{department === "fair" ? "Fair" : "IR"}<span>/</span>{view === "records" ? "All time" : info.label}</p>}</div>}
      {view === "arena" ? <section className={s.overviewPeriod} aria-label="Ranking period"><select aria-label="Time dimension" value={period} onChange={e => changePeriod(e.target.value as Period)}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select><select aria-label="Selected period" value={selection} onChange={e => changeSelection(e.target.value)}>{periodOptions}</select></section> : view === "brand-weeks" ? <label className={s.fieldLabel}>Month<select aria-label="Brand weeks month" value={planMonth} onChange={e => { setPeriod("monthly"); setSelection(e.target.value); replaceParams({ period: "monthly", selection: e.target.value }); }}>{[9,8,7,6,5,4,3,2,1].map(month => <option key={month} value={month}>{periodInfo("monthly", String(month)).label}</option>)}</select></label> : !isProfile && view !== "simulator" && view !== "records" && <section className={s.periodControl} aria-label="Ranking period"><div className={s.periodTabs} role="group" aria-label="Time dimension">{(["monthly","quarterly","annual"] as Period[]).map(value => <button key={value} aria-pressed={period === value} onClick={() => changePeriod(value)}>{value === "monthly" ? "Monthly" : value === "quarterly" ? "Quarterly" : "Annual"}</button>)}</div><label><span className={s.visuallyHidden}>Selected period</span><select aria-label="Selected period" value={selection} onChange={e => changeSelection(e.target.value)}>{periodOptions}</select><span>Demo data</span></label></section>}
      <div key={`${view}:${period}:${selection}:${brand}:${salesTab}:${marginTab}`} className={motion.results}>{content}</div>
    </main>
    <RevenuePreviewNav design={design} active={isProfile ? "profile" : "arena"} onSelect={{ arena: () => navigate("arena") }} />
  </div>;
}
