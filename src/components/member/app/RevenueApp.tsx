"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MemberCatalogue, MemberCatalogueModel, MemberData, MemberMembership, MemberOrgMap, MemberProduct, MemberReadContext, QuoteInput } from "@/lib/member/types";
import type { ProductListAccess } from "@/lib/member/product-access";
import { NOTHING_CLOSED, requestPageOf, type AppClosed } from "@/lib/member/app-pages";
import { allowedRoute, landing, requestPage, sends, shows } from "./app-access";
import { setViewAs } from "@/components/layout/view-as-actions";
import PushAsk from "@/components/pwa/PushAsk";
import { reportPushTrouble, savePushSubscription } from "@/lib/push/actions";
import type { MemberOrderBook } from "@/lib/member/order-book";
import { arenaRankings, type MemberArenaSnapshot } from "@/lib/member/arena";
import { championshipMonth, championshipStandings } from "@/lib/member/championship";
import base from "./base.module.css";
import s from "./shell.module.css";
import { firstName, greeting, initials, klToday, longDayLabel, monthName, quarterLabel } from "./format";
import { PRODUCTS_PATH, appHref, productsHref, useRoute, type Board, type InsightView, type Route, type Screen } from "./route";
import { ProductShellContext, type ProductShell } from "./product-shell";
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
import { useMonthArena } from "./arena/useMonthArena";
import { ask, createLiveSource, demoSource, settleRead, type RevenueSource, type TrackRead } from "./source";
import type { MemberWaitingForm } from "@/lib/member/server";
import { useKeyedRead } from "./useKeyedRead";
import { BottomNav, DeskAside, DeskHeader, MobileHeader, ViewingAsBar, type Me, type ModuleId } from "./shell/Chrome";
import { useCrmUnread } from "./shell/useCrmUnread";
import { useLiveBell } from "./shell/useLiveBell";
import PullRefresh from "./shell/PullRefresh";
import { RETURN_REFRESH_MS, isStaleAppError, reloader } from "./shell/pull-refresh";
import StatusBar from "./shell/StatusBar";
import Today from "./today/Today";
import { hideIncome, todayModel, type TodayTodo } from "./today/today-model";
import SubDeptSheet, { type SubDeptOption } from "./overlays/SubDeptSheet";
import BrandPicker, { type BrandOption } from "./overlays/BrandPicker";
import Notifications from "./notifications/Notifications";
import { notifGroups, notifications, notifSummary, type NotifItem, type NotifTab, type SettledResults } from "./notifications/notify-model";
import type { AppFixture } from "./fixtures/proto";
import { useQuote } from "./quote/useQuote";
import { catalogFromProducts, itemsText, type QCatalog } from "./quote/quote-model";
import { customerQuote } from "./quote/calc-model";
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
import { snapshotIncome, type DepartmentIncome, type IncomeMonth, type MemberIncome } from "@/lib/member/income";
import HonoursPage, { HonourSheet } from "./profile/HonoursPage";
import BrandWeeksPage from "./profile/BrandWeeksPage";
import SchemeSheet from "./profile/SchemeSheet";
import PasswordSheet from "./profile/PasswordSheet";
import EmailSheet from "./profile/EmailSheet";
import type { RequestEmailActions } from "@/components/account/use-request-email";
import type { ChangePassword } from "@/components/account/use-change-password";
import { schemeVM } from "./profile/scheme-model";
import { brandWeeksVM } from "./profile/brand-weeks-model";
import TeamPage, { PersonSheet } from "./profile/TeamPage";
import RequestsPage, { RequestSheet, type RequestFilter } from "./profile/RequestsPage";
import TrackPage, { RequestInfoSheet, type TrackSegment } from "./profile/TrackPage";
import RoomsPage, { RoomBookSheet, RoomViewSheet } from "./profile/RoomsPage";
import { useMemberRooms } from "./profile/useMemberRooms";
import DocsPage from "./profile/DocsPage";
import { useMemberDocs } from "./profile/useMemberDocs";
import { editChanges, editProblem, revisionForm } from "@/lib/member/request-edit";
import type { WaitingQueue } from "@/lib/member/waiting-queue";
import RequestForm, { type FormOptions, type SubmitOutcome } from "./profile/RequestForm";
import MemosPage, { MemoSheet, type MemoTab } from "./profile/MemosPage";
import { claimWeeks, memoVM, profileMainVM, replaceable, requestCode, requestDetailVM, requestKindOf, requestRowsVM, teamVM, trackVM, vaGroupsVM, waitingChoices, type RequestEvent } from "./profile/profile-model";
import { foodOpenTo, type ClaimRates } from "@/lib/member/claim-rules";
import type { HonourKind, MemoVM, RequestKindVM, WorkKey } from "./profile/profile-vm";
import { protoVaGroups } from "./fixtures/proto-profile";
import CrmApp, { type CrmOpen } from "../crm/CrmApp";
import type { Notices } from "@/lib/push/notices";
import { readNotices } from "@/lib/push/actions";

export type Device = "live" | "ios" | "android" | "desktop";

export interface RevenueAppProps {
  initialData: MemberData;
  /** The page's query string, so the first render matches the server's — read from the URL when absent. */
  initialSearch?: string;
  /**
   * The page the server rendered inside the app: the Product List on
   * `/member/products` (2026-10-08). The app's own screens ignore it.
   */
  children?: ReactNode;
  /** Shows the Product List in the sidebar — only for an account holding `product_list`. */
  productList?: ProductListAccess | null;
  /** Profile › My leads & appointments: the account holds CRM · View (2026-10-10). Previews keep it. */
  crm?: boolean;
  /**
   * The pages and sends their ticks close (2026-10-11, lib/member/app-pages.ts): a closed page is
   * neither shown nor reachable, a closed send leaves its page sending nothing. Previews close none.
   */
  closed?: AppClosed;
  /** What the database told them (2026-10-11, mig 20261011180000) — the bell's UPDATES. None for the Principal. */
  notices?: Notices;
  /**
   * Profile › Change password (2026-10-12): the portal's own action (lib/account/actions.ts), handed in by the layout
   * only for a login that is a person's own, never a shared account (lib/account/personal-login.ts). Absent on the
   * previews.
   */
  changePassword?: ChangePassword;
  /**
   * Profile › Request to change email (2026-10-16): the portal's own actions (lib/account/actions.ts), handed in by the
   * layout on Change password's terms — a login of their own only. Absent on the previews.
   */
  requestEmail?: RequestEmailActions;
  /**
   * The Principal's own memos (2026-10-12 — the user: a memo reaches its person in every view and is acknowledged
   * once): their People record's, handed in by the layout for a Principal whose login a record names. While they view
   * nobody, Profile › Memos and the bell are these; acknowledging one is the login's receipt, as in the portal.
   */
  own?: { memos: MemberData["memos"] };
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
/** Longest the first reads wait for the phone's kept answers to load. */
const MEMORY_WAIT_MS = 300;
/** After the open's reads, how long before the Quote's catalogue is read in the background (a phone that kept none). */
const CATALOGUE_WARM_MS = 1500;

/** The catalogue is read in the background by the live app only, and only when the phone kept none to show. */
function catalogueNeedsWarm(source: RevenueSource, live: boolean, demo: boolean, fixture: boolean): boolean {
  return live && !demo && !fixture && !!source.catalogue && source.peek?.(ask.catalogue()) === undefined;
}
const NO_PRODUCTS: MemberProduct[] = [];
const NO_MODELS: MemberCatalogueModel[] = [];
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

const NO_NOTICES: Notices = { unread: 0, items: [] };

export default function RevenueApp({ initialData, initialSearch, children, productList = null, crm = true, closed = NOTHING_CLOSED, notices = NO_NOTICES, changePassword, requestEmail, own, device = "live", today: fixedToday, source: sourceProp, fixture }: RevenueAppProps) {
  // The live app keeps its answers on the phone, per account (2026-10-08, read-memory.ts): the next open shows them
  // at once and reads everything again behind them.
  const account = initialData.demo ? "" : initialData.profile.userId;
  const source = useMemo(() => sourceProp ?? (initialData.demo ? demoSource : createLiveSource(account)), [sourceProp, initialData.demo, account]);
  // Nothing is asked for until the phone's answers are loaded (a few ms): asked before, the first screen would wait
  // for the server after all. Never longer than MEMORY_WAIT_MS — a slow or broken store only costs that.
  const [memoryReady, setMemoryReady] = useState(() => !source.ready);
  useEffect(() => {
    if (!source.ready) { setMemoryReady(true); return; }
    let live = true;
    const timer = window.setTimeout(() => { if (live) setMemoryReady(true); }, MEMORY_WAIT_MS);
    void source.ready.then(() => { if (live) setMemoryReady(true); });
    return () => { live = false; window.clearTimeout(timer); };
  }, [source]);
  const [data, setData] = useState(initialData);
  // The server renders the app again only when the Product List refreshes after a save: what it sends
  // then is newer than what the app holds (the Quote's catalogue among it), so it is taken.
  useEffect(() => { setData(initialData); }, [initialData]);
  const searchNow = useSearchParams()?.toString() ?? "";
  const [baseRoute, go] = useRoute(initialSearch ?? (searchNow ? `?${searchNow}` : ""));
  // The Product List is a page of its own (`/member/products`), drawn inside the app.
  const pathname = usePathname();
  const router = useRouter();
  const onProducts = pathname === PRODUCTS_PATH;
  // A page their ticks close is never drawn: the app opens where it opens instead (2026-10-11), and the
  // address follows below.
  const route = useMemo<Route>(() => (onProducts ? { ...baseRoute, screen: "products", staff: "" } : allowedRoute(baseRoute, closed)),
    [onProducts, baseRoute, closed]);
  const home = landing(closed);
  const hiddenScreens = useMemo<Screen[]>(() => (["today", "insight", "quote", "arena"] as const).filter(page => !shows(closed, page)), [closed]);
  const closedRows = useMemo<WorkKey[]>(() => (["income", "honours", "requests", "track", "team", "rooms", "docs"] as const).filter(page => !shows(closed, page)), [closed]);
  // My income closed (the user, 2026-10-11: "go with your recommendations for hidden amount"): Today's income card
  // keeps its place with the amount hidden, as the eye hides it — and no eye, nor Profile's Privacy, can show it.
  const incomeShut = !shows(closed, "income");
  const requestKinds = useMemo(() => (["claim", "replacement", "waiting"] as const).filter(kind => sends(closed, requestPageOf(kind))), [closed]);
  const quoteSends = sends(closed, "quote");
  useEffect(() => {
    if (!onProducts && route !== baseRoute) go({ screen: route.screen, pf: null, ins: "main", arena: "hub" }, true);
  }, [onProducts, route, baseRoute, go]);
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
  // Profile › Change password's sheet (2026-10-12).
  const [pwOpen, setPwOpen] = useState(false);
  // …and Request to change email's (2026-10-16).
  const [emailOpen, setEmailOpen] = useState(false);
  const [reqFilter, setReqFilter] = useState<RequestFilter>("all");
  const [reqPick, setReqPick] = useState<string | null>(null);
  const [reqForm, setReqForm] = useState<RequestKindVM | null>(null);
  const [revising, setRevising] = useState<{ id: string; detail: Record<string, unknown> } | null>(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [trackSeg, setTrackSeg] = useState<TrackSegment>("waiting");
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
    setSchemeOpen(false); setPwOpen(false);
  }, []);

