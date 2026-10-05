"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { MemberData, MemberMembership, MemberOrgMap, MemberReadContext, QuoteInput } from "@/lib/member/types";
import { tierLabel } from "@/lib/member/catalog";
import type { MemberOrderBook } from "@/lib/member/order-book";
import { arenaRankings, type ArenaWeekBrand, type ArenaWeekPicks, type MemberArenaSnapshot } from "@/lib/member/arena";
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
import { useQuote } from "./quote/useQuote";
import { catalogFromProducts, itemsText, type QCatalog } from "./quote/quote-model";
import { tableCalc } from "./quote/table-calc";
import QuoteProducts from "./quote/QuoteProducts";
import QuoteCalc, { CalcDock, DeskCalc, ProductsDock, type CalcProps } from "./quote/QuoteCalc";
import ProductSheet from "./quote/ProductSheet";
import { AllModelsSheet, CartSheet, CustomerQuoteSheet, type CustomerQuote } from "./quote/QuoteSheets";
import qs from "./quote/quote.module.css";
import ProfileMain, { ProfileMini } from "./profile/ProfileMain";
import ViewAsPage from "./profile/ViewAsPage";
import { CommissionSheet, IncomeOrdersPage, IncomePage, PickSomebody } from "./profile/IncomePages";
import { incomeOrdersVM, incomeVM } from "./profile/income-model";
import { honourWindow, honoursVM } from "./profile/honours-model";
import type { MemberHonours } from "@/lib/member/server";
import { snapshotIncome, type IncomeMonth, type MemberIncome } from "@/lib/member/income";
import HonoursPage, { HonourSheet } from "./profile/HonoursPage";
import BrandWeeksPage from "./profile/BrandWeeksPage";
import SchemeSheet from "./profile/SchemeSheet";
import { schemeVM } from "./profile/scheme-model";
import { brandMonthVM, picksToSave } from "./profile/brand-weeks-model";
import TeamPage, { PersonSheet } from "./profile/TeamPage";
import RequestsPage, { RequestSheet, type RequestFilter } from "./profile/RequestsPage";
import RequestForm, { type FormOptions, type SubmitOutcome } from "./profile/RequestForm";
import MemosPage, { MemoSheet, type MemoTab } from "./profile/MemosPage";
import { claimWeeks, memoVM, profileMainVM, replaceable, requestCode, requestDetailVM, requestRowsVM, teamVM, vaGroupsVM, waitingChoices, type RequestEvent } from "./profile/profile-model";
import type { ClaimRates } from "@/lib/member/claim-rules";
import type { HonourKind, MemoVM, RequestKindVM, WorkKey } from "./profile/profile-vm";
import { protoVaGroups } from "./fixtures/proto-profile";

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

