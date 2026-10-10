/**
 * The prototype's own screen, as data — `prototype-data.js` and the strings of
 * `renderVals()` in RevenueApp.dc.html. The design preview renders the app on
 * these so a screenshot of it can be laid over a screenshot of the prototype,
 * pixel for pixel. Server-side only: imported by the preview page, never by
 * the app, and never a live screen.
 */
import type { MemberData } from "@/lib/member/types";
import type { TodayModel } from "../today/today-model";
import type { NotifGroup } from "../notifications/notify-model";
import type { BrandOption } from "../overlays/BrandPicker";
import type { BillsVM, BrandPageVM, InsightMainVM, KpiVM, OrderSheetVM } from "../insight/insight-model";
import type { PeriodOption } from "../insight/period";
import { ICON } from "../icons";
import { protoInsight } from "./proto-insight";
import { protoArena, type ArenaFixture } from "./proto-arena";
import { protoQuote, type QuoteFixture } from "./proto-quote";
import { protoProfile, type ProfileFixture } from "./proto-profile";
import { protoRooms } from "./proto-rooms";
import { protoDocs } from "./proto-docs";
import type { MemberDocument } from "@/lib/documentation/member";
import type { MemberRoomsData } from "../profile/rooms-model";

export interface InsightFixture {
  /** The month Insight opens on (the prototype: September, on 3 October). */
  month: string;
  dateLabel: string;
  dateOptions: PeriodOption[];
  main: InsightMainVM;
  bills: BillsVM;
  kpi: KpiVM;
  /** By brand code. */
  brands: Record<string, BrandPageVM>;
  /** By bill id. */
  orders: Record<string, OrderSheetVM>;
}

export interface AppFixture {
  greeting: string;
  cartItems: number;
  brands: BrandOption[];
  today: TodayModel;
  notifications: { count: number; summary: string; groups: NotifGroup[] };
  insight?: InsightFixture;
  arena?: ArenaFixture;
  quote?: QuoteFixture;
  profile?: ProfileFixture;
  /** Book a room: the round-2 handoff's rooms and meetings (its own day, Sat 10 Oct). */
  rooms?: MemberRoomsData;
  /** Documentation: the handoff's files shared with Revenue, the newest not yet opened. */
  docs?: MemberDocument[];
}

const membership = (id: string, name: string, code: string, title: string, rank: string, calculator: boolean) => ({
  id, schemeId: `${id}-scheme`, name, code, title, rank, rate: 0, calculator, effective: "2026-01-01",
  capacity: 27, occupied: 26, people: [],
});

export function protoData(options: { principal?: boolean } = {}): MemberData {
  if (options.principal) return protoPrincipalData();
  return {
    demo: true,
    configured: true,
    refreshedAt: "2026-10-03T01:40:00Z",
    profile: { id: "me", userId: "proto-user", name: "Jia Hui Tan", email: "jiahui@example.com", salary: 2500 },
    memberships: [membership("fair", "Fair", "FAIR", "Senior Executive", "Rank B", true), membership("ir", "IR", "IR", "Executive", "", false)],
    products: [],
    bands: [],
    incomes: [],
    orders: [],
    requests: [],
    memos: [],
  };
}

/** The preview as a Principal (): every sub-department with its people, for View as. */
function protoPrincipalData(): MemberData {
  const base = protoData();
  const va = protoProfile().va.people;
  return {
    ...base,
    principalView: true,
    profile: { ...base.profile, name: "Principal", salary: null },
    memberships: base.memberships.map(m => ({ ...m, title: "Principal", rank: "All access",
      people: va.filter(p => p.departmentId === m.id).map(p => ({ id: p.id, name: p.name, title: p.sub.split(" · ")[0], rank: p.sub.split(" · ")[1] ?? "", parentId: null })) })),
  };
}

const memo = (id: string, time: string, title: string, sub: string) => ({
  id, kind: "memo" as const, tab: "memos" as const, icon: ICON.nMemo, time, title, sub, open: true, unread: true, big: null,
  link: "Read memo to acknowledge", done: null, go: { to: "memo" as const, memoId: id },
});