  useEffect(() => {
    if (live && /Android/i.test(navigator.userAgent)) setAndroid(true);
  }, [live]);

  // ── pull to refresh (user 2026-10-06: 除非我拉下来 refresh，它才会直接变) ──
  // Nothing on screen changes on its own — the minute's refresh is gone. A pull moves `gen`: every read below runs
  // again and keeps what is on screen until its answer lands, and the dot spins until all of them have.
  const [gen, setGen] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // The open itself (2026-10-08): while its reads run over what the phone kept, the dot spins as for a pull.
  const [booting, setBooting] = useState(true);
  // Number 0 is the open itself: its reads are collected too, so the dot can spin over the phone's kept figures.
  const pulled = useRef<{ gen: number; reads: Promise<unknown>[] }>({ gen: 0, reads: [] });
  const track = useCallback<TrackRead>((forGen, read) => {
    if (pulled.current.gen === forGen) pulled.current.reads.push(read);
    return settleRead(read);
  }, []);
  const pullRefresh = useCallback(() => {
    const next = gen + 1;
    pulled.current = { gen: next, reads: [] };
    setRefreshFailed(false);
    setRefreshing(true);
    setGen(next);
  }, [gen]);
  useEffect(() => {
    if (!refreshFailed) return;
    const timer = window.setTimeout(() => setRefreshFailed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [refreshFailed]);

  const principal = data.principalView === true;
  const membership: MemberMembership | undefined = data.memberships.find(m => m.id === route.department) ?? data.memberships[0];
  const membershipId = membership?.id ?? "";
  // Keyed on the ids, never the membership object: a refresh hands back a new `data`, and a new context would
  // start every read below over — View as went back to "Loading…" every minute until 2026-10-05.
  const context = useMemo<MemberReadContext | undefined>(() => (principal && route.staff && membershipId
    ? { staffId: route.staff, subDepartmentId: membershipId } : undefined), [principal, route.staff, membershipId]);
  const viewed = principal && route.staff ? membership?.people.find(p => p.id === route.staff) : undefined;
  // A Revenue Director's own app (2026-10-14): the sub-department they direct, everybody in it under them.
  const director = !principal && !!membership?.director;

  const me: Me = useMemo(() => {
    if (viewed) return { name: viewed.name, first: firstName(viewed.name), ini: initials(viewed.name), title: viewed.title, rank: viewed.rank };
    if (principal) return { name: data.profile.name || "Principal", first: firstName(data.profile.name || "Principal"), ini: initials(data.profile.name || "PR"), title: "Principal", rank: "All access" };
    return { name: data.profile.name, first: firstName(data.profile.name), ini: initials(data.profile.name), title: membership?.title ?? "", rank: membership?.rank ?? "" };
  }, [viewed, principal, data.profile.name, membership]);

  // ── the month being worked: last month while it is still being closed ──
  const readable = (!principal || !!context) && memoryReady;
  const markViewed = useCallback((snap: MemberArenaSnapshot) => viewedAs(snap, context?.staffId), [context?.staffId]);
  const schemeId = membership?.schemeId ?? "";
  const prevMonth = addMonths(period, -1);

  // Last month's and this month's bills: which months are closed, which hold bills.
  const [recent, setRecent] = useState<MemberOrderBook | null>(null);
  const [recentFailed, setRecentFailed] = useState(false);
  const recentKey = `${membershipId}|${context?.staffId ?? ""}|${prevMonth}|${period}`;
  const recentShown = useRef("");
  useEffect(() => {
    if (!membershipId || !readable) return;
    let stale = false;
    // Somebody else's or another month's book goes — the phone's copy of this one, if it kept one, stands in;
    // a pull keeps this one up until the new one lands.
    const again = recentShown.current === recentKey;
    recentShown.current = recentKey;
    if (!again) { setRecent(source.peek?.<MemberOrderBook>(ask.orderBook(membershipId, prevMonth, period, context)) ?? null); setRecentFailed(false); }
    void track(gen, source.orderBook(membershipId, prevMonth, period, context)).then(r => {
      if (stale) return;
      if (r.ok) { setRecent(r.data); setRecentFailed(false); } else if (!again) setRecentFailed(true);
    });
    return () => { stale = true; };
  }, [membershipId, prevMonth, period, readable, context, source, recentKey, gen, track]);
  const monthState = useMemo<MonthState>(() => ({ paysFrom: recent?.paysFrom ?? null, closed: recent?.closedMonths ?? [] }), [recent]);
  const working = useMemo(() => {
    if (fixture?.insight) return fixture.insight.month;
    if (recent) return workingMonth(period, monthState, [...new Set(recent.orders.map(o => o.recognitionMonth))]);
    return recentFailed || data.demo ? period : null;
  }, [fixture, recent, recentFailed, data.demo, period, monthState]);

  // ── Today: the CURRENT month, always (user 2026-10-06: "on live date, not showing last month") ──
  // The other pages open on last month while it is still being closed; Today never does. Its income
  // is Comm Cal's engine for this month, as on My income (live until HR closes them): the member's
  // own, a Principal's view of somebody's, or — viewing nobody — the whole sub-department's, never
  // last month's statement. The design preview keeps the statements its fixture carries.
  // Everything Today shows is asked for at once (2026-10-08) — the income, this month's Insight block,
  // KPI and Arena, and the two-month book — so it leaves as ONE request: Server Actions run one at a
  // time, and this month's figures used to wait for the book to say which month is being worked (a
  // second round trip, ~1 s on prod). Last month's figures are read only by the pages that show them.
  const deptView = principal && !context;
  const viewStaff = context?.staffId ?? "";
  const todayKey = fixture || data.demo || !membershipId ? "" : `${membershipId}|${deptView ? "*" : viewStaff}|${period}`;
  // Ids, not the `context` object: a refresh rebuilds it, and this runs the engine. A pull reads it again and
  // keeps the figure on screen until the new one lands. Not on the Product List: Server Actions run one at a
  // time, and the engine read would hold its saves behind it (2026-10-08) — Today reads it when it opens.
  const ownContext = useMemo(() => (viewStaff ? { staffId: viewStaff, subDepartmentId: membershipId } : undefined), [viewStaff, membershipId]);
  const todayDept = useKeyedRead<DepartmentIncome>(todayKey, !!todayKey && deptView && !onProducts && memoryReady, gen,
    () => source.departmentIncome(membershipId, period), track, () => source.peek?.<DepartmentIncome>(ask.departmentIncome(membershipId, period)));
  const todayOwn = useKeyedRead<MemberIncome>(todayKey, !!todayKey && !deptView && !onProducts && memoryReady, gen,
    () => source.income(membershipId, period, ownContext), track, () => source.peek?.<MemberIncome>(ask.income(membershipId, period, ownContext)));
  const todayIncome = useMemo<{ month?: IncomeMonth; dept?: DepartmentIncome; failed?: boolean } | null>(() => {
    if (!todayKey) return null;
    if (deptView) return todayDept.value ? { dept: todayDept.value } : todayDept.error ? { failed: true } : null;
    return todayOwn.value ? { month: todayOwn.value.month } : todayOwn.error ? { failed: true } : null;
  }, [todayKey, deptView, todayDept.value, todayDept.error, todayOwn.value, todayOwn.error]);
  // This month's Insight block, KPI and bills (cut from the two-month book), and its Arena — the boards,
  // this week's fair and the brand weeks still to save.
  const curPeriod = useMemo(() => monthPeriod(period, period), [period]);
  const now = useInsightData({ source, membershipId, schemeId, context, readable, period: curPeriod, recent, recentFrom: prevMonth, recentUntil: period, recentFailed, gen, track });
  const arenaCur = useMonthArena({ source, membershipId, context, readable, month: period, mark: markViewed, gen, track });
  // Last month while it is still being worked: its Arena is read by the pages that show it — the claim
  // form's weekends, the team map — and not on every open. (My brand weeks reads this month's: its history
  // carries the two months before too.)
  const workPages = route.screen === "account" && (route.pf === "requests" || route.pf === "team");
  const arenaWork = useMonthArena({ source, membershipId, context, readable, month: working && working !== period && workPages ? working : null,
    mark: markViewed, gen, track });
  const arenaToday = arenaCur.snapshot;
  // The month being worked, and this month while another is: what brand weeks, claims and the team read.
  const arena = working && working !== period ? arenaWork.snapshot : arenaCur.snapshot;
  const arenaNow = working && working !== period ? arenaCur.snapshot : null;

  const incomes = useMemo(() => data.incomes.filter(i => i.schemeId === schemeId).sort((a, b) => b.period.localeCompare(a.period)), [data.incomes, schemeId]);
  const income = useMemo(() => (!todayKey ? incomes[0]
    : todayIncome?.month ? snapshotIncome(todayIncome.month, schemeId)
    : todayIncome?.dept ? { period: todayIncome.dept.period, status: "computed", total: todayIncome.dept.commission }
    : undefined), [todayKey, incomes, todayIncome, schemeId]);
  const incomeStatus = !todayKey ? undefined : !todayIncome ? "loading" as const : todayIncome.failed ? "failed" as const : undefined;
  const todaySalary = todayIncome?.month ? todayIncome.month.basic : principal ? null : data.profile.salary;
  // The newest settled month, while it is news (the month just gone, or the one before it).
  const settled = useMemo(() => {
    const candidate = incomes.find(i => SETTLED.has(i.status));
    if (!candidate) return undefined;
    const [y, m] = period.split("-").map(Number);
    const prev = (n: number) => { const d = new Date(Date.UTC(y, m - 1 - n, 1)); return d.toISOString().slice(0, 7); };
    return candidate.period === prev(1) || candidate.period === prev(2) ? candidate : undefined;
  }, [incomes, period]);

  // Keyed on the month: each refresh rebuilds `settled`, and the same month is not read again.
  const settledPeriod = settled?.period ?? null;
  const settledArena = useMonthArena({ source, membershipId, context, readable, month: settledPeriod, mark: markViewed, gen, track }).snapshot;

  // A memo to a sub-department shows on its page; one addressed to people (Documentation, 2026-10-11) is the member's own —
  // the Principal sees it only while viewing one of its recipients. Viewing nobody, a Principal whose login a People record
  // names reads their OWN memos here (2026-10-12), as in the portal's every view and the HR app.
  const ownMode = principal && !viewed && !!own;
  const memos = useMemo(() => (ownMode && own ? own.memos : data.memos.filter(m => (m.departments.length ? m.departments.includes(membership?.name ?? "")
    : !principal || (!!viewed && (m.recipients ?? []).includes(viewed.id))))), [ownMode, own, data.memos, membership?.name, principal, viewed]);
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
  // Live (2026-10-14, the owner: "change to on live as well"): whatever moves the bell reaches the phone at once and is read
  // silently (shell/useLiveBell). A memo or a request moving reads the snapshot again and takes only those two from it —
  // nothing else on the screen changes.
  const bellSnapshot = useCallback(() => {
    void source.refresh().then(r => { if (r.ok) setData(d => ({ ...d, memos: r.data.memos, requests: r.data.requests })); });
  }, [source]);
  const liveNotices = useLiveBell({ enabled: live && !data.demo && !fixture && !principal, account, initial: notices, source, gen, track,
    onSnapshot: bellSnapshot });
  // A memo's notice (2026-10-12) is not listed twice: the memo itself is the bell's item, and opening it reads its notice.
  const appNotices = useMemo(() => liveNotices.items.filter(n => n.refKind !== "memo"), [liveNotices.items]);
  // The bell's dot counts what the database told them since they last opened it; opening it reads those, and they stay
  // marked new in the list until it opens again. One coming in after that counts again.
  const [seenNew, setSeenNew] = useState<ReadonlySet<string>>(() => new Set());
  const unseen = useMemo(() => (principal ? [] : appNotices.filter(n => !n.read && !seenNew.has(n.id))), [principal, appNotices, seenNew]);
  const shownNotices = useMemo(() => (seenNew.size ? appNotices.map(n => (seenNew.has(n.id) ? { ...n, read: false } : n)) : appNotices),
    [appNotices, seenNew]);
  const nf = useMemo(() => notifications({ now: new Date(), memos: principal && !viewed && !ownMode ? [] : memos, requests: principal && !viewed ? [] : requests,
    settled, salary: data.profile.salary, results, readAll, requestCode,
    // News about a page their ticks close is not shown (2026-10-11).
    opens: go => go.to === "memo" || go.to === "none" || (go.to === "requests" ? requestPage(closed, go.kind ?? "claim") !== null : shows(closed, go.to)),
    notices: principal ? [] : shownNotices,
  }), [memos, requests, settled, data.profile.salary, results, readAll, principal, viewed, ownMode, closed, shownNotices]);
  const unseenNotices = unseen.length;
  const seeNotices = useCallback(() => {
    if (!unseen.length) return;
    setSeenNew(new Set(unseen.map(n => n.id)));
    void readNotices(unseen.map(n => n.id));
  }, [unseen]);
  const settledMonth = settled ? monthName(settled.period) : null;

  // ── Today's CRM chat button (2026-10-14, the refresh handoff §2): the account's own chats' unread messages, live ──
  // Read with the open and every pull, and between them whenever a customer's row changes (Realtime, silently) — the
  // phone's header, and Profile › My leads & appointments on the phone and the desktop alike (2026-10-14).
  const onCrm = route.screen === "account" && route.pf === "crm";
  const crmUnread = useCrmUnread({ enabled: crm, live: live && !data.demo && !fixture, ready: memoryReady, source, gen, track,
    account, onCrm, fixture: fixture?.crmUnread });

  // ── the Quote's catalogue (2026-10-08): no longer in the snapshot every open waited for ──
  // Read when the Quote or its brand list opens — what the phone kept shows at once — and once in the
  // background when the phone has none yet, so the first tap on Quote is not a wait. A server render of
  // the app (a Product List save) asks again: its key carries the snapshot's time.
  const [catalogueWarm, setCatalogueWarm] = useState(false);
  const catalogueNeed = live && !data.demo && !fixture && !onProducts && memoryReady && !!source.catalogue
    && (route.screen === "quote" || route.screen === "calc" || sheet === "brand" || catalogueWarm);
  const catalogueRead = useKeyedRead<MemberCatalogue>(`catalogue|${initialData.refreshedAt}`, catalogueNeed, gen,
    () => source.catalogue!(), track, () => source.peek?.<MemberCatalogue>(ask.catalogue()));
  // The preview's demo and an older snapshot still carry the catalogue themselves.
  const products = catalogueRead.value?.products ?? (data.products?.length ? data.products : NO_PRODUCTS);
  const catalogueModels = catalogueRead.value?.catalogueModels ?? data.catalogueModels ?? NO_MODELS;
  const catalogueWaiting = catalogueNeed && !catalogueRead.value && !catalogueRead.error && !data.products?.length;

  // ── brands this sub-department quotes ──
  const brands: BrandOption[] = useMemo(() => {
    if (!membership?.calculator) return [];
    const byBrand = new Map<string, { models: Set<string>; sofa: boolean }>();
    for (const p of products) {
      if (!p.brand || !p.available) continue;
      const entry = byBrand.get(p.brand) ?? { models: new Set<string>(), sofa: false };
      entry.models.add(p.modelId ?? p.name);
      if ((p.kind ?? p.category).toUpperCase().includes("SOFA")) entry.sofa = true;
      byBrand.set(p.brand, entry);
    }
    const names = new Map((arenaToday?.brands ?? []).map(b => [b.code, b.name]));
    return [...byBrand.entries()]
      .sort(([a, x], [b, y]) => Number(x.sofa) - Number(y.sofa) || (BRAND_ORDER.indexOf(a) + 99) % 99 - (BRAND_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b))
      .map(([code, v]) => ({ code, name: names.get(code) ?? BRAND_NAMES[code] ?? code, sofa: v.sofa, models: v.models.size }));
  }, [membership?.calculator, products, arenaToday?.brands]);
  const brandList = fixture?.brands ?? brands;

  // ── Quote: one brand's catalogue, the cart, and the calculator ──
  const catalogs = useMemo<Record<string, QCatalog>>(() => {
    if (fixture?.quote) return fixture.quote.catalogs;
    return Object.fromEntries(brands.map(b => [b.code, catalogFromProducts(products, b.code, b.name, [], catalogueModels)]));
  }, [fixture, brands, products, catalogueModels]);
  const quoteCalc = useCallback((input: QuoteInput) => {
    const fx = fixture?.quote;
    if (!fx) return source.quote(input);
    // Every brand of the prototype climbs the same ladder.
    return Promise.resolve(tableCalc(input, fx.prices, fx.costDivisor, fx.bands));
  }, [fixture, source]);
  const quote = useQuote({
    catalogs,
    fallbackBrand: brandList[0]?.code ?? "",
    schemeId,
    bands: fixture?.quote?.bands ?? data.bands,
    storeKey: fixture || data.demo ? null : `${data.profile.userId}-${membershipId}`,
    // View as reads it; an account whose ticks close the Quote's Create looks at its products only.
    readOnly: (principal && !!route.staff) || !quoteSends,
    calc: quoteCalc,
    pricing: route.screen === "calc" || (desk && route.screen === "quote"),
    initial: fixture?.quote?.initial,
  });

  // ── the Product List's page, inside the app ──
  // What it has not saved yet: the app asks before leaving it for one of its own screens, as its own
  // links and a reload do (ProductWorkspace).
  const productDraft = useRef({ dirty: false, saving: false });
  const mayLeaveProducts = useCallback(() => {
    if (!onProducts) return true;
    const draft = productDraft.current;
    if (draft.saving) return false;
    return !draft.dirty || window.confirm("Discard your unsaved Product List changes and leave this page?");
  }, [onProducts]);

  // ── navigation ──
  const goScreen = useCallback((screen: Screen, extra: Partial<Route> = {}) => {
    if (!mayLeaveProducts()) return;
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
    const next: Partial<Route> = { screen, pf: null, ins: "main", arena: "hub", ...extra };
    if (onProducts) {
      // From the Product List's page back to the app's own: the router changes the page, the app its screen.
      go(next, false, false);
      router.push(appHref({ ...baseRoute, ...next }, window.location.origin), { scroll: false });
      return;
    }
    go(next);
    if (mainRef.current) mainRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the quote's setters are stable
  }, [go, closeProfileSheets, mayLeaveProducts, onProducts, router, baseRoute]);
  const openProducts = useCallback(() => {
    if (onProducts) return;
    setSheet(null);
    setNfOpen(false);
    setVaOpen(false);
    closeProfileSheets();
    quote.closeSheet(); quote.setCartOpen(false); quote.setAllOpen(false); quote.setPreviewOpen(false);
    router.push(productsHref(baseRoute), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the quote's setters are stable
  }, [onProducts, closeProfileSheets, router, baseRoute]);
  // The module switcher: the portal's other modules are the Principal's views of it (setViewAs).
  const [, startSwitch] = useTransition();
  const pickModule = useCallback((id: ModuleId) => {
    // The design preview draws the menu and goes nowhere, as the prototype's does.
    if (id === "revenue" || device !== "live" || !mayLeaveProducts()) return;
    const form = new FormData();
    form.set("role", id);
    startSwitch(async () => { await setViewAs(form); });
  }, [mayLeaveProducts, device]);
  const toInsight = useCallback((view: InsightView, status: BillsStatus = "counted") => {
    if (view === "bills") setBillStatus(status);
    goScreen("insight", { ins: view });
  }, [goScreen]);
  // A board from Today or the bell opens on its month, as the prototype's `go('arena', { period: 'monthly', sub: 'total' })`:
  // the bell's results on the settled month they are about, anything else on the current month.
  const openBoard = useCallback((board: Board, month: string | null = null) => {
    setArKind("monthly"); setArFrom(month); setArSub("total");
    goScreen("arena", { arena: "board", board });
  }, [goScreen]);
  const openNotif = useCallback(() => { setSheet(null); setNfOpen(true); seeNotices(); }, [seeNotices]);
  const toggleNotif = useCallback(() => { setSheet(null); setNfOpen(open => !open); seeNotices(); }, [seeNotices]);
  // A tapped push about a manpower request opens the app at `?bell=1` (lib/push/notices noticeUrl): the bell, once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("bell") !== "1") return;
    q.delete("bell");
    window.history.replaceState(null, "", window.location.pathname + (q.toString() ? `?${q}` : ""));
    openNotif();
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A tapped push about a CRM chat or invitation opens the CRM there (`/member?page=account&view=crm&chat=…` or
  // `&crm=notifs`, lib/push/notices noticeUrl): the CRM opens that chat, or its notifications, once.
  const [crmOpen, setCrmOpen] = useState<CrmOpen | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const chat = q.get("chat"), notifs = q.get("crm") === "notifs";
    if (!chat && !notifs) return;
    q.delete("chat"); q.delete("crm");
    window.history.replaceState(window.history.state, "", window.location.pathname + (q.toString() ? `?${q}` : ""));
    setCrmOpen(chat ? { chat } : { notifs: true });
  }, []);
  const openSheet = useCallback((next: Sheet) => { setNfOpen(false); setSheet(next); }, []);
  // The CRM from Today's chat button (2026-10-14) opens as Profile › My leads & appointments does, and its way back
  // leads to where it was opened; any other way out of the CRM forgets that.
  const [crmFrom, setCrmFrom] = useState<Screen | null>(null);
  const openCrm = useCallback(() => {
    const from = route.screen;
    goScreen("account", { pf: "crm" });
    setCrmFrom(from);
  }, [route.screen, goScreen]);
  useEffect(() => {
    if (!onCrm && crmFrom) setCrmFrom(null);
  }, [onCrm, crmFrom]);

  const todo = (t: TodayTodo) => {
    if (t.target === "memos") goScreen("account", { pf: "memos" });
    else if (t.target === "requests") goScreen("account", { pf: requestPage(closed, t.requestKind ?? "claim") ?? "requests" });
    else goScreen("account", { pf: "brandWeeks" });
  };
  const openNotifItem = (n: NotifItem) => {
    setNfOpen(false);
    if (n.go.to === "memo") { goScreen("account", { pf: "memos" }); if (n.go.memoId) openMemo(n.go.memoId); }
    else if (n.go.to === "requests") goScreen("account", { pf: requestPage(closed, n.go.kind ?? "claim") ?? "requests" });
    // A settled month's news opens on that month: the app itself opens on the current one.
    else if (n.go.to === "income") { setIncPeriod(settled?.period ?? null); goScreen("account", { pf: "income" }); }
    else if (n.go.to === "rooms") goScreen("account", { pf: "rooms" });
    else if (n.go.to === "none") return;
    else openBoard("sales", settled?.period ?? null);
  };

  // A sub-department somebody directs (2026-10-14) reads as their title and rung; a seat as Home (the first) or Member.
  const subOptions: SubDeptOption[] = data.memberships.map((m, i) => ({
    id: m.id, name: m.name, abbr: m.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase(),
    meta: m.director ? [m.title, m.rank].filter(Boolean).join(" · ")
      : i === 0 ? ["Home", m.title, m.rank].filter(Boolean).join(" · ") : ["Member", m.title].filter(Boolean).join(" · "),
  }));

  // ── this month's Championship, for Today's board ──
  // The KPI rule is the scheme's (Rules), not a month's: this month's summary says it.
  const kpiRule = useMemo(() => ({ enabled: !!now.kpi?.enabled, threshold: now.kpi?.threshold ?? null }), [now.kpi?.enabled, now.kpi?.threshold]);
  const selfId = arenaToday?.selfId || context?.staffId || "";
  // The reader's place, and who leads — a director is on no board, so their card names the leader.
  const champ = useMemo(() => {
    if (!arenaToday) return null;
    const month = championshipMonth({ month: arenaToday.period, people: arenaToday.people, brands: arenaToday.brands.map(b => b.code), tiers: arenaToday.tiers, history: arenaToday.history ?? null, kpi: kpiRule });
    const standings = championshipStandings([month]);
    return { rank: standings.find(s => s.id === selfId)?.position ?? null, leader: standings.find(s => s.position === 1)?.name ?? null };
  }, [arenaToday, kpiRule, selfId]);

  const model = useMemo(() => todayModel({
    today, first: me.first, title: me.title, rank: me.rank, income, incomeStatus, salary: todaySalary, hidden: hidden || incomeShut,
    department: principal && !viewed && !fixture ? membership?.name ?? "the department" : undefined,
    team: director ? membership?.name : undefined,
    insight: now.block ?? undefined, kpi: now.kpi, arena: arenaToday, book: now.book, bands: data.bands, memos, requests, requestCode,
    metricsLoading: now.loading && !now.block && !data.demo, arenaLoading: arenaCur.loading && !data.demo,
  }, champ?.rank ?? null, champ?.leader ?? null), [today, me, income, incomeStatus, todaySalary, hidden, incomeShut, principal, viewed, fixture, membership?.name, now.block, now.kpi, arenaToday, now.book,
    now.loading, arenaCur.loading, data.demo, data.bands, memos, requests, champ, director]);

  // ── Insight: Month / Quarter / Year, opening on the current month ──
  const [insKind, setInsKind] = useState<PeriodKind>("monthly");
  const [insFrom, setInsFrom] = useState<string | null>(null);
  const [insTab, setInsTab] = useState<InsightTab>("personal");
  const [billStatus, setBillStatus] = useState<BillsStatus>("counted");
  const [billWeek, setBillWeek] = useState<string | null>(null);
  const [insBrand, setInsBrand] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [soPick, setSoPick] = useState<string | null>(null);
  const [tiersOpen, setTiersOpen] = useState(false);
  // The current month unless another is picked (user 2026-10-06: "也开在当月") — the month still being
  // closed is in the date sheet, marked Live.
  const insPeriod = useMemo(() => periodOf(insKind, insFrom ?? period, period), [insKind, insFrom, period]);
  // This month is already read for Today; any other period is read when picked — last month's bills
  // are cut from the two-month book, its block and KPI read on their own.
  const sameAsNow = insPeriod.kind === "monthly" && insPeriod.from === period;
  const picked = useInsightData({ source, membershipId, schemeId, context, readable, period: sameAsNow ? null : insPeriod,
    recent, recentFrom: prevMonth, recentUntil: period, recentFailed, gen, track });
  const ins = sameAsNow ? now : picked;
  const insMonthly = insPeriod.kind === "monthly";
  const insightInput = useMemo<InsightInput>(() => ({
    period: insPeriod,
    book: ins.book,
    me: (insMonthly ? ins.block?.me : ins.range?.me) ?? null,
    downline: (insMonthly ? ins.block?.downline : ins.range?.downline) ?? [],
    target: insMonthly ? ins.block?.target ?? null : null,
    kpi: insMonthly ? ins.kpi : null,
    kpiEnabled: now.kpi?.enabled,
    bands: data.bands,
    name: me.name,
    title: me.title,
  }), [insPeriod, ins, insMonthly, now.kpi?.enabled, data.bands, me.name, me.title]);
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

  // ── Arena: Monthly / Quarterly / Annual, opening on the current month ──
  const [arKind, setArKind] = useState<PeriodKind>("monthly");
  const [arFrom, setArFrom] = useState<string | null>(null);
  const [arSub, setArSub] = useState<ArenaSub>("total");
  const [arBrand, setArBrand] = useState("");
  const [fairsOpen, setFairsOpen] = useState(false);
  const [champOpen, setChampOpen] = useState(false);
  const arPeriod = useMemo(() => periodOf(arKind, arFrom ?? fixture?.arena?.from[arKind] ?? period, period), [arKind, arFrom, fixture, period]);
  // A month already held: last month's when it is the one open and a page read it, else this month's (Today's) —
  // whose fair history every other window reuses.
  const knownArena = arPeriod.kind === "monthly" && arenaWork.snapshot && arPeriod.from === arenaWork.snapshot.period ? arenaWork.snapshot : arenaToday;
  const arData = useArenaData({
    source, membershipId, context, readable, known: knownArena, kpi: kpiRule, mark: markViewed,
    period: route.screen === "arena" && !fixture?.arena ? arPeriod : null, gen, track,
  });
  const arInput = useMemo(() => ({
    period: arPeriod, snapshot: arData.snapshot, history: arData.history, standings: arData.standings, selfId,
    subName: membership?.name ?? "", kpiEnabled: kpiRule.enabled,
    // The whole sub-department closed (the snapshot says so); until it loads, the member's own closes.
    final: arData.snapshot?.final ?? (arPeriod.kind !== "monthly" ? arPeriod.through < period : !isLiveMonth(arPeriod.from, period, monthState)),
    openMonths: arData.snapshot?.openMonths ?? (isLiveMonth(arPeriod.from, period, monthState) ? [arPeriod.from] : []),
    current: period,
    failed: !!arData.failed,
    director,
  }), [arPeriod, arData.snapshot, arData.history, arData.standings, selfId, membership?.name, kpiRule.enabled, period, monthState, arData.failed, director]);
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
  const todayVM = useMemo(() => {
    // The preview's figures are written out: the eye — and My income closed — hide them as todayModel does.
    const vm = fixture?.today ? (hidden || incomeShut ? hideIncome(fixture.today) : fixture.today) : model;
    const todo = vm.todo.filter(t => t.target !== "requests" || requestPage(closed, t.requestKind ?? "claim") !== null);
    return todo.length === vm.todo.length ? vm : { ...vm, todo };
  }, [fixture, model, closed, hidden, incomeShut]);
  const nfCount = fixture?.notifications.count ?? nf.count + unseenNotices;
  const nfGroupsVM = fixture?.notifications.groups ?? notifGroups(nf.items, nfTab, settledMonth);
  const nfSummaryVM = fixture?.notifications.summary ?? notifSummary(nf.count, settledMonth);

  // ── Profile ──
  const fxp = fixture?.profile;
  /** A Principal looking at somebody else's app: nothing can be sent or changed. */
  const readOnlyView = principal;
  // Book a room (2026-10-11): the schedule is everybody's — a Principal sees it without picking anybody.
  const rooms = useMemberRooms({
    active: memoryReady && route.screen === "account" && route.pf === "rooms", source, today, fixture: fixture?.rooms,
    readOnly: readOnlyView, canBook: sends(closed, "rooms"),
  });
  // Documentation (2026-10-11): read on Profile too, for its row's count of new files; a Principal reads the viewed member's.
  const docs = useMemberDocs({
    active: memoryReady && route.screen === "account" && (route.pf === null || route.pf === "docs") && !(principal && !viewed) && shows(closed, "docs"),
    onPage: route.screen === "account" && route.pf === "docs",
    source, staffId: principal && viewed ? viewed.id : undefined, fixture: fixture?.docs, readOnly: readOnlyView,
  });
  const nameOf = useCallback((staffId: string) => {
    for (const m of data.memberships) { const p = m.people.find(x => x.id === staffId); if (p) return p.name; }
    return null;
  }, [data.memberships]);
  // The viewed person's requests (a Principal's snapshot holds everybody's).
  const myRequests = useMemo(() => (principal ? (viewed ? requests.filter(r => r.staffId === viewed.id) : []) : requests), [principal, viewed, requests]);
  // Waiting list & replacements (2026-10-10): the member's waiting lists — a place on one shows on Requests too.
  const queueContext = principal && viewed ? { staffId: viewed.id } : undefined;
  const queueRead = useKeyedRead<WaitingQueue[]>(`queue:${viewed?.id ?? "me"}`,
    !fxp && route.screen === "account" && (route.pf === "requests" || route.pf === "track") && !(principal && !viewed) && memoryReady, gen,
    () => (source.waitingQueue ? source.waitingQueue(queueContext) : Promise.resolve({ ok: false as const, error: "Preview data only." })), track,
    () => source.peek?.<WaitingQueue[]>(ask.waitingQueue(queueContext)));
  const queues = useMemo(() => queueRead.value ?? [], [queueRead.value]);
  // View as: the memos read as the viewed person read them — their receipts, not the Principal's.
  const viewedId = viewed?.id ?? "";
  const receiptsRead = useKeyedRead(viewedId, !fxp && principal && !!viewedId && memoryReady, gen, () => source.memoReceipts(viewedId), track,
    () => source.peek?.<{ memoId: string; readAt: string | null; acknowledgedAt: string | null }[]>(ask.memoReceipts(viewedId)));
  const viewedReceipts = useMemo(() => (viewedId && receiptsRead.value
    ? { staffId: viewedId, byMemo: new Map(receiptsRead.value.map(x => [x.memoId, x])) } : null), [viewedId, receiptsRead.value]);
  const memoVMs: MemoVM[] = useMemo(() => {
    if (fxp) return fxp.memos.map(m => ({ ...m, read: m.read || memoRead.has(m.id) || memoAcked.has(m.id), acked: m.acked || memoAcked.has(m.id) }));
    // The Principal's own (2026-10-12): their receipts, as a member's are.
    if (principal && !ownMode) {
      const theirs = viewed && viewedReceipts?.staffId === viewed.id ? viewedReceipts.byMemo : new Map();
      return memos.map(m => memoVM({ ...m, readAt: theirs.get(m.id)?.readAt ?? null, acknowledgedAt: theirs.get(m.id)?.acknowledgedAt ?? null },
        { read: new Set(), acked: new Map() }));
    }
    return memos.map(m => memoVM(m, { read: memoRead, acked: memoAcked }));
  }, [fxp, principal, ownMode, viewed, viewedReceipts, memos, memoRead, memoAcked]);
  const profileVM = useMemo(() => {
    if (fxp) return principal && !viewed ? fxp.main.principal : viewed ? fxp.main.viewing[viewed.id] ?? fxp.main.me : fxp.main.me;
    return profileMainVM({ name: me.name, title: me.title, rank: me.rank, subName: principal && !viewed ? null : membership?.name ?? null,
      requests: myRequests, memos: principal && !viewed && !ownMode ? [] : memoVMs });
  }, [fxp, principal, ownMode, viewed, me, membership?.name, myRequests, memoVMs]);
  const [cancelled, setCancelled] = useState<ReadonlySet<string>>(() => new Set());
  const reqRows = useMemo(() => {
    const rows = fxp ? fxp.requests.rows : requestRowsVM(myRequests, nameOf, queues);
    return rows.map(r => (cancelled.has(r.id) ? { ...r, status: "Cancelled", tone: "none" as const } : r));
  }, [fxp, myRequests, nameOf, queues, cancelled]);
  const trackView = useMemo(() => (fxp ? fxp.track : trackVM({ requests: myRequests, queues, subDepartmentId: membership?.id ?? "", nameOf })),
    [fxp, myRequests, queues, membership?.id, nameOf]);
  // A request's history, and the pull it was read at — opened again after a pull, it is read again.
  const [history, setHistory] = useState<Record<string, { gen: number; events: RequestEvent[] }>>({});
  const reqDetail = useMemo(() => {
    if (!reqPick) return null;
    if (fxp) {
      const d = fxp.requests.details[reqPick];
      if (!d || !cancelled.has(reqPick)) return d ?? null;
      return { ...d, status: "Cancelled", tone: "none" as const, canCancel: false, facts: d.facts.map(f => (f.l === "Current step" ? { ...f, v: "Cancelled" } : f)),
        log: [...d.log.map(e => ({ ...e, dot: "past" as const })), { what: "Cancelled", who: "You", when: "Just now", note: "", dot: "bad" as const }] };
    }
    const r = myRequests.find(x => x.id === reqPick);
    // Sent under its own page's Create (2026-10-11): a claim Requests', a waiting list or replacement its own page's.
    return r ? requestDetailVM(r, history[r.id]?.events ?? null, { nameOf, readOnly: readOnlyView || !sends(closed, requestPageOf(r.kind)), queues }) : null;
  }, [reqPick, fxp, cancelled, myRequests, history, nameOf, readOnlyView, queues, closed]);
  // A waiting list or replacement opens the handoff's sheet (Edit request → Update); a claim keeps its own.
  const reqKind = fxp ? (reqPick ? fxp.requests.rows.find(r => r.id === reqPick)?.kind ?? null : null) : myRequests.find(r => r.id === reqPick)?.kind ?? null;
  // A claim's own sheet — a food claim's too (the app's `food`).
  const reqIsClaim = reqKind === "claim" || reqKind === "food";
  const vaGroups = useMemo(() => (fxp
    ? protoVaGroups(fxp.va.people, fxp.va.departments, vaQuery, viewed?.id ?? "")
    : vaGroupsVM(data.memberships, vaQuery, viewed?.id ?? "")), [fxp, data.memberships, vaQuery, viewed?.id]);
  const pickVa = useCallback((staffId: string, departmentId: string) => {
    setVaOpen(false); setVaQuery("");
    goScreen("today", { staff: staffId, department: departmentId });
  }, [goScreen]);

  // Memos: opening one is reading it; acknowledging records the member's name and time for HR. The Principal's own
  // memos (2026-10-12) are theirs to read and acknowledge — viewing a member stays read-only.
  const memoReadOnly = readOnlyView && !ownMode;
  const openMemo = useCallback((id: string) => {
    setMemoError(null);
    setMemoPick(id);
    if (memoReadOnly || memoRead.has(id)) return;
    setMemoRead(prev => new Set(prev).add(id));
    const memo = memos.find(m => m.id === id);
    if (!fxp && memo && !memo.readAt) void source.memo(id, false);
  }, [memoReadOnly, memoRead, memos, fxp, source]);
  // A memo's file (2026-10-12): a short link asked for at the tap, opened in a tab readied in the same tap.
  const openMemoFile = useCallback((id: string, mode: "view" | "download") => {
    if (!source.memoFile) return;
    setMemoError(null);
    const win = mode === "view" ? window.open("", "_blank") : null;
    if (win) win.opener = null;
    void settleRead(source.memoFile(id, mode)).then(res => {
      if (res.ok) {
        if (win) win.location.href = res.data.url;
        else window.location.assign(res.data.url);
      } else {
        win?.close();
        setMemoError(res.error);
      }
    });
  }, [source]);
  // A tapped push about a memo opens it (`/member?memo=…`, lib/push/notices noticeUrl): its page, the memo, once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("memo");
    if (!id) return;
    q.delete("memo");
    window.history.replaceState(null, "", window.location.pathname + (q.toString() ? `?${q}` : ""));
    goScreen("account", { pf: "memos" });
    if (memos.some(m => m.id === id)) openMemo(id);
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ackMemo = useCallback(async () => {
    if (!memoPick || memoReadOnly) return;
    setMemoBusy(true); setMemoError(null);
    const result = fxp ? { ok: true as const, data: { acknowledgedAt: new Date().toISOString() } } : await source.memo(memoPick, true);
    setMemoBusy(false);
    if (!result.ok) { setMemoError(result.error); return; }
    const at = result.data.acknowledgedAt ?? new Date().toISOString();
    setMemoAcked(prev => new Map(prev).set(memoPick, at));
  }, [memoPick, memoReadOnly, fxp, source]);
  const memoPickVM = memoPick ? memoVMs.find(m => m.id === memoPick) ?? null : null;

  // Requests: send one, cancel one still with HR, update one HR returned.
  const openRequest = useCallback((id: string) => {
    setReqError(null);
    setReqPick(id);
    if (fxp || history[id]?.gen === gen) return;
    void source.requestHistory(id).then(r => { if (r.ok) setHistory(prev => ({ ...prev, [id]: { gen, events: r.data } })); });
  }, [fxp, history, source, gen]);
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
    void source.requestHistory(reqPick).then(r => { if (r.ok) setHistory(prev => ({ ...prev, [reqPick]: { gen, events: r.data } })); });
  }, [reqPick, readOnlyView, fxp, source, gen]);
  // Edit request → Update (2026-10-10): the three fields changed, sent again as a revision of itself.
  const editRequest = useCallback(async (values: Record<string, string>): Promise<boolean> => {
    // The design preview sends nothing: the fields just close.
    if (fxp) return true;
    const r = myRequests.find(x => x.id === reqPick);
    if (!r || readOnlyView) return false;
    if (!editChanges(r, values).length) return true;
    const problem = editProblem(r, values);
    if (problem) { setReqError(problem); return false; }
    setReqBusy(true); setReqError(null);
    const result = await source.submitRequest(revisionForm(r, values));
    setReqBusy(false);
    if (!result.ok) { setReqError(result.error); return false; }
    setHistory(prev => { const next = { ...prev }; delete next[r.id]; return next; });
    const refreshed = await source.refresh();
    if (refreshed.ok) setData(refreshed.data);
    void source.requestHistory(r.id).then(h => { if (h.ok) setHistory(prev => ({ ...prev, [r.id]: { gen, events: h.data } })); });
    return true;
  }, [fxp, myRequests, reqPick, readOnlyView, source, gen]);
  const updateRequest = useCallback(() => {
    const r = myRequests.find(x => x.id === reqPick);
    if (!r) return;
    setReqPick(null);
    setRevising({ id: r.id, detail: r.detail });
    // A food claim sent back opens the food claim's own form (2026-10-13).
    setReqForm(requestKindOf(r));
  }, [myRequests, reqPick]);