export { requestCode };

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
  const appRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const desk = useDesk(appRef);
  const live = device === "live";
  const today = fixedToday ?? klToday();
  const period = today.slice(0, 7);

  // ── Profile: its pages' choices and the sheet each opens ──
  const [compact, setCompact] = useState(false);
  const [vaOpen, setVaOpen] = useState(false);
  const [vaQuery, setVaQuery] = useState("");
  const [coTab, setCoTab] = useState<"mine" | "override">("mine");
  const [coPick, setCoPick] = useState<string | null>(null);
  const [honKind, setHonKind] = useState<HonourKind>("monthly");
  const [honPlace, setHonPlace] = useState<number | null>(null);
  const [personPick, setPersonPick] = useState<string | null>(null);
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [reqFilter, setReqFilter] = useState<RequestFilter>("all");
  const [reqPick, setReqPick] = useState<string | null>(null);
  const [reqForm, setReqForm] = useState<RequestKindVM | null>(null);
  const [revising, setRevising] = useState<{ id: string; detail: Record<string, unknown> } | null>(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [memoTab, setMemoTab] = useState<MemoTab>("all");
  const [memoPick, setMemoPick] = useState<string | null>(null);
  const [memoBusy, setMemoBusy] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [memoRead, setMemoRead] = useState<ReadonlySet<string>>(() => new Set());
  const [memoAcked, setMemoAcked] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [pfDateOpen, setPfDateOpen] = useState(false);
  const [incPeriod, setIncPeriod] = useState<string | null>(null);
  const closeProfileSheets = useCallback(() => {
    setCoPick(null); setHonPlace(null); setPersonPick(null); setReqPick(null); setReqForm(null); setMemoPick(null); setReqError(null); setMemoError(null); setPfDateOpen(false);
    setSchemeOpen(false);
  }, []);

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
  // A Principal viewing somebody: Today's income is that person's own month — Comm Cal's engine, as on
  // My income — never the department's total the Principal's snapshot carries.
  const viewKey = principal && context && working && !fixture ? `${membershipId}|${context.staffId}|${working}` : "";
  const [viewedMonth, setViewedMonth] = useState<{ key: string; month: IncomeMonth } | null>(null);
  useEffect(() => {
    if (!viewKey || !working) return;
    let stale = false;
    void source.income(membershipId, working, context).then(r => { if (!stale && r.ok) setViewedMonth({ key: viewKey, month: r.data.month }); });
    return () => { stale = true; };
  }, [viewKey, membershipId, working, context, source]);
  const viewedIncome = viewKey && viewedMonth?.key === viewKey ? viewedMonth.month : null;
  const income = viewKey ? (viewedIncome ? snapshotIncome(viewedIncome, schemeId) : undefined) : incomes[0];
  const todaySalary = viewKey ? viewedIncome?.basic ?? null : data.profile.salary;
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

  // ── Quote: one brand's catalogue, the cart, and the calculator ──
  const catalogs = useMemo<Record<string, QCatalog>>(() => {
    if (fixture?.quote) return fixture.quote.catalogs;
    return Object.fromEntries(brands.map(b => [b.code, catalogFromProducts(data.products, b.code, b.name, [], data.catalogueModels ?? [])]));
  }, [fixture, brands, data.products, data.catalogueModels]);
  const quoteCalc = useCallback((input: QuoteInput) => {
    const fx = fixture?.quote;
    if (!fx) return source.quote(input);
    const incentives = [...new Set(fx.bands.filter(b => b.kind === "incentive").map(b => b.threshold))];
    return Promise.resolve(tableCalc(input, fx.prices, fx.costDivisor, incentives));
  }, [fixture, source]);
  const quote = useQuote({
    catalogs,
    fallbackBrand: brandList[0]?.code ?? "",
    schemeId,
    bands: fixture?.quote?.bands ?? data.bands,
    storeKey: fixture || data.demo ? null : `${data.profile.userId}-${membershipId}`,
    readOnly: principal && !!route.staff,
    calc: quoteCalc,
    pricing: route.screen === "calc" || (desk && route.screen === "quote"),
    initial: fixture?.quote?.initial,
  });

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
    setCompact(false);
    setVaOpen(false);
    closeProfileSheets();
    if (screen !== "quote" && screen !== "calc") { quote.closeSheet(); quote.setCartOpen(false); quote.setAllOpen(false); }
    quote.setPreviewOpen(false);
    go({ screen, pf: null, ins: "main", arena: "hub", ...extra });
    if (mainRef.current) mainRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the quote's setters are stable
  }, [go, closeProfileSheets]);
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
    if (n.go.to === "memo") { goScreen("account", { pf: "memos" }); if (n.go.memoId) openMemo(n.go.memoId); }
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
    today, first: me.first, title: me.title, rank: me.rank, income, salary: todaySalary, hidden,
    department: principal && !viewed && !fixture ? membership?.name ?? "the department" : undefined,
    insight: work.block ?? undefined, kpi: work.kpi, arena, arenaNow, book: work.book, bands: data.bands, memos, requests, requestCode,
  }, champRank), [today, me, income, todaySalary, hidden, principal, viewed, fixture, membership?.name, work.block, work.kpi, arena, arenaNow, work.book, data.bands, memos, requests, champRank]);

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
    subName: membership?.name ?? "", kpiEnabled: kpiRule.enabled,
    // The whole sub-department closed (the snapshot says so); until it loads, the member's own closes.
    final: arData.snapshot?.final ?? (arPeriod.kind !== "monthly" ? arPeriod.through < period : !isLiveMonth(arPeriod.from, period, monthState)),
    openMonths: arData.snapshot?.openMonths ?? (isLiveMonth(arPeriod.from, period, monthState) ? [arPeriod.from] : []),
    current: period,
  }), [arPeriod, arData.snapshot, arData.history, arData.standings, selfId, membership?.name, kpiRule.enabled, period, monthState]);
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

  // ── Profile ──
  const fxp = fixture?.profile;
  /** A Principal looking at somebody else's app: nothing can be sent or changed. */
  const readOnlyView = principal;
  const nameOf = useCallback((staffId: string) => {
    for (const m of data.memberships) { const p = m.people.find(x => x.id === staffId); if (p) return p.name; }
    return null;
  }, [data.memberships]);
  // The viewed person's requests (a Principal's snapshot holds everybody's).
  const myRequests = useMemo(() => (principal ? (viewed ? requests.filter(r => r.staffId === viewed.id) : []) : requests), [principal, viewed, requests]);
  // View as: the memos read as the viewed person read them — their receipts, not the Principal's.
  const [viewedReceipts, setViewedReceipts] = useState<{ staffId: string; byMemo: Map<string, { readAt: string | null; acknowledgedAt: string | null }> } | null>(null);
  useEffect(() => {
    if (fxp || !principal || !viewed || viewedReceipts?.staffId === viewed.id) return;
    let stale = false;
    void source.memoReceipts(viewed.id).then(res => {
      if (!stale && res.ok) setViewedReceipts({ staffId: viewed.id, byMemo: new Map(res.data.map(x => [x.memoId, x])) });
    });
    return () => { stale = true; };
  }, [fxp, principal, viewed, viewedReceipts?.staffId, source]);
  const memoVMs: MemoVM[] = useMemo(() => {
    if (fxp) return fxp.memos.map(m => ({ ...m, read: m.read || memoRead.has(m.id) || memoAcked.has(m.id), acked: m.acked || memoAcked.has(m.id) }));
    if (principal) {
      const theirs = viewed && viewedReceipts?.staffId === viewed.id ? viewedReceipts.byMemo : new Map();
      return memos.map(m => memoVM({ ...m, readAt: theirs.get(m.id)?.readAt ?? null, acknowledgedAt: theirs.get(m.id)?.acknowledgedAt ?? null },
        { read: new Set(), acked: new Map() }));
    }
    return memos.map(m => memoVM(m, { read: memoRead, acked: memoAcked }));
  }, [fxp, principal, viewed, viewedReceipts, memos, memoRead, memoAcked]);
  const profileVM = useMemo(() => {
    if (fxp) return principal && !viewed ? fxp.main.principal : viewed ? fxp.main.viewing[viewed.id] ?? fxp.main.me : fxp.main.me;
    return profileMainVM({ name: me.name, title: me.title, rank: me.rank, subName: principal && !viewed ? null : membership?.name ?? null,
      requests: myRequests, memos: principal && !viewed ? [] : memoVMs });
  }, [fxp, principal, viewed, me, membership?.name, myRequests, memoVMs]);
  const [cancelled, setCancelled] = useState<ReadonlySet<string>>(() => new Set());
  const reqRows = useMemo(() => {
    const rows = fxp ? fxp.requests.rows : requestRowsVM(myRequests, nameOf);
    return rows.map(r => (cancelled.has(r.id) ? { ...r, status: "Cancelled", tone: "none" as const } : r));
  }, [fxp, myRequests, nameOf, cancelled]);
  const [history, setHistory] = useState<Record<string, RequestEvent[]>>({});
  const reqDetail = useMemo(() => {
    if (!reqPick) return null;
    if (fxp) {
      const d = fxp.requests.details[reqPick];
      if (!d || !cancelled.has(reqPick)) return d ?? null;
      return { ...d, status: "Cancelled", tone: "none" as const, canCancel: false, facts: d.facts.map(f => (f.l === "Current step" ? { ...f, v: "Cancelled" } : f)),
        log: [...d.log.map(e => ({ ...e, dot: "past" as const })), { what: "Cancelled", who: "You", when: "Just now", note: "", dot: "bad" as const }] };
    }
    const r = myRequests.find(x => x.id === reqPick);
    return r ? requestDetailVM(r, history[r.id] ?? null, { nameOf, readOnly: readOnlyView }) : null;
  }, [reqPick, fxp, cancelled, myRequests, history, nameOf, readOnlyView]);
  const vaGroups = useMemo(() => (fxp
    ? protoVaGroups(fxp.va.people, fxp.va.departments, vaQuery, viewed?.id ?? "")
    : vaGroupsVM(data.memberships, vaQuery, viewed?.id ?? "")), [fxp, data.memberships, vaQuery, viewed?.id]);
  const pickVa = useCallback((staffId: string, departmentId: string) => {
    setVaOpen(false); setVaQuery("");
    goScreen("today", { staff: staffId, department: departmentId });
  }, [goScreen]);

  // Memos: opening one is reading it; acknowledging records the member's name and time for HR.
  const openMemo = useCallback((id: string) => {
    setMemoError(null);
    setMemoPick(id);
    if (readOnlyView || memoRead.has(id)) return;
    setMemoRead(prev => new Set(prev).add(id));
    const memo = memos.find(m => m.id === id);
    if (!fxp && memo && !memo.readAt) void source.memo(id, false);
  }, [readOnlyView, memoRead, memos, fxp, source]);
  const ackMemo = useCallback(async () => {
    if (!memoPick || readOnlyView) return;
    setMemoBusy(true); setMemoError(null);
    const result = fxp ? { ok: true as const, data: { acknowledgedAt: new Date().toISOString() } } : await source.memo(memoPick, true);
    setMemoBusy(false);
    if (!result.ok) { setMemoError(result.error); return; }
    const at = result.data.acknowledgedAt ?? new Date().toISOString();
    setMemoAcked(prev => new Map(prev).set(memoPick, at));
  }, [memoPick, readOnlyView, fxp, source]);
  const memoPickVM = memoPick ? memoVMs.find(m => m.id === memoPick) ?? null : null;

  // Requests: send one, cancel one still with HR, update one HR returned.
  const openRequest = useCallback((id: string) => {
    setReqError(null);
    setReqPick(id);
    if (fxp || history[id]) return;
    void source.requestHistory(id).then(r => { if (r.ok) setHistory(prev => ({ ...prev, [id]: r.data })); });
  }, [fxp, history, source]);
  const submitRequest = useCallback(async (form: FormData): Promise<SubmitOutcome> => {
    if (fxp) { await new Promise(r => setTimeout(r, 250)); return { ok: true, code: "RQ-2610-004" }; }
    const result = await source.submitRequest(form);
    if (!result.ok) return result;
    void source.refresh().then(r => { if (r.ok) setData(r.data); });
    setHistory(prev => { const next = { ...prev }; delete next[result.data.id]; return next; });
    return { ok: true, code: requestCode(result.data) };
  }, [fxp, source]);
  const cancelRequest = useCallback(async () => {
    if (!reqPick || readOnlyView) return;
    if (fxp) { setCancelled(prev => new Set(prev).add(reqPick)); return; }
    setReqBusy(true); setReqError(null);
    const result = await source.cancelRequest(reqPick);
    setReqBusy(false);
    if (!result.ok) { setReqError(result.error); return; }
    setHistory(prev => { const next = { ...prev }; delete next[reqPick]; return next; });
    const refreshed = await source.refresh();
    if (refreshed.ok) setData(refreshed.data);
    void source.requestHistory(reqPick).then(r => { if (r.ok) setHistory(prev => ({ ...prev, [reqPick]: r.data })); });
  }, [reqPick, readOnlyView, fxp, source]);
  const updateRequest = useCallback(() => {
    const r = myRequests.find(x => x.id === reqPick);
    if (!r) return;
    setReqPick(null);
    setRevising({ id: r.id, detail: r.detail });
    setReqForm(r.kind);
  }, [myRequests, reqPick]);

  // Team & capacity: the department's map, read when the page opens.
  const [orgMap, setOrgMap] = useState<MemberOrgMap | null>(null);
  useEffect(() => {
    if (fxp || route.screen !== "account" || route.pf !== "team" || orgMap || !readable) return;
    let stale = false;
    void source.orgMap(context ? { subDepartmentId: context.subDepartmentId } : undefined).then(r => { if (!stale && r.ok) setOrgMap(r.data); });
    return () => { stale = true; };
  }, [fxp, route.screen, route.pf, orgMap, readable, context, source]);
  const teamView = useMemo(() => {
    if (fxp) return fxp.team;
    if (!orgMap || !membership) return null;
    const staffId = viewed?.id ?? data.profile.id;
    return teamVM({
      map: orgMap, departmentId: membership.id, subName: membership.name, staffId,
      people: arena?.people ?? [], month: working ?? period, kpi: kpiRule,
      capacity: membership.capacity, occupied: membership.occupied,
      ranks: new Map(membership.people.map(p => [p.id, p.rank])),
    });
  }, [fxp, orgMap, membership, viewed?.id, data.profile.id, arena?.people, working, period, kpiRule]);

  // My income: the month being worked unless another is picked — live until the close, fixed after.
  const hasTeam = useMemo(() => replaceable(principal && viewed ? membership && { ...membership, people: membership.people.map(p => ({ ...p, self: p.id === viewed.id })) } : membership).length > 0, [principal, viewed, membership]);
  const incMonth = incPeriod ?? working ?? period;
  const incKey = `${membershipId}|${context?.staffId ?? ""}|${incMonth}`;
  const [incomeByKey, setIncomeByKey] = useState<Record<string, MemberIncome>>({});
  const [incBooks, setIncBooks] = useState<Record<string, MemberOrderBook>>({});
  const [incError, setIncError] = useState<Record<string, string>>({});
  const onIncome = route.screen === "account" && (route.pf === "income" || route.pf === "incOrders");
  const inRecent = incMonth === prevMonth || incMonth === period;
  useEffect(() => {
    if (fxp || !onIncome || !membershipId || !readable || incomeByKey[incKey]) return;
    let stale = false;
    void source.income(membershipId, incMonth, context).then(r => {
      if (stale) return;
      if (r.ok) setIncomeByKey(prev => ({ ...prev, [incKey]: r.data }));
      else setIncError(prev => ({ ...prev, [incKey]: r.error }));
    });
    if (!inRecent && !incBooks[incKey]) {
      void source.orderBook(membershipId, incMonth, incMonth, context).then(r => { if (!stale && r.ok) setIncBooks(prev => ({ ...prev, [incKey]: r.data })); });
    }
    return () => { stale = true; };
  }, [fxp, onIncome, membershipId, readable, incomeByKey, incBooks, incKey, incMonth, inRecent, context, source]);
  const incData = incomeByKey[incKey] ?? null;
  const incBook = inRecent ? recent : incBooks[incKey] ?? null;
  const incomeView = useMemo(() => (fxp ? (hidden ? fxp.income.hidden : fxp.income.shown) : incData ? incomeVM(incData, hidden, hasTeam) : null), [fxp, hidden, incData, hasTeam]);
  const ordersView = useMemo(() => (fxp ? (hidden ? fxp.orders.hidden : fxp.orders.shown)
    : incData ? incomeOrdersVM(incData, incBook, data.bands, hidden) : null), [fxp, hidden, incData, incBook, data.bands]);
  // My honours: the period picked (the month being worked by default), and the one before it for the chip.
  const [honFrom, setHonFrom] = useState<string | null>(null);
  const honStart = periodOf(honKind, honFrom ?? working ?? period, period).from;
  const honWin = useMemo(() => honourWindow(honKind, honStart), [honKind, honStart]);
  const honRange = useMemo(() => {
    const all = [...honWin.prev, ...honWin.months].filter(m => m <= period).sort();
    return all.length ? { from: all[0], until: all[all.length - 1] } : null;
  }, [honWin, period]);
  const honKey = honRange ? `${membershipId}|${context?.staffId ?? ""}|${honRange.from}|${honRange.until}` : "";
  const [honByKey, setHonByKey] = useState<Record<string, MemberHonours>>({});
  const [honError, setHonError] = useState<Record<string, string>>({});
  useEffect(() => {
    if (fxp || route.screen !== "account" || route.pf !== "honours" || !honRange || !membershipId || !readable || honByKey[honKey]) return;
    let stale = false;
    void source.honours(membershipId, honRange.from, honRange.until, context).then(r => {
      if (stale) return;
      if (r.ok) setHonByKey(prev => ({ ...prev, [honKey]: r.data }));
      else setHonError(prev => ({ ...prev, [honKey]: r.error }));
    });
    return () => { stale = true; };
  }, [fxp, route.screen, route.pf, honRange, membershipId, readable, honByKey, honKey, context, source]);
  const honoursView = useMemo(() => (fxp ? fxp.honours[honKind]
    : honByKey[honKey] ? honoursVM(honByKey[honKey], honKind, honStart, period, membership?.name ?? "your sub-department") : null),
    [fxp, honKind, honByKey, honKey, honStart, period, membership?.name]);

  // Commission scheme: the member's place in it and each brand's ladder. A Principal's view has the viewed
  // person's title and rank, the engine's rate once My income read it, and never their salary.
  const schemeView = useMemo(() => schemeVM({
    name: me.name, ini: me.ini, title: me.title, rank: me.rank,
    membership: principal ? undefined : membership,
    rate: principal ? incData?.month.rate ?? null : undefined,
    salary: principal ? undefined : data.profile.salary, bands: data.bands, hidden,
  }), [me.name, me.ini, me.title, me.rank, membership, principal, incData, data.profile.salary, data.bands, hidden]);

  // My brand weeks: this month's weekends first, then the month still being worked; the edits not saved yet, per month.
  const backOffice = principal && !!context;
  const [bwEdits, setBwEdits] = useState<Record<string, ArenaWeekPicks>>({});
  const [bwBusy, setBwBusy] = useState(false);
  const [bwError, setBwError] = useState<string | null>(null);
  const [bwSaved, setBwSaved] = useState(false);
  useEffect(() => { setBwEdits({}); setBwSaved(false); setBwError(null); }, [membershipId, context?.staffId]);
  const bwSnaps = useMemo(() => [arenaNow ?? arena, arenaNow ? arena : null].filter((x): x is MemberArenaSnapshot => !!x), [arena, arenaNow]);
  const bwMonths = useMemo(() => (bwSnaps.length ? bwSnaps.map(snap => brandMonthVM(snap, bwEdits[snap.period], backOffice)) : null), [bwSnaps, bwEdits, backOffice]);
  const pickBrandWeek = (month: string, week: string, brand: ArenaWeekBrand | undefined) => {
    setBwSaved(false); setBwError(null);
    setBwEdits(prev => ({ ...prev, [month]: { ...prev[month], [week]: brand } }));
  };
  const saveBrandWeeks = async () => {
    if (!membershipId || bwBusy) return;
    setBwBusy(true); setBwError(null);
    try {
      for (const snap of bwSnaps) {
        if (!brandMonthVM(snap, bwEdits[snap.period], backOffice).dirty) continue;
        const r = await source.saveBrandWeeks(membershipId, snap.period, picksToSave(snap, bwEdits[snap.period]), context);
        if (!r.ok) { setBwError(r.error); return; }
        // Read the month again: the weeks' booths, Today's reminder and the Arena all follow the new picks.
        const fresh = await source.arena(membershipId, snap.period, "monthly", context);
        if (fresh.ok) {
          const next = viewedAs(fresh.data, context?.staffId);
          if (arena && snap.period === arena.period) setArena(next); else setArenaNow(next);
        }
        setBwEdits(prev => Object.fromEntries(Object.entries(prev).filter(([m]) => m !== snap.period)));
      }
      setBwSaved(true);
    } finally {
      setBwBusy(false);
    }
  };

  // The claim form's choices: the member's fair weekends, HR's rates, their team, the departments.
  const [claimRates, setClaimRates] = useState<ClaimRates | null>(null);
  useEffect(() => {
    if (fxp || route.screen !== "account" || route.pf !== "requests" || claimRates || readOnlyView) return;
    let stale = false;
    void source.claimRates().then(r => { if (!stale && r.ok) setClaimRates(r.data); });
    return () => { stale = true; };
  }, [fxp, route.screen, route.pf, claimRates, readOnlyView, source]);
  const formOptions: FormOptions = useMemo(() => {
    if (fxp) return fxp.form;
    return {
      subName: membership?.name ?? "",
      weeks: claimWeeks([arena, arenaNow], today),
      rates: claimRates ?? { base: "Klang Valley", perSpot: null, perPaxNight: null, regions: [] },
      members: replaceable(membership),
      departments: data.departments ?? [],
      departmentId: membership?.id ?? "",
      waitingList: waitingChoices(myRequests),
    };
  }, [fxp, membership, arena, arenaNow, today, claimRates, data.departments, myRequests]);

  const signOut = () => { const f = document.createElement("form"); f.method = "post"; f.action = "/member/signout"; document.body.appendChild(f); f.submit(); };

  // ── layout ──
  const quotePanel = quote.sheet !== null || quote.cartOpen || quote.allOpen || quote.previewOpen;
  const profilePanel = route.screen === "account" && (coPick !== null || honPlace !== null || personPick !== null || reqPick !== null || reqForm !== null || memoPick !== null || pfDateOpen || schemeOpen);
  const anyPanel = sheet !== null || dateOpen || soPick !== null || tiersOpen || fairsOpen || champOpen || quotePanel || profilePanel;
  // View as takes the page column's place too (the prototype's `vaPE` opens the rail).
  const rail = desk && (nfOpen || anyPanel || route.screen === "quote" || vaOpen);
  const showHeader = route.screen === "today" || route.screen === "calc";
  // Profile's glow runs up into the status bar until the page scrolls (or View as covers it).
  const statusBg = route.screen === "account" && !route.pf && !compact && !vaOpen ? "var(--rv-peach)" : "var(--rv-white)";
  const screenVars = {
    "--status-bg": statusBg,
    "--status-h": live ? "env(safe-area-inset-top, 0px)" : android ? "38px" : "54px",
  } as CSSProperties;

  // ── Quote: step 1, step 2 and the desktop calculator share one set of props ──
  const toCalc = () => { if (quote.items && !quote.readOnly) { quote.setCartOpen(false); goScreen("calc"); } };
  const calcProps: CalcProps = {
    vm: quote.vm,
    brandName: quote.catalog?.name ?? "",
    cart: quote.cart,
    fee: quote.fee,
    kpiEach: Object.fromEntries((quote.catalog?.kpis ?? []).map(k => [k.key, k.price])),
    onPress: quote.press,
    onNext: quote.applyNext,
    onBump: quote.bump,
    onFee: quote.setFee,
    onProducts: () => goScreen("quote"),
  };
  const customer: CustomerQuote | null = quote.confirmed ? {
    lines: quote.cart.map(l => ({ name: [l.name, l.size].filter(Boolean).join(" · "), qty: l.qty })),
    build: quote.cart.some(l => l.kind === "sofa") && quote.build.height && quote.build.tier
      ? [`Sofa build: seat height ${quote.build.height} · ${tierLabel(quote.build.tier)} fabric`] : [],
    price: quote.confirmed.price,
    fee: quote.confirmed.delivery,
    text: quote.confirmed.customerText ?? "",
  } : null;
  const onQuote = route.screen === "quote" || route.screen === "calc";

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
  } else if (onQuote && !quote.catalog) {
    page = <div className={qs.page}><p className={qs.recentEmpty}>No brands are set up for quotes in {membership?.name ?? "this sub-department"} yet.</p></div>;
  } else if (route.screen === "quote" && quote.catalog) {
    page = <QuoteProducts catalog={quote.catalog} memory={quote.memory} onBrand={() => openSheet("brand")} onSet={quote.applySet}
      onAll={() => { quote.setQuery(""); quote.setAllOpen(true); }} onFrameOnly={quote.openFrameOnly} onAccOnly={quote.openAccOnly} />;
  } else if (route.screen === "calc" && quote.catalog) {
    page = <QuoteCalc {...calcProps} />;
  } else if (route.screen === "account") {
    const back = () => goScreen("account");
    const pf = route.pf;
    const pick = principal && !viewed && !fxp && pf !== "memos" && pf !== "team" && pf !== null;
    if (pick) {
      page = <PickSomebody title={pf === "income" || pf === "incOrders" ? "My income" : pf === "honours" ? "My honours" : pf === "brandWeeks" ? "My brand weeks" : "Requests"}
        onBack={back} onViewAs={() => setVaOpen(true)} />;
    } else if (pf === "income") {
      page = <IncomePage vm={incomeView} hidden={hidden} message={incError[incKey] ?? null} onBack={back} onPeriod={() => setPfDateOpen(true)} onToggleHide={() => setHidden(!hidden)}
        onOrders={() => goScreen("account", { pf: "incOrders" })} onMonth={p => { setIncPeriod(p); if (mainRef.current) mainRef.current.scrollTop = 0; }} />;
    } else if (pf === "incOrders") {
      page = <IncomeOrdersPage vm={ordersView} tab={coTab} message={incError[incKey] ?? null} onTab={t => { setCoTab(t); setCoPick(null); }} onBack={() => goScreen("account", { pf: "income" })}
        onPeriod={() => setPfDateOpen(true)} onRow={setCoPick} />;
    } else if (pf === "honours") {
      page = <HonoursPage vm={honoursView} kind={honKind} message={honError[honKey] ?? null} onKind={k => { setHonKind(k); setHonFrom(null); setHonPlace(null); }} onBack={back}
        onPeriod={() => setPfDateOpen(true)} onPlace={setHonPlace} />;
    } else if (pf === "team") {
      page = <TeamPage vm={teamView} onBack={back} onPerson={setPersonPick} />;
    } else if (pf === "requests") {
      page = <RequestsPage rows={reqRows} filter={reqFilter} readOnly={readOnlyView} onFilter={setReqFilter} onBack={back}
        onNew={k => { setRevising(null); setReqForm(k); }} onOpen={openRequest} />;
    } else if (pf === "memos") {
      page = <MemosPage memos={memoVMs} tab={memoTab} onTab={setMemoTab} onBack={back} onOpen={openMemo} />;
    } else if (pf === "brandWeeks") {
      page = <BrandWeeksPage months={bwMonths} backOffice={backOffice} busy={bwBusy} error={bwError} saved={bwSaved}
        onPick={pickBrandWeek} onSave={() => void saveBrandWeeks()} onBack={back} />;
    } else {
      page = <ProfileMain vm={profileVM} hidden={hidden} actions={{
        open: (key: WorkKey) => goScreen("account", { pf: key }),
        scheme: () => setSchemeOpen(true),
        brandWeeks: () => goScreen("account", { pf: "brandWeeks" }),
        toggleHide: () => setHidden(!hidden),
        signOut,
        viewAs: principal && !viewed ? () => setVaOpen(true) : undefined,
      }} />;
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
      {viewed && <ViewingAsBar me={me} onSwitch={() => setVaOpen(true)} onExit={() => goScreen("account", { staff: "" })} />}
      {showHeader && (
        <MobileHeader ruled={scrolled} back={route.screen === "calc"} subName={membership?.name ?? ""} count={nfCount} me={me}
          onLogo={() => goScreen("today")} onBack={() => goScreen("quote")} onSubDept={() => openSheet("sd")} onBell={openNotif}
          onProfile={() => goScreen("account")} />
      )}
      <main ref={mainRef} className={s.main} onScroll={e => { const t = e.currentTarget.scrollTop; const v = t > 4, c = t > 110; if (v !== scrolled) setScrolled(v); if (c !== compact) setCompact(c); }}>
        {page}
      </main>
      {route.screen === "quote" && quote.catalog && (
        <ProductsDock items={quote.items} itemsText={itemsText(quote.cart, quote.catalog.name)} open={quote.cartOpen} onBag={quote.toggleCart} onSetPrice={toCalc} />
      )}
      {route.screen === "calc" && quote.catalog && <CalcDock ready={!!customer} onPreview={() => { if (customer) quote.setPreviewOpen(true); }} />}
      <BottomNav active={route.screen} android={android} live={live} onGo={goScreen} onQuote={() => openSheet("brand")} />
      <SubDeptSheet open={sheet === "sd"} options={subOptions} current={membership?.id ?? ""} onClose={() => setSheet(null)}
        onPick={id => { setSheet(null); go({ department: id, staff: principal ? route.staff : "" }); }} />
      <Notifications open={nfOpen} summary={nfSummaryVM} tab={nfTab} groups={nfGroupsVM}
        onTab={setNfTab} onClose={() => setNfOpen(false)} onReadAll={() => setReadAll(true)} onOpen={openNotifItem} />
      <BrandPicker open={sheet === "brand"} brands={brandList} current={quote.brand} onQuote={onQuote} cartItems={quote.items}
        onClose={() => setSheet(null)} onPick={code => { quote.setBrand(code); goScreen("quote"); }} />
      {onQuote && quote.catalog && (
        <>
          <DeskCalc show={desk && route.screen === "quote" && !anyPanel && !nfOpen} {...calcProps} />
          <AllModelsSheet open={quote.allOpen} catalog={quote.catalog} cart={quote.cart} query={quote.query} onQuery={quote.setQuery}
            onClose={() => quote.setAllOpen(false)} onModel={quote.openModel} />
          <CartSheet open={quote.cartOpen && quote.cart.length > 0} cart={quote.cart} brandName={quote.catalog.name} itemsText={itemsText(quote.cart, quote.catalog.name)}
            onClose={() => quote.setCartOpen(false)} onClear={quote.clearCart} onBump={quote.bump} onRemove={quote.remove} onSetPrice={toCalc} />
          <ProductSheet sheet={quote.sheet} catalog={quote.catalog} memory={quote.memory} cart={quote.cart} build={quote.build} readOnly={quote.readOnly}
            actions={{
              close: quote.closeSheet, patch: quote.patch, patchFrame: quote.patchFrame, openBf: quote.openBf, editBf: quote.editBf,
              removeBf: quote.removeBf, backToMattress: quote.backToMattress, applyFrame: quote.applyFrame, add: quote.addSheet,
            }} />
          <CustomerQuoteSheet open={quote.previewOpen} quote={customer} brandName={quote.catalog.name} onClose={() => quote.setPreviewOpen(false)} />
        </>
      )}
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
      {route.screen === "account" && !route.pf && !desk && (
        <ProfileMini on={compact} name={profileVM.name} ini={profileVM.ini} title={profileVM.title} rank={profileVM.rank} />
      )}
      {route.screen === "account" && (
        <>
          {(route.pf === "income" || route.pf === "incOrders") && (
            <DateSheet open={pfDateOpen} kind="monthly" options={periodOptions("monthly", period, monthState)} selected={incMonth} segmented={false} ctx="My income"
              onPick={o => { setIncPeriod(o.period.from); setPfDateOpen(false); }} onClose={() => setPfDateOpen(false)} />
          )}
          {route.pf === "incOrders" && <CommissionSheet open={coPick !== null} vm={coPick ? ordersView?.sheets[coPick] ?? null : null} onClose={() => setCoPick(null)} />}
          {route.pf === "honours" && (
            <DateSheet open={pfDateOpen} kind={honKind} options={periodOptions(honKind, period, monthState)} selected={honStart} segmented={false} ctx="My honours"
              onPick={o => { setHonFrom(o.period.from); setHonPlace(null); setPfDateOpen(false); }} onClose={() => setPfDateOpen(false)} />
          )}
          {route.pf === "honours" && <HonourSheet open={honPlace !== null} place={honPlace} vm={honoursView} periodLabel={honoursView?.periodLabel ?? ""} onClose={() => setHonPlace(null)} />}
          {route.pf === "team" && <PersonSheet open={personPick !== null} vm={personPick ? teamView?.sheets[personPick] ?? null : null} onClose={() => setPersonPick(null)} />}
          {route.pf === "requests" && (
            <>
              <RequestSheet open={reqPick !== null} vm={reqDetail} busy={reqBusy} error={reqError} onCancel={() => void cancelRequest()} onUpdate={updateRequest} onClose={() => setReqPick(null)} />
              <RequestForm kind={reqForm} options={formOptions} revising={revising} readOnly={readOnlyView} onSubmit={submitRequest}
                onClose={() => { setReqForm(null); setRevising(null); }} />
            </>
          )}
          {route.pf === "memos" && <MemoSheet open={memoPick !== null} memo={memoPickVM} busy={memoBusy} readOnly={readOnlyView} error={memoError} onAck={() => void ackMemo()} onClose={() => setMemoPick(null)} />}
          {!route.pf && <SchemeSheet open={schemeOpen} vm={schemeView} onClose={() => setSchemeOpen(false)} />}
        </>
      )}
      {principal && <ViewAsPage open={vaOpen} query={vaQuery} groups={vaGroups} onQuery={setVaQuery} onPick={pickVa} onClose={() => setVaOpen(false)} />}
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
