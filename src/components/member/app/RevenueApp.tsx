"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { MemberData, MemberMembership, MemberReadContext, MemberRequest } from "@/lib/member/types";
import type { MemberOrderBook } from "@/lib/member/order-book";
import { arenaRankings, type MemberArenaSnapshot } from "@/lib/member/arena";
import { championshipMonth, championshipStandings } from "@/lib/member/championship";
import base from "./base.module.css";
import s from "./shell.module.css";
import { firstName, greeting, initials, klToday, longDayLabel, monthName, quarterLabel } from "./format";
import { useRoute, type Board, type InsightView, type Route, type Screen } from "./route";
import { addMonths, isLiveMonth, monthPeriod, periodOf, periodOptions, workingMonth, type MonthState, type PeriodKind } from "./insight/period";
import { useInsightData } from "./insight/useInsightData";
import { billsView, brandPage, insightMain, kpiView, orderSheet, type InsightInput } from "./insight/insight-model";
import InsightMain, { type InsightTab } from "./insight/InsightMain";
import BillsPage, { type BillsStatus } from "./insight/BillsPage";
import KpiPage from "./insight/KpiPage";
import BrandPage from "./insight/BrandPage";
import { DateSheet, OrderSheet, TiersSheet } from "./insight/InsightSheets";
import ArenaHub from "./arena/ArenaHub";
import ArenaBoard from "./arena/ArenaBoard";
import ArenaRecord from "./arena/ArenaRecord";
import { ChampSheet, FairsSheet, boardThemeClass } from "./arena/ArenaSheets";
import { arenaKey, boardModel, hubModel, recordModel, type ArenaSub } from "./arena/arena-model";
import { useArenaData } from "./arena/useArenaData";
import { demoSource, liveSource, type RevenueSource } from "./source";
import { BottomNav, DeskAside, DeskHeader, MobileHeader, ViewingAsBar, type Me } from "./shell/Chrome";
import StatusBar from "./shell/StatusBar";
import Today from "./today/Today";
import { todayModel, type TodayTodo } from "./today/today-model";
import SubDeptSheet, { type SubDeptOption } from "./overlays/SubDeptSheet";
import BrandPicker, { type BrandOption } from "./overlays/BrandPicker";
import Notifications from "./notifications/Notifications";
import { notifGroups, notifications, notifSummary, type NotifItem, type NotifTab, type SettledResults } from "./notifications/notify-model";
import type { AppFixture } from "./fixtures/proto";

export type Device = "live" | "ios" | "android" | "desktop";

export interface RevenueAppProps {
  initialData: MemberData;
  /** The page's query string, so the first render matches the server's. */
  initialSearch: string;
  /** A preview draws the prototype's device around the app. */
  device?: Device;
  /** Fixtures: a fixed "today" and the source the preview reads. */
  today?: string;
  source?: RevenueSource;
  /** Design preview only: the prototype's screens as data, laid over the real ones. */
  fixture?: AppFixture;
}

type Sheet = "sd" | "brand" | null;

const SETTLED = new Set(["applied", "locked"]);
const BRAND_NAMES: Record<string, string> = { AKEMI: "Akemi", ERGOTEX: "Ergotex", DUNLOP: "Dunlopillo", ZANOTTI: "Zanotti" };
const BRAND_ORDER = ["AKEMI", "ERGOTEX", "DUNLOP", "ZANOTTI"];

/** `RQ-2609-004` once the request carries its number; until then the head of its id. */
export function requestCode(request: MemberRequest): string {
  const number = (request.detail as Record<string, unknown> | undefined)?.requestNo;
  return typeof number === "string" && number ? number : `RQ-${request.id.slice(0, 8).toUpperCase()}`;
}

/**
 * A Principal's Arena marks nobody as `self` (the RPC is read-only for them):
 * mark the person being viewed, so every board finds "you" the same way.
 */
function viewedAs(snapshot: MemberArenaSnapshot, staffId: string | undefined): MemberArenaSnapshot {
  if (snapshot.selfId || !staffId) return snapshot;
  return { ...snapshot, selfId: staffId, people: snapshot.people.map(p => ({ ...p, self: p.id === staffId })) };
}

function useStoredBool(key: string, initial: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try { setValue(localStorage.getItem(key) === "true"); } catch { /* private mode: keep the default */ }
  }, [key]);
  const set = useCallback((next: boolean) => {
    setValue(next);
    try { localStorage.setItem(key, String(next)); } catch { /* private mode */ }
  }, [key]);
  return [value, set];
}