  // Team & capacity: the department's map, read when the page opens.
  const orgRead = useKeyedRead<MemberOrgMap>(context?.subDepartmentId ?? "mine", !fxp && route.screen === "account" && route.pf === "team" && readable, gen,
    () => source.orgMap(context ? { subDepartmentId: context.subDepartmentId } : undefined), track,
    () => source.peek?.<MemberOrgMap>(ask.orgMap(context ? { subDepartmentId: context.subDepartmentId } : undefined)));
  const orgMap = orgRead.value;
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

  // The member's own team here — in View as the viewed person's (the Principal's snapshot marks nobody
  // `self`): whom a replacement may name, and whether My income has an overriding side.
  const team = useMemo(() => replaceable(principal && viewed && membership
    ? { ...membership, people: membership.people.map(p => ({ ...p, self: p.id === viewed.id })) } : membership), [principal, viewed, membership]);
  const hasTeam = team.length > 0;
  // My income: the current month unless another is picked — live until the close, fixed after.
  const incMonth = incPeriod ?? period;
  const incKey = `${membershipId}|${context?.staffId ?? ""}|${incMonth}`;
  const onIncome = route.screen === "account" && (route.pf === "income" || route.pf === "incOrders");
  const inRecent = incMonth === prevMonth || incMonth === period;
  const incNeed = !fxp && onIncome && !!membershipId && readable;
  const incomeRead = useKeyedRead<MemberIncome>(incKey, incNeed, gen, () => source.income(membershipId, incMonth, context), track,
    () => source.peek?.<MemberIncome>(ask.income(membershipId, incMonth, context)));
  // A month outside the two the app holds reads its own bills for Commission by order.
  const incBookRead = useKeyedRead<MemberOrderBook>(incKey, incNeed && !inRecent, gen, () => source.orderBook(membershipId, incMonth, incMonth, context), track,
    () => source.peek?.<MemberOrderBook>(ask.orderBook(membershipId, incMonth, incMonth, context)));
  const incData = incomeRead.value;
  const incBook = inRecent ? recent : incBookRead.value;
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
  const honRead = useKeyedRead<MemberHonours>(honKey, !fxp && route.screen === "account" && route.pf === "honours" && !!honRange && !!membershipId && readable, gen,
    () => source.honours(membershipId, honRange?.from ?? period, honRange?.until ?? period, context), track,
    () => source.peek?.<MemberHonours>(ask.honours(membershipId, honRange?.from ?? period, honRange?.until ?? period, context)));
  const honoursView = useMemo(() => (fxp ? fxp.honours[honKind]
    : honRead.value ? honoursVM(honRead.value, honKind, honStart, period, membership?.name ?? "your sub-department") : null),
    [fxp, honKind, honRead.value, honStart, period, membership?.name]);