/** `quote`: the brand and the sheet the preview opens on (the prototype's `quoteBrand`, `sofaSheet` …). */
export function protoFixture(quote: { brand?: string; sheet?: string; charges?: boolean; track?: boolean } = {}): AppFixture {
  return {
    insight: protoInsight(),
    arena: protoArena(),
    quote: protoQuote(quote),
    profile: protoProfile({ track: quote.track }),
    rooms: protoRooms(),
    docs: protoDocs(),
    greeting: "Good morning",
    cartItems: 4,
    brands: [
      { code: "AKEMI", name: "Akemi", sofa: false, models: 16 },
      { code: "ERGOTEX", name: "Ergotex", sofa: false, models: 12 },
      { code: "DUNLOP", name: "Dunlopillo", sofa: false, models: 10 },
      { code: "ZANOTTI", name: "Zanotti", sofa: true, models: 10 },
    ],
    today: {
      hello: "Hello, Jia Hui",
      helloSub: "Sat, 3 Oct · Senior Executive · Rank B",
      heroLabel: "September · Estimated income",
      heroAmount: "RM 6,842.50",
      heroLoading: false,
      heroSplit: "Fixed salary RM 2,500.00 + commission RM 4,342.50",
      metrics: [
        { key: "sales", label: "Sales", value: "83%", tag: "of RM 70k", tagTone: "sub" },
        { key: "margin", label: "Margin", value: "38.6%", tag: "Tier 1", tagTone: "good" },
        { key: "kpi", label: "KPI", value: "27", tag: "Threshold hit", tagTone: "good" },
      ],
      todo: [
        { key: "memos", tone: "memo", icon: ICON.bell, title: "Acknowledge 2 memos", sub: "October brand weeks · Deposit rule", target: "memos" },
        { key: "rq", tone: "request", icon: ICON.receipt, title: "Replacement needs info", sub: "RQ-2609-004 · HR returned it", target: "requests" },
        { key: "weeks", tone: "weeks", icon: ICON.calendar, title: "Save October brand weeks", sub: "Due 5 Oct", target: "brandWeeks" },
      ],
      week: { title: "Week 2 · Ergotex week", dates: "9–11 Oct", venue: "IOI City Mall", org: "Mega Home Fair" },
      boards: [
        { id: "sales", label: "Sales", rankNum: "4", rankSuf: "th", state: "ranked" },
        { id: "margin", label: "Margin", rankNum: "2", rankSuf: "nd", state: "ranked" },
        { id: "kpi", label: "KPI", rankNum: "3", rankSuf: "rd", state: "ranked" },
        { id: "champ", label: "Championship", rankNum: "2", rankSuf: "nd", state: "ranked" },
      ],
    },
    notifications: {
      count: 3,
      summary: "3 waiting for you · September results are in",
      groups: [
        { title: "NEEDS YOU", items: [
          memo("m1", "2 Oct", "October brand weeks are open", "HR · Revenue · Save your 4 brand weeks by 5 Oct."),
          memo("m2", "30 Sep", "Deposit rule reminder", "Management · Orders count only once the deposit clears."),
          { id: "q1", kind: "req", tab: "requests", icon: ICON.nBack, time: "2 Oct", title: "RQ-2609-004 returned by HR", sub: "Replacement needs the original invoice number.",
            open: true, unread: true, big: null, link: "Open request", done: { text: "Returned · needs your update", tone: "red" }, go: { to: "requests" } },
        ] },
        { title: "SEPTEMBER RESULTS", items: [
          { id: "r1", kind: "res", tab: "results", icon: ICON.nCup, time: "Today 9:00", title: "September is settled · rankings are final", sub: "Fair · Sales board · 24 people ranked",
            open: false, unread: true, big: [{ v: "#3", l: "Sales" }, { v: "#5", l: "Margin" }, { v: "+40", l: "Champ pts" }], link: "View Arena boards", done: null, go: { to: "arena" } },
          { id: "p1", kind: "pay", tab: "results", icon: ICON.nCash, time: "Today 9:00", title: "September commission RM 4,342.50", sub: "Goes to payroll with your fixed salary of RM 2,500.00.",
            open: false, unread: true, big: null, link: "Open My income", done: null, go: { to: "income" } },
        ] },
        { title: "REQUEST UPDATES", items: [
          { id: "a1", kind: "req", tab: "requests", icon: ICON.nOk, time: "10 min", title: "Waiting list · Ergotex sub-team", sub: "RQ-2610-002 · You are 2nd in line. HR will confirm when a place opens.",
            open: false, unread: false, big: null, link: null, done: { text: "Waiting · 2nd in line", tone: "amber" }, go: { to: "requests" } },
          { id: "a2", kind: "req", tab: "requests", icon: ICON.nOk, time: "1 h", title: "Transport claim RM 86.00", sub: "RQ-2609-007 · Mid Valley fair · 28–30 Sep",
            open: false, unread: false, big: null, link: null, done: { text: "Approved by HR · paid with October payroll", tone: "green" }, go: { to: "requests" } },
        ] },
      ],
    },
  };
}