/** Width of the app itself, so a 414px preview lays out as a phone in any window. */
function useDesk(ref: RefObject<HTMLDivElement | null>): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => setDesk((entries[0]?.contentRect.width ?? 0) >= 1024));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return desk;
}

export default function RevenueApp({ initialData, initialSearch, device = "live", today: fixedToday, source: sourceProp, fixture }: RevenueAppProps) {
  const source = sourceProp ?? (initialData.demo ? demoSource : liveSource);
  const [data, setData] = useState(initialData);
  const [route, go] = useRoute(initialSearch);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [nfOpen, setNfOpen] = useState(false);
  const [nfTab, setNfTab] = useState<NotifTab>("all");
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useStoredBool("member-hide-amounts", false);
  const [android, setAndroid] = useState(device === "android");
  const [quoteBrand, setQuoteBrand] = useState("");
  const appRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const desk = useDesk(appRef);
  const live = device === "live";
  const today = fixedToday ?? klToday();
  const period = today.slice(0, 7);

  useEffect(() => {
    if (live && /Android/i.test(navigator.userAgent)) setAndroid(true);
  }, [live]);

  // A minute's refresh keeps memos, requests and statements current, as before.
  useEffect(() => {
    if (data.demo) return;
    const timer = window.setInterval(() => {
      void source.refresh().then(result => { if (result.ok) setData(result.data); });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [data.demo, source]);

  const principal = data.principalView === true;
  const membership: MemberMembership | undefined = data.memberships.find(m => m.id === route.department) ?? data.memberships[0];
  const context = useMemo<MemberReadContext | undefined>(() => (principal && route.staff && membership
    ? { staffId: route.staff, subDepartmentId: membership.id } : undefined), [principal, route.staff, membership]);
  const viewed = principal && route.staff ? membership?.people.find(p => p.id === route.staff) : undefined;

  const me: Me = useMemo(() => {
    if (viewed) return { name: viewed.name, first: firstName(viewed.name), ini: initials(viewed.name), title: viewed.title, rank: viewed.rank };
    if (principal) return { name: data.profile.name || "Principal", first: firstName(data.profile.name || "Principal"), ini: initials(data.profile.name || "PR"), title: "Principal", rank: "All access" };
    return { name: data.profile.name, first: firstName(data.profile.name), ini: initials(data.profile.name), title: membership?.title ?? "", rank: membership?.rank ?? "" };
  }, [viewed, principal, data.profile.name, membership]);

  // ── the month being worked: last month while it is still being closed ──
  const [arena, setArena] = useState<MemberArenaSnapshot | null>(null);
  const [arenaNow, setArenaNow] = useState<MemberArenaSnapshot | null>(null);
  const [settledArena, setSettledArena] = useState<MemberArenaSnapshot | null>(null);
  const readable = !principal || !!context;
  const membershipId = membership?.id ?? "";
  const schemeId = membership?.schemeId ?? "";
  const prevMonth = addMonths(period, -1);

  // Last month's and this month's bills: which months are closed, which hold bills.
  const [recent, setRecent] = useState<MemberOrderBook | null>(null);
  const [recentFailed, setRecentFailed] = useState(false);
  useEffect(() => {
    if (!membershipId || !readable) return;
    let stale = false;
    setRecent(null); setRecentFailed(false);
    void source.orderBook(membershipId, prevMonth, period, context).then(r => {
      if (stale) return;
      if (r.ok) setRecent(r.data); else setRecentFailed(true);
    });
    return () => { stale = true; };
  }, [membershipId, prevMonth, period, readable, context, source]);
  const monthState = useMemo<MonthState>(() => ({ paysFrom: recent?.paysFrom ?? null, closed: recent?.closedMonths ?? [] }), [recent]);
  const working = useMemo(() => {
    if (fixture?.insight) return fixture.insight.month;
    if (recent) return workingMonth(period, monthState, [...new Set(recent.orders.map(o => o.recognitionMonth))]);
    return recentFailed || data.demo ? period : null;
  }, [fixture, recent, recentFailed, data.demo, period, monthState]);
  const workingPeriod = useMemo(() => (working ? monthPeriod(working, period) : null), [working, period]);
  const work = useInsightData({ source, membershipId, schemeId, context, readable, period: workingPeriod, recent, recentFrom: prevMonth });

  useEffect(() => {
    if (!membershipId || !readable || !working) return;
    let stale = false;
    setArena(null); setArenaNow(null);
    void source.arena(membershipId, working, "monthly", context).then(r => { if (!stale && r.ok) setArena(viewedAs(r.data, context?.staffId)); });
    if (working !== period) {
      void source.arena(membershipId, period, "monthly", context).then(r => { if (!stale && r.ok) setArenaNow(viewedAs(r.data, context?.staffId)); });
    }
    return () => { stale = true; };
  }, [membershipId, working, period, readable, context, source]);

  const incomes = useMemo(() => data.incomes.filter(i => i.schemeId === schemeId).sort((a, b) => b.period.localeCompare(a.period)), [data.incomes, schemeId]);
  const income = incomes[0];
  // The newest settled month, while it is news (the month just gone, or the one before it).
  const settled = useMemo(() => {
    const candidate = incomes.find(i => SETTLED.has(i.status));
    if (!candidate) return undefined;
    const [y, m] = period.split("-").map(Number);
    const prev = (n: number) => { const d = new Date(Date.UTC(y, m - 1 - n, 1)); return d.toISOString().slice(0, 7); };
    return candidate.period === prev(1) || candidate.period === prev(2) ? candidate : undefined;
  }, [incomes, period]);

  useEffect(() => {
    if (!settled || !membershipId || !readable) { setSettledArena(null); return; }
    let stale = false;
    void source.arena(membershipId, settled.period, "monthly", context).then(r => { if (!stale && r.ok) setSettledArena(viewedAs(r.data, context?.staffId)); });
    return () => { stale = true; };
  }, [settled, membershipId, readable, context, source]);

  const memos = useMemo(() => data.memos.filter(m => !m.departments.length || m.departments.includes(membership?.name ?? "")), [data.memos, membership?.name]);
  const requests = data.requests;

  // ── the bell ──
  const readKey = `rv-results-read-${data.profile.userId}-${settled?.period ?? ""}`;
  const [readAll, setReadAll] = useStoredBool(readKey, false);
  const results: SettledResults | null = useMemo(() => {
    if (!settled || !settledArena) return null;
    const rank = (metric: "sales" | "margin") => arenaRankings(settledArena.people, metric).find(r => r.self)?.position ?? null;
    return { period: settled.period, subName: membership?.name ?? "", ranked: arenaRankings(settledArena.people, "sales").filter(r => r.position).length,
      sales: rank("sales"), margin: rank("margin"), champ: null };
  }, [settled, settledArena, membership?.name]);
  const nf = useMemo(() => notifications({ now: new Date(), memos: principal && !viewed ? [] : memos, requests: principal && !viewed ? [] : requests,
    settled, salary: data.profile.salary, results, readAll, requestCode }), [memos, requests, settled, data.profile.salary, results, readAll, principal, viewed]);
  const settledMonth = settled ? monthName(settled.period) : null;

  // ── brands this sub-department quotes ──
  const brands: BrandOption[] = useMemo(() => {
    if (!membership?.calculator) return [];
    const byBrand = new Map<string, { models: Set<string>; sofa: boolean }>();
    for (const p of data.products) {
      if (!p.brand || !p.available) continue;
      const entry = byBrand.get(p.brand) ?? { models: new Set<string>(), sofa: false };
      entry.models.add(p.modelId ?? p.name);
      if ((p.kind ?? p.category).toUpperCase().includes("SOFA")) entry.sofa = true;
      byBrand.set(p.brand, entry);
    }
    const names = new Map((arena?.brands ?? []).map(b => [b.code, b.name]));
    return [...byBrand.entries()]
      .sort(([a, x], [b, y]) => Number(x.sofa) - Number(y.sofa) || (BRAND_ORDER.indexOf(a) + 99) % 99 - (BRAND_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b))
      .map(([code, v]) => ({ code, name: names.get(code) ?? BRAND_NAMES[code] ?? code, sofa: v.sofa, models: v.models.size }));
  }, [membership?.calculator, data.products, arena?.brands]);
  const brandList = fixture?.brands ?? brands;
  const currentBrand = quoteBrand || brandList[0]?.code || "";

  // ── navigation ──
  const goScreen = useCallback((screen: Screen, extra: Partial<Route> = {}) => {
    setSheet(null);
    setNfOpen(false);
    setDateOpen(false);
    setSoPick(null);
    setTiersOpen(false);
    setFairsOpen(false);
    setChampOpen(false);
    setScrolled(false);
    go({ screen, pf: null, ins: "main", arena: "hub", ...extra });
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [go]);
  const toInsight = useCallback((view: InsightView, status: BillsStatus = "counted") => {
    if (view === "bills") setBillStatus(status);
    goScreen("insight", { ins: view });
  }, [goScreen]);
  // A board from Today or the bell opens on its month, as the prototype's `go('arena', { period: 'monthly', sub: 'total' })`.
  const openBoard = useCallback((board: Board) => {
    setArKind("monthly"); setArFrom(null); setArSub("total");
    goScreen("arena", { arena: "board", board });
  }, [goScreen]);
  const openNotif = useCallback(() => { setSheet(null); setNfOpen(true); }, []);
  const toggleNotif = useCallback(() => { setSheet(null); setNfOpen(open => !open); }, []);
  const openSheet = useCallback((next: Sheet) => { setNfOpen(false); setSheet(next); }, []);

  const todo = (t: TodayTodo) => {
    if (t.target === "memos") goScreen("account", { pf: "memos" });
    else if (t.target === "requests") goScreen("account", { pf: "requests" });
    else goScreen("account", { pf: "brandWeeks" });
  };
  const openNotifItem = (n: NotifItem) => {
    setNfOpen(false);
    if (n.go.to === "memo") goScreen("account", { pf: "memos" });
    else if (n.go.to === "requests") goScreen("account", { pf: "requests" });
    else if (n.go.to === "income") goScreen("account", { pf: "income" });
    else openBoard("sales");
  };

  const subOptions: SubDeptOption[] = data.memberships.map((m, i) => ({
    id: m.id, name: m.name, abbr: m.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase(),
    meta: i === 0 ? ["Home", m.title, m.rank].filter(Boolean).join(" · ") : ["Member", m.title].filter(Boolean).join(" · "),
  }));

  // ── the Championship of the working month, for Today's board ──
  const kpiRule = useMemo(() => ({ enabled: !!work.kpi?.enabled, threshold: work.kpi?.threshold ?? null }), [work.kpi?.enabled, work.kpi?.threshold]);
  const selfId = arena?.selfId || context?.staffId || "";
  const champRank = useMemo(() => {
    if (!arena) return null;
    const month = championshipMonth({ month: arena.period, people: arena.people, brands: arena.brands.map(b => b.code), tiers: arena.tiers, history: arena.history ?? null, kpi: kpiRule });
    return championshipStandings([month]).find(s => s.id === selfId)?.position ?? null;
  }, [arena, kpiRule, selfId]);

  const model = useMemo(() => todayModel({
    today, first: me.first, title: me.title, rank: me.rank, income, salary: data.profile.salary, hidden,
    insight: work.block ?? undefined, kpi: work.kpi, arena, arenaNow, book: work.book, bands: data.bands, memos, requests, requestCode,
  }, champRank), [today, me, income, data.profile.salary, hidden, work.block, work.kpi, arena, arenaNow, work.book, data.bands, memos, requests, champRank]);

  // ── Insight: Month / Quarter / Year, opening on the working month ──
  const [insKind, setInsKind] = useState<PeriodKind>("monthly");
  const [insFrom, setInsFrom] = useState<string | null>(null);
  const [insTab, setInsTab] = useState<InsightTab>("personal");
  const [billStatus, setBillStatus] = useState<BillsStatus>("counted");
  const [billWeek, setBillWeek] = useState<string | null>(null);
  const [insBrand, setInsBrand] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [soPick, setSoPick] = useState<string | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);
  const insPeriod = useMemo(() => periodOf(insKind, insFrom ?? working ?? period, period), [insKind, insFrom, working, period]);
  const sameAsWork = insPeriod.kind === "monthly" && insPeriod.from === working;
  const picked = useInsightData({ source, membershipId, schemeId, context, readable, period: sameAsWork ? null : insPeriod, recent, recentFrom: prevMonth });
  const ins = sameAsWork ? work : picked;
  const insMonthly = insPeriod.kind === "monthly";
  const insightInput = useMemo<InsightInput>(() => ({
    period: insPeriod,
    book: ins.book,
    me: (insMonthly ? ins.block?.me : ins.range?.me) ?? null,
    downline: (insMonthly ? ins.block?.downline : ins.range?.downline) ?? [],
    target: insMonthly ? ins.block?.target ?? null : null,
    kpi: insMonthly ? ins.kpi : null,
    kpiEnabled: work.kpi?.enabled,
    bands: data.bands,
    name: me.name,
    title: me.title,
  }), [insPeriod, ins, insMonthly, work.kpi?.enabled, data.bands, me.name, me.title]);
  const insMain = useMemo(() => fixture?.insight?.main ?? (ins.book ? insightMain(insightInput) : null), [fixture, ins.book, insightInput]);
  const insBills = useMemo(() => fixture?.insight?.bills ?? (ins.book ? billsView(insightInput) : null), [fixture, ins.book, insightInput]);
  const insKpi = useMemo(() => fixture?.insight?.kpi ?? (ins.book ? kpiView(insightInput, membership?.name ?? "this sub-department") : null), [fixture, ins.book, insightInput, membership?.name]);
  const insBrandVM = useMemo(() => {
    if (fixture?.insight) return fixture.insight.brands[insBrand] ?? Object.values(fixture.insight.brands)[0] ?? null;
    return ins.book ? brandPage(insightInput, insBrand) : null;
  }, [fixture, ins.book, insightInput, insBrand]);
  const soVM = useMemo(() => {
    if (!soPick) return null;
    if (fixture?.insight) return fixture.insight.orders[soPick] ?? null;
    return orderSheet(insightInput, soPick);
  }, [fixture, soPick, insightInput]);
  const insDateLabel = fixture?.insight?.dateLabel ?? insPeriod.label;
  const dateOptions = useMemo(() => periodOptions(insKind, period, monthState), [insKind, period, monthState]);

  // ── Arena: Monthly / Quarterly / Annual, opening on the working month ──
  const [arKind, setArKind] = useState<PeriodKind>("monthly");
  const [arFrom, setArFrom] = useState<string | null>(null);
  const [arSub, setArSub] = useState<ArenaSub>("total");
  const [arBrand, setArBrand] = useState("");
  const [fairsOpen, setFairsOpen] = useState(false);
  const [champOpen, setChampOpen] = useState(false);
  const arPeriod = useMemo(() => periodOf(arKind, arFrom ?? fixture?.arena?.from[arKind] ?? working ?? period, period), [arKind, arFrom, fixture, working, period]);
  const markViewed = useCallback((snap: MemberArenaSnapshot) => viewedAs(snap, context?.staffId), [context?.staffId]);
  const arData = useArenaData({
    source, membershipId, context, readable, known: arena, kpi: kpiRule, mark: markViewed,
    period: route.screen === "arena" && !fixture?.arena ? arPeriod : null,
  });
  const arInput = useMemo(() => ({
    period: arPeriod, snapshot: arData.snapshot, history: arData.history, standings: arData.standings, selfId,
    subName: membership?.name ?? "", costDivisor: recent?.costDivisor ?? null, kpiEnabled: kpiRule.enabled,
    final: arPeriod.kind !== "monthly" || !isLiveMonth(arPeriod.from, period, monthState),
  }), [arPeriod, arData.snapshot, arData.history, arData.standings, selfId, membership?.name, recent?.costDivisor, kpiRule.enabled, period, monthState]);
  const hubVM = useMemo(() => fixture?.arena?.hub[arKind] ?? hubModel(arInput), [fixture, arKind, arInput]);
  const boardVM = useMemo(() => {
    const fx = fixture?.arena;
    if (fx) {
      const sub: ArenaSub = route.board === "sales" ? arSub : route.board === "margin" && arSub !== "fair" ? arSub : "total";
      return fx.boards[arenaKey(route.board, arKind, sub, sub === "brand" ? arBrand || "AKEMI" : "")];
    }
    return boardModel({ ...arInput, board: route.board, sub: arSub, brand: arBrand });
  }, [fixture, route.board, arKind, arSub, arBrand, arInput]);
  const recordVM = useMemo(() => fixture?.arena?.record ?? recordModel(arData.history, selfId), [fixture, arData.history, selfId]);
  const arDateLabel = fixture?.arena?.dateLabel[arKind] ?? arPeriod.label;
  const arDateOptions = useMemo(() => fixture?.arena?.dateOptions[arKind] ?? periodOptions(arKind, period, monthState), [fixture, arKind, period, monthState]);
  const setArenaKind = (kind: PeriodKind) => { setArKind(kind); setArFrom(null); };
  const todayVM = fixture?.today ?? model;
  const nfCount = fixture?.notifications.count ?? nf.count;
  const nfGroupsVM = fixture?.notifications.groups ?? notifGroups(nf.items, nfTab, settledMonth);
  const nfSummaryVM = fixture?.notifications.summary ?? notifSummary(nf.count, settledMonth);

  // ── layout ──
  const anyPanel = sheet !== null || dateOpen || soPick !== null || tiersOpen || fairsOpen || champOpen;
  const rail = desk && (nfOpen || anyPanel || route.screen === "quote");
  const showHeader = route.screen === "today" || route.screen === "calc";
  const statusBg = route.screen === "account" && !route.pf ? "var(--rv-peach)" : "var(--rv-white)";
  const screenVars = {
    "--status-bg": statusBg,
    "--status-h": live ? "env(safe-area-inset-top, 0px)" : android ? "38px" : "54px",
  } as CSSProperties;

  let page: ReactNode;
  if (route.screen === "today") {
    page = <Today model={todayVM} hidden={hidden} actions={{
      toggleHide: () => setHidden(!hidden),
      openMetric: key => toInsight(key === "sales" ? "bills" : key === "margin" ? "brand" : "kpi"),
      openTodo: todo,
      openOrders: () => toInsight("bills"),
      openArena: () => goScreen("arena"),
      openBoard,
    }} />;
  } else if (route.screen === "insight") {
    const back = () => toInsight("main");
    const openDate = () => setDateOpen(true);
    if (route.ins === "bills") {
      page = <BillsPage vm={insBills} dateLabel={insDateLabel} status={billStatus} week={billWeek} onStatus={setBillStatus} onWeek={setBillWeek}
        onBill={setSoPick} onBack={back} onDate={openDate} />;
    } else if (route.ins === "kpi") {
      page = <KpiPage vm={insKpi} dateLabel={insDateLabel} onBill={setSoPick} onBack={back} onDate={openDate} />;
    } else if (route.ins === "brand") {
      page = <BrandPage vm={insBrandVM} dateLabel={insDateLabel} onBrand={code => { setInsBrand(code); setTiersOpen(false); }}
        onTiers={() => setTiersOpen(true)} onBill={setSoPick} onBack={back} onDate={openDate} />;
    } else {
      page = <InsightMain vm={insMain} tab={insTab} dateLabel={insDateLabel} actions={{
        openDate, setTab: setInsTab,
        toBills: () => toInsight("bills"),
        toKpi: () => toInsight("kpi"),
        toWaiting: () => toInsight("bills", "waiting"),
        openBrand: code => { setInsBrand(code); toInsight("brand"); },
      }} />;
    }
  } else if (route.screen === "arena") {
    const toHub = () => goScreen("arena", { arena: "hub" });
    if (route.arena === "record") {
      page = <ArenaRecord vm={recordVM} onBack={toHub} />;
    } else if (route.arena === "board" && boardVM) {
      page = <ArenaBoard vm={boardVM} kind={arKind} dateLabel={arDateLabel} actions={{
        back: toHub,
        openDate: () => setDateOpen(true),
        setKind: setArenaKind,
        setSub: setArSub,
        setBrand: setArBrand,
        openChamp: () => setChampOpen(true),
        openFairs: () => setFairsOpen(true),
        openFoot: () => toInsight("brand"),
      }} />;
    } else {
      page = <ArenaHub vm={hubVM} kind={arKind} onKind={setArenaKind}
        onBoard={board => { setArSub("total"); goScreen("arena", { arena: "board", board }); }}
        onRecord={() => goScreen("arena", { arena: "record" })} />;
    }
  } else {
    page = <Pending screen={route.screen} />;
  }

  const screen = (
    <div className={`${s.screen} ${live ? s.screenLive : s.screenFramed} ${rail ? s.rail : ""}`} style={screenVars} data-platform={android ? "android" : "ios"}>
      {!live && device !== "desktop" && <StatusBar android={android} />}
      <DeskAside active={route.screen} count={nfCount} notifOpen={nfOpen} me={me} onGo={goScreen} onQuote={() => openSheet("brand")}
        onNotif={toggleNotif} onProfile={() => goScreen("account")} />
      <DeskHeader greet={fixture?.greeting ?? greeting()} me={me} subName={membership?.name ?? ""} dateLine={`${longDayLabel(today)} · ${quarterLabel(today)}`}
        unread={nfCount > 0 || nf.items.some(n => n.unread)} onSubDept={() => openSheet("sd")} onNotif={toggleNotif}
        onSignOut={() => { const f = document.createElement("form"); f.method = "post"; f.action = "/member/signout"; document.body.appendChild(f); f.submit(); }} />
      {viewed && <ViewingAsBar me={me} onSwitch={() => goScreen("account")} onExit={() => goScreen("account", { staff: "" })} />}
      {showHeader && (
        <MobileHeader ruled={scrolled} back={route.screen === "calc"} subName={membership?.name ?? ""} count={nfCount} me={me}
          onLogo={() => goScreen("today")} onBack={() => goScreen("quote")} onSubDept={() => openSheet("sd")} onBell={openNotif}
          onProfile={() => goScreen("account")} />
      )}
      <main ref={mainRef} className={s.main} onScroll={e => { const v = e.currentTarget.scrollTop > 4; if (v !== scrolled) setScrolled(v); }}>
        {page}
      </main>
      <BottomNav active={route.screen} android={android} live={live} onGo={goScreen} onQuote={() => openSheet("brand")} />
      <SubDeptSheet open={sheet === "sd"} options={subOptions} current={membership?.id ?? ""} onClose={() => setSheet(null)}
        onPick={id => { setSheet(null); go({ department: id, staff: principal ? route.staff : "" }); }} />
      <Notifications open={nfOpen} summary={nfSummaryVM} tab={nfTab} groups={nfGroupsVM}
        onTab={setNfTab} onClose={() => setNfOpen(false)} onReadAll={() => setReadAll(true)} onOpen={openNotifItem} />
      <BrandPicker open={sheet === "brand"} brands={brandList} current={currentBrand} onQuote={route.screen === "quote"} cartItems={fixture?.cartItems ?? 0}
        onClose={() => setSheet(null)} onPick={code => { setQuoteBrand(code); goScreen("quote"); }} />
      {route.screen === "insight" && (
        <>
          <DateSheet open={dateOpen} kind={insKind} options={fixture?.insight?.dateOptions ?? dateOptions} selected={insPeriod.from}
            onKind={kind => { setInsKind(kind); setInsFrom(null); setBillWeek(null); }}
            onPick={o => { setInsFrom(o.period.from); setBillWeek(null); setDateOpen(false); }} onClose={() => setDateOpen(false)} />
          {route.ins === "brand" && <TiersSheet open={tiersOpen} vm={insBrandVM} onClose={() => setTiersOpen(false)} />}
          {route.ins !== "main" && <OrderSheet open={soPick !== null} vm={soVM} onClose={() => setSoPick(null)} />}
        </>
      )}
      {route.screen === "arena" && route.arena === "board" && boardVM && (
        <>
          <DateSheet open={dateOpen} kind={arKind} options={arDateOptions} selected={arPeriod.from} segmented={false} ctx={boardVM.title}
            themeClass={boardThemeClass(route.board)} onPick={o => { setArFrom(o.period.from); setDateOpen(false); }} onClose={() => setDateOpen(false)} />
          {boardVM.fair && <FairsSheet open={fairsOpen} fair={boardVM.fair} dateLabel={arDateLabel} onClose={() => setFairsOpen(false)} />}
          {route.board === "champ" && <ChampSheet open={champOpen} champ={boardVM.rank?.champ ?? null} onClose={() => setChampOpen(false)} />}
        </>
      )}
    </div>
  );

  const frame = device === "ios" ? s.frameIos : device === "android" ? s.frameAndroid : device === "desktop" ? s.frameDesk : "";
  return (
    <div ref={appRef} className={`${base.root} ${s.app}`} data-revenue-app style={!live ? { width: device === "desktop" ? 1440 : device === "android" ? 410 : 414 } : undefined}>
      {live ? screen : <div className={`${s.frame} ${frame}`}>{screen}</div>}
    </div>
  );
}

/** Screens not rebuilt yet in this branch — replaced tab by tab. */
function Pending({ screen }: { screen: Screen }) {
  return <div style={{ padding: "24px 20px", color: "var(--rv-sub)", fontSize: 14 }}>{screen} — being rebuilt.</div>;
}