  // Commission scheme: the member's place in it and each brand's ladder. A Principal's view has the viewed
  // person's title and rank, the engine's rate once My income read it, and never their salary.
  const schemeView = useMemo(() => schemeVM({
    name: me.name, ini: me.ini, title: me.title, rank: me.rank,
    membership: principal ? undefined : membership,
    rate: principal ? incData?.month.rate ?? null : undefined,
    salary: principal ? undefined : data.profile.salary, bands: data.bands, hidden,
  }), [me.name, me.ini, me.title, me.rank, membership, principal, incData, data.profile.salary, data.bands, hidden]);

  // My brand weeks (read only since 2026-10-12): this month and the two before it, newest first, up to this
  // week's weekend and never a later one — where the ERP's Sales Attending puts the person read, else the
  // booth with the most of their bills. This month's Arena carries all three months' (its history's `weeks`).
  const bwMonths = useMemo(() => (arenaToday ? brandWeeksVM(arenaToday, today, arenaToday.selfId || null) : null), [arenaToday, today]);

  // The claim form's choices: the member's fair weekends, HR's rates, their team, the departments.
  // View as reads them too — the forms open on the viewed person's choices (and send nothing).
  const ratesRead = useKeyedRead<ClaimRates>("rates", !fxp && route.screen === "account" && route.pf === "requests" && !(principal && !viewed) && memoryReady, gen,
    () => source.claimRates(), track, () => source.peek?.<ClaimRates>(ask.claimRates()));
  const claimRates = ratesRead.value;
  // The waiting-list form HR set (2026-10-10): its own questions, the signed form it asks for —
  // and the replacement form (2026-10-11, round 2's README 18.5). Read wherever the request form
  // opens: Requests, or Waiting list & replacements when Requests is closed (the app follows the ticks).
  const formsWanted = !fxp && route.screen === "account" && (route.pf === "requests" || route.pf === "track") && !(principal && !viewed) && memoryReady;
  const waitFormRead = useKeyedRead<MemberWaitingForm>("waitForm", formsWanted, gen,
    () => (source.waitingForm ? source.waitingForm() : Promise.resolve({ ok: false as const, error: "Preview data only." })), track,
    () => source.peek?.<MemberWaitingForm>(ask.waitingForm()));
  const waitingForm = waitFormRead.value;
  const replFormRead = useKeyedRead<MemberWaitingForm>("replForm", formsWanted, gen,
    () => (source.replacementForm ? source.replacementForm() : Promise.resolve({ ok: false as const, error: "Preview data only." })), track,
    () => source.peek?.<MemberWaitingForm>(ask.replacementForm()));
  const replacementForm = replFormRead.value;
  const formOptions: FormOptions = useMemo(() => {
    if (fxp) return fxp.form;
    return {
      subName: membership?.name ?? "",
      weeks: claimWeeks([arena, arenaNow], today),
      rates: claimRates ?? { base: "Klang Valley", perSpot: null, perPaxNight: null, groupMaxPax: 3, groupCapPerNight: null, regions: [], fairs: {} },
      members: team,
      departments: data.departments ?? [],
      departmentId: membership?.id ?? "",
      waitingList: waitingChoices(myRequests),
      waitingForm: waitingForm ?? null,
      replacementForm: replacementForm ?? null,
      // The food claim (2026-10-13): a fair day still to come cannot be claimed, nor one another of theirs holds.
      today,
      foodClaims: myRequests,
    };
  }, [fxp, membership, arena, arenaNow, today, claimRates, team, data.departments, myRequests, waitingForm, replacementForm]);
  // Requests' ways to start one: a food claim only in Fair, for a title HR picked (2026-10-13) — sent under the
  // same Create as a claim. In View as, the viewed person's title decides.
  // The design preview's form carries the refresh handoff's food sample (2026-10-14), so its Requests offer it too.
  const foodOpen = foodOpenTo(fxp ? fxp.form.rates : claimRates, membership?.id, me.title);
  const pageKinds = useMemo<RequestKindVM[]>(() => requestKinds.flatMap(k => (k === "claim" && foodOpen ? ["claim", "food"] as RequestKindVM[] : [k])),
    [requestKinds, foodOpen]);

  // ── pull to refresh: the end of it ──
  // Every read above has started for this pull by now (effects run in order), so everybody's snapshot — the slowest
  // read, and the client runs one Server Action at a time — goes last, behind the screen's own reads. The dot spins
  // until all of them have landed.
  const reloadable = useRef(false);
  useEffect(() => {
    if (!refreshing || pulled.current.gen !== gen) return;
    let stale = false, snapshotOk = true;
    const snapshot = source.refresh().then(r => { snapshotOk = r.ok; if (!stale && r.ok) setData(r.data); });
    void Promise.allSettled([...pulled.current.reads, snapshot]).then(results => {
      if (stale) return;
      // A newer release is live: the server no longer knows this page's actions, so no pull can read again —
      // load the new app (the browser's own pull-to-reload is off). Not over something unsaved: then the note
      // asks for another pull, from a page with nothing open.
      if (results.some(r => r.status === "rejected" && isStaleAppError(r.reason)) && reloadable.current) { reloader.reload(); return; }
      setRefreshing(false);
      // A read that threw (offline, a broken request) or no new snapshot: the page still shows the old data.
      // A read answering "not available" (KPI off, no payroll row) answered the same before — nothing went stale.
      setRefreshFailed(!snapshotOk || results.some(r => r.status === "rejected"));
    });
    return () => { stale = true; };
  }, [refreshing, gen, source]);

  // ── the open: what the phone kept is on screen, the dot spins until the open's own reads land ──
  // Effects run in order, so every read of the first screen has started by the time this runs once the phone's
  // answers are loaded. Nothing kept (a first open, a new phone): nothing to spin over — the screen fills as it did.
  const bootOverKept = booting && memoryReady && (source.kept?.() ?? 0) > 0;
  useEffect(() => {
    if (!booting || !memoryReady) return;
    if (!bootOverKept || gen > 0) { setBooting(false); return; }
    let stale = false;
    void Promise.allSettled([...pulled.current.reads]).then(() => { if (!stale) setBooting(false); });
    return () => { stale = true; };
  }, [booting, memoryReady, bootOverKept, gen]);

  // The catalogue in the background, once the open's reads are in — only when the phone has none to show. Once:
  // a pull reads it again only on the Quote, never for a warm (it costs the database ~0.6 s).
  const catalogueWarmed = useRef(false);
  useEffect(() => {
    if (booting || catalogueWarm || catalogueWarmed.current || !catalogueNeedsWarm(source, live, data.demo, !!fixture) || !shows(closed, "quote")) return;
    const timer = window.setTimeout(() => { catalogueWarmed.current = true; setCatalogueWarm(true); }, CATALOGUE_WARM_MS);
    return () => window.clearTimeout(timer);
  }, [booting, catalogueWarm, source, live, data.demo, fixture, closed]);
  useEffect(() => {
    if (catalogueWarm && (catalogueRead.value || catalogueRead.error)) setCatalogueWarm(false);
  }, [catalogueWarm, catalogueRead.value, catalogueRead.error]);

  // Back after a while away (2026-10-06): an app left open overnight is read again once on its return, as a pull
  // would. While somebody is looking at it, nothing changes on its own.
  const latestPull = useRef({ pullRefresh, refreshing });
  latestPull.current = { pullRefresh, refreshing };
  useEffect(() => {
    if (data.demo || fixture) return;
    let hiddenAt: number | null = null;
    const back = () => {
      if (hiddenAt !== null && Date.now() - hiddenAt >= RETURN_REFRESH_MS && !latestPull.current.refreshing) latestPull.current.pullRefresh();
      hiddenAt = null;
    };
    const visibility = () => { if (document.visibilityState === "hidden") hiddenAt = Date.now(); else back(); };
    const shown = (e: PageTransitionEvent) => { if (e.persisted) back(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", shown);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pageshow", shown); };
  }, [data.demo, fixture]);

  const signOut = () => { const f = document.createElement("form"); f.method = "post"; f.action = "/member/signout"; document.body.appendChild(f); f.submit(); };

  // ── layout ──
  const quotePanel = quote.sheet !== null || quote.cartOpen || quote.allOpen || quote.previewOpen;
  const profilePanel = route.screen === "account" && (coPick !== null || honPlace !== null || personPick !== null || reqPick !== null || reqForm !== null || memoPick !== null || pfDateOpen || schemeOpen || pwOpen || emailOpen);
  // Change password: the login is a person's own (the layout hands the action only then), and it is their own Profile —
  // not a member viewed, not the demo.
  const ownPassword = changePassword && !viewed && !data.demo && !fixture ? changePassword : null;
  const ownEmail = requestEmail && !viewed && !data.demo && !fixture ? requestEmail : null;
  const anyPanel = sheet !== null || dateOpen || soPick !== null || tiersOpen || fairsOpen || champOpen || quotePanel || profilePanel;
  // A pull only from the page itself — never while a sheet is up — and never on the preview's fixtures,
  // nor on the Product List, which holds its edits until Save.
  // Nor in the CRM (`onCrm`), which reads itself every 5 s and scrolls inside its own lists: a pull listener there (a non-passive
  // touchmove) made every scroll in it wait for the page's script (the owner, 2026-10-14: "在 revenue app 很順滑，在 crm 就卡").
  const pullable = !data.demo && !fixture && !anyPanel && !nfOpen && !vaOpen && !onProducts && !onCrm;
  // A reload for a newer release loses nothing: no sheet or form open.
  reloadable.current = pullable;
  // View as takes the page column's place too (the prototype's `vaPE` opens the rail). The Product List
  // keeps the whole column and makes room inside itself instead (`shift`).
  const rail = desk && !onProducts && (nfOpen || anyPanel || (route.screen === "quote" && quoteSends) || vaOpen);
  const productShell = useMemo<ProductShell>(() => ({
    shift: desk && (nfOpen || sheet !== null || vaOpen),
    closePanels: () => { setSheet(null); setNfOpen(false); setVaOpen(false); },
    setDraft: draft => { productDraft.current = draft; },
  }), [desk, nfOpen, sheet, vaOpen]);
  // The phone's header — the sub-department, the bell, Profile — is Today's. With Today closed to them, the
  // page the app opens on carries it (2026-10-11): nowhere else on a phone switches sub-department or rings.
  const atHome = route.screen === home && route.pf === null && route.ins === "main" && route.arena === "hub";
  const showHeader = route.screen === "today" || route.screen === "calc" || (home !== "today" && atHome);
  // Profile's glow runs up into the status bar until the page scrolls (or View as covers it, or the header sits above it).
  const statusBg = route.screen === "account" && !route.pf && !compact && !vaOpen && !showHeader ? "var(--rv-peach)" : "var(--rv-white)";
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
  const customer: CustomerQuote | null = quote.confirmed ? customerQuote(quote.cart, quote.confirmed, quote.quotedBuild) : null;
  const onQuote = route.screen === "quote" || route.screen === "calc";

  let page: ReactNode;
  if (onProducts) {
    page = <ProductShellContext.Provider value={productShell}>{children}</ProductShellContext.Provider>;
  } else if (route.screen === "today") {
    // Today's figures are this month's: a tap opens Insight and the Arena on this month too.
    const insightThisMonth = (view: InsightView) => { setInsKind("monthly"); setInsFrom(period); setBillWeek(null); toInsight(view); };
    const arenaThisMonth = (board?: Board) => {
      setArKind("monthly"); setArFrom(period); setArSub("total");
      goScreen("arena", board ? { arena: "board", board } : {});
    };
    // A page their ticks close is not opened from here: its figures stay, Your Arena goes (2026-10-11).
    const insightOpen = shows(closed, "insight"), arenaOpen = shows(closed, "arena");
    page = <Today model={todayVM} hidden={hidden || incomeShut} actions={{
      toggleHide: incomeShut ? undefined : () => setHidden(!hidden),
      openMetric: insightOpen ? key => insightThisMonth(key === "sales" ? "bills" : key === "margin" ? "brand" : "kpi") : undefined,
      openTodo: todo,
      openOrders: insightOpen ? () => insightThisMonth("bills") : undefined,
      openArena: arenaOpen ? () => arenaThisMonth() : undefined,
      openBoard: arenaOpen ? board => arenaThisMonth(board) : undefined,
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
        openFoot: shows(closed, "insight") ? () => toInsight("brand") : undefined,
      }} />;
    } else {
      page = <ArenaHub vm={hubVM} kind={arKind} onKind={setArenaKind}
        onBoard={board => { setArSub("total"); goScreen("arena", { arena: "board", board }); }}
        onRecord={() => goScreen("arena", { arena: "record" })} />;
    }
  } else if (onQuote && !quote.catalog) {
    page = catalogueWaiting
      ? <div className={qs.page} role="status"><p className={qs.recentEmpty}>Loading the catalogue…</p></div>
      : <div className={qs.page}><p className={qs.recentEmpty}>No brands are set up for quotes in {membership?.name ?? "this sub-department"} yet.</p></div>;
  } else if (route.screen === "quote" && quote.catalog) {
    page = <QuoteProducts catalog={quote.catalog} memory={quote.memory} onBrand={() => openSheet("brand")} onSet={quote.applySet}
      onAll={() => { quote.setQuery(""); quote.setAllOpen(true); }} onFrameOnly={quote.openFrameOnly} onAccOnly={quote.openAccOnly} />;
  } else if (route.screen === "calc" && quote.catalog) {
    page = <QuoteCalc {...calcProps} />;
  } else if (route.screen === "account") {
    const back = () => goScreen("account");
    const pf = route.pf;
    const pick = principal && !viewed && !fxp && pf !== "memos" && pf !== "team" && pf !== "crm" && pf !== "rooms" && pf !== null;
    if (pick) {
      page = <PickSomebody title={pf === "income" || pf === "incOrders" ? "My income" : pf === "honours" ? "My honours" : pf === "brandWeeks" ? "My brand weeks" : pf === "docs" ? "Documentation" : pf === "track" ? "Waiting list & replacements" : "Requests"}
        onBack={back} onViewAs={() => setVaOpen(true)} />;
    } else if (pf === "income") {
      page = <IncomePage vm={incomeView} hidden={hidden} message={incomeRead.error} onBack={back} onPeriod={() => setPfDateOpen(true)} onToggleHide={() => setHidden(!hidden)}
        onOrders={() => goScreen("account", { pf: "incOrders" })} onMonth={p => { setIncPeriod(p); if (mainRef.current) mainRef.current.scrollTop = 0; }} />;
    } else if (pf === "incOrders") {
      page = <IncomeOrdersPage vm={ordersView} tab={coTab} message={incomeRead.error} onTab={t => { setCoTab(t); setCoPick(null); }} onBack={() => goScreen("account", { pf: "income" })}
        onPeriod={() => setPfDateOpen(true)} onRow={setCoPick} />;
    } else if (pf === "honours") {
      page = <HonoursPage vm={honoursView} kind={honKind} message={honRead.error} onKind={k => { setHonKind(k); setHonFrom(null); setHonPlace(null); }} onBack={back}
        onPeriod={() => setPfDateOpen(true)} onPlace={setHonPlace} />;
    } else if (pf === "team") {
      page = <TeamPage vm={teamView} onBack={back} onPerson={setPersonPick} />;
    } else if (pf === "requests") {
      page = <RequestsPage rows={reqRows} filter={reqFilter} kinds={pageKinds} onFilter={setReqFilter} onBack={back}
        onNew={k => { setRevising(null); setReqForm(k); }} onOpen={openRequest} />;
    } else if (pf === "track") {
      // A new one: on Requests, or — Requests closed to them — its form at once; neither when they may not send it.
      page = <TrackPage vm={trackView} segment={trackSeg} onSegment={setTrackSeg} onBack={back} onOpen={openRequest}
        onNew={!sends(closed, "track") ? undefined : shows(closed, "requests") ? () => goScreen("account", { pf: "requests" })
          : () => { setRevising(null); setReqForm(trackSeg); }} />;
    } else if (pf === "rooms") {
      page = <RoomsPage {...rooms.page} onBack={back} />;
    } else if (pf === "docs") {
      page = (
        <DocsPage
          docs={docs.docs}
          personal={docs.personal}
          message={docs.message}
          personalMessage={docs.personalMessage}
          opening={docs.opening}
          onBack={back}
          onOpen={docs.open}
          onOpenPersonal={docs.openPersonal}
        />
      );
    } else if (pf === "crm" && crm) {
      // The CRM is the signed-in account's own (the Principal: the Control panel), whoever is being viewed.
      // On a computer the Control panel draws the app's frame itself (CRM Desktop rev 1): its greeting, bell and links are these.
      page = <CrmApp live={!initialData.demo} salesperson={data.profile.name} desk={desk} open={crmOpen}
        onExit={crmFrom ? () => { const to = crmFrom; setCrmFrom(null); goScreen(to); } : back} deskApp={desk ? {
        greeting: fixture?.greeting ?? greeting(), subName: membership?.name ?? "", dateLine: `${longDayLabel(today)} · ${quarterLabel(today)}`,
        bellUnread: nfCount > 0 || nf.items.some(n => n.unread), notifCount: nfCount,
        go: screen => goScreen(screen), openNotifications: openNotif, openBell: toggleNotif, openSubDept: () => openSheet("sd"), signOut,
      } : undefined} />;
    } else if (pf === "memos") {
      page = <MemosPage memos={memoVMs} tab={memoTab} onTab={setMemoTab} onBack={back} onOpen={openMemo} />;
    } else if (pf === "brandWeeks") {
      page = <BrandWeeksPage months={bwMonths} viewing={!!context} onBack={back} />;
    } else {
      // My leads & appointments carries the chats' unread messages, the same live count as Today's chat button (the owner,
      // 2026-10-14: "有任何消息，幫我出現 notification 在 revenue apps 的 my leads & appointment 中").
      page = <ProfileMain vm={docs.unseen || crmUnread ? { ...profileVM, badges: { ...profileVM.badges, ...(docs.unseen ? { docs: String(docs.unseen) } : {}), ...(crm && crmUnread ? { crm: crmUnread > 99 ? "99+" : String(crmUnread) } : {}) } } : profileVM} hidden={hidden} crm={crm} closedRows={closedRows} push={!principal && !data.demo} actions={{
        open: (key: WorkKey) => goScreen("account", { pf: key }),
        scheme: shows(closed, "scheme") ? () => setSchemeOpen(true) : undefined,
        brandWeeks: shows(closed, "brandWeeks") ? () => goScreen("account", { pf: "brandWeeks" }) : undefined,
        toggleHide: incomeShut ? undefined : () => setHidden(!hidden),
        signOut,
        viewAs: principal && !viewed ? () => setVaOpen(true) : undefined,
        changePassword: ownPassword ? () => setPwOpen(true) : undefined,
        changeEmail: ownEmail ? () => setEmailOpen(true) : undefined,
      }} views={live && !desk && principal && !viewed ? { current: "revenue", pick: pickModule } : null} />;
    }
  } else {
    page = <Pending screen={route.screen} />;
  }
  // The CRM on a computer takes the whole column, as the Product List does (2026-10-12).
  const deskCrm = desk && route.screen === "account" && route.pf === "crm" && !!crm;

  const screen = (
    <div className={`${s.screen} ${live ? s.screenLive : s.screenFramed} ${rail ? s.rail : ""}`} style={screenVars} data-platform={android ? "android" : "ios"}>
      {!live && device !== "desktop" && <StatusBar android={android} />}
      <DeskAside active={route.screen} count={nfCount} notifOpen={nfOpen} me={me} hidden={hiddenScreens} home={home} onGo={goScreen} onQuote={() => openSheet("brand")}
        onNotif={toggleNotif} onProfile={() => goScreen("account")}
        products={productList ? { group: productList.group, onOpen: openProducts } : null}
        modules={principal ? { current: "revenue", onPick: pickModule } : null}
        crm={crm ? { unread: crmUnread ?? 0, onOpen: openCrm } : null} />
      <DeskHeader greet={fixture?.greeting ?? greeting()} me={me} subName={membership?.name ?? ""} dateLine={`${longDayLabel(today)} · ${quarterLabel(today)}`}
        unread={nfCount > 0 || nf.items.some(n => n.unread)} onSubDept={() => openSheet("sd")} onNotif={toggleNotif}
        onSignOut={() => { const f = document.createElement("form"); f.method = "post"; f.action = "/member/signout"; document.body.appendChild(f); f.submit(); }} />
      {viewed && <ViewingAsBar me={me} onSwitch={() => setVaOpen(true)} onExit={() => goScreen("account", { staff: "" })} />}
      {/* The first open asks once whether this phone gets notifications (2026-10-11, the user) — not the Principal's, as Profile's row. */}
      {live && !principal && !data.demo && !fixture ? <PushAsk app="revenue" save={savePushSubscription} trouble={reportPushTrouble} /> : null}
      {showHeader && (
        <MobileHeader ruled={scrolled} back={route.screen === "calc"} subName={membership?.name ?? ""} count={nfCount} me={me}
          crm={crm && route.screen !== "calc" ? { unread: crmUnread ?? 0, onOpen: openCrm } : null}
          onLogo={() => goScreen(home)} onBack={() => goScreen("quote")} onSubDept={() => openSheet("sd")} onBell={openNotif}
          onProfile={() => goScreen("account")} />
      )}
      <PullRefresh target={mainRef} enabled={pullable} refreshing={refreshing || bootOverKept} failed={refreshFailed} onRefresh={pullRefresh} />
      <main ref={mainRef} className={`${s.main} ${onProducts ? s.mainProducts : ""} ${deskCrm ? s.mainCrm : ""} ${onCrm ? s.mainHeld : ""}`} onScroll={e => { const t = e.currentTarget.scrollTop; const v = t > 4, c = t > 110; if (v !== scrolled) setScrolled(v); if (c !== compact) setCompact(c); }}>
        {page}
      </main>
      {route.screen === "quote" && quote.catalog && quoteSends && (
        <ProductsDock items={quote.items} itemsText={itemsText(quote.cart, quote.catalog.name)} open={quote.cartOpen} onBag={quote.toggleCart} onSetPrice={toCalc} />
      )}
      {route.screen === "calc" && quote.catalog && <CalcDock ready={!!customer} onPreview={() => { if (customer) quote.setPreviewOpen(true); }} />}
      <BottomNav active={route.screen} page={`${route.screen}/${route.pf ?? ""}/${route.ins}/${route.arena}/${route.board}`} android={android} live={live} hidden={hiddenScreens} onGo={goScreen} onQuote={() => openSheet("brand")} />
      <SubDeptSheet open={sheet === "sd"} options={subOptions} current={membership?.id ?? ""} onClose={() => setSheet(null)}
        onPick={id => { setSheet(null); go({ department: id, staff: principal ? route.staff : "" }); }} />
      <Notifications open={nfOpen} summary={nfSummaryVM} tab={nfTab} groups={nfGroupsVM}
        onTab={setNfTab} onClose={() => setNfOpen(false)} onReadAll={() => setReadAll(true)} onOpen={openNotifItem} />
      <BrandPicker open={sheet === "brand"} brands={brandList} current={quote.brand} onQuote={onQuote} cartItems={quote.items}
        onClose={() => setSheet(null)} onPick={code => { quote.setBrand(code); goScreen("quote"); }} />
      {onQuote && quote.catalog && (
        <>
          <DeskCalc show={desk && route.screen === "quote" && !anyPanel && !nfOpen && quoteSends} {...calcProps} />
          <AllModelsSheet open={quote.allOpen} catalog={quote.catalog} cart={quote.cart} query={quote.query} onQuery={quote.setQuery}
            onClose={() => quote.setAllOpen(false)} onModel={quote.openModel} />
          <CartSheet open={quote.cartOpen && quote.cart.length > 0} cart={quote.cart} brandName={quote.catalog.name} itemsText={itemsText(quote.cart, quote.catalog.name)}
            onClose={() => quote.setCartOpen(false)} onClear={quote.clearCart} onBump={quote.bump} onRemove={quote.remove} onSetPrice={toCalc} />
          <ProductSheet sheet={quote.sheet} catalog={quote.catalog} memory={quote.memory} cart={quote.cart} build={quote.build} readOnly={quote.readOnly}
            readOnlyLabel={principal && route.staff ? undefined : "View only"}
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
          {(route.pf === "requests" || route.pf === "track") && (
            <>
              <RequestSheet open={reqPick !== null && reqIsClaim} vm={reqIsClaim ? reqDetail : null} busy={reqBusy} error={reqError}
                onCancel={() => void cancelRequest()} onUpdate={updateRequest} onClose={() => setReqPick(null)} />
              <RequestInfoSheet open={reqPick !== null && reqKind !== null && !reqIsClaim} vm={!reqIsClaim ? reqDetail : null} busy={reqBusy} error={reqError}
                onSave={editRequest} onCancel={() => void cancelRequest()} onClose={() => { setReqPick(null); setReqError(null); }} />
              <RequestForm kind={reqForm} options={formOptions} revising={revising} readOnly={readOnlyView} onSubmit={submitRequest}
                formLink={fxp ? undefined : source.waitingFormLink} replFormLink={fxp ? undefined : source.replacementFormLink}
                onClose={() => { setReqForm(null); setRevising(null); }} />
            </>
          )}
          {route.pf === "rooms" && (
            <>
              <RoomBookSheet {...rooms.book} />
              <RoomViewSheet {...rooms.view} />
            </>
          )}
          {route.pf === "memos" && <MemoSheet open={memoPick !== null} memo={memoPickVM} busy={memoBusy} readOnly={memoReadOnly} error={memoError} onAck={() => void ackMemo()} onClose={() => setMemoPick(null)}
            onFile={memoPick && source.memoFile && !fxp ? mode => openMemoFile(memoPick, mode) : undefined} />}
          {!route.pf && shows(closed, "scheme") && <SchemeSheet open={schemeOpen} vm={schemeView} onClose={() => setSchemeOpen(false)} />}
          {!route.pf && ownPassword && <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} change={ownPassword} />}
          {!route.pf && ownEmail && <EmailSheet open={emailOpen} onClose={() => setEmailOpen(false)} actions={ownEmail} />}
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
  return <div style={{ padding: "24px 20px", color: "var(--rv-sub)", fontSize: "calc(14px * var(--rv-type))" }}>{screen} — being rebuilt.</div>;
}
