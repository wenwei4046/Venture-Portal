import type { MemberIncome, MemberMemo, MemberRequest, RequestKind } from "@/lib/member/types";
import type { Notice } from "@/lib/push/notices";
import { monthName, rm2, shortDay } from "../format";
import { ICON } from "../icons";

/** The bell: built from what already exists — memos, requests and the settled month. */
export type NotifTab = "all" | "requests" | "memos" | "results" | "updates";
export type NotifKind = "memo" | "res" | "pay" | "req" | "room" | "hire";
export type NotifGo =
  | { to: "memo"; memoId: string }
  | { to: "requests"; requestId?: string; kind?: RequestKind }
  | { to: "income" }
  | { to: "arena" }
  | { to: "rooms" }
  | { to: "none" };

export interface NotifItem {
  id: string;
  kind: NotifKind;
  tab: Exclude<NotifTab, "all">;
  icon: string;
  time: string;
  title: string;
  sub: string;
  /** Needs the person: a memo to acknowledge, or a request HR returned. */
  open: boolean;
  unread: boolean;
  big: { v: string; l: string }[] | null;
  link: string | null;
  done: { text: string; tone: "green" | "amber" | "red" | "sub" } | null;
  go: NotifGo;
}
export interface NotifGroup { title: string; items: NotifItem[] }

export interface SettledResults {
  period: string;
  subName: string;
  ranked: number;
  sales: number | null;
  margin: number | null;
  champ: string | null;
}

export interface NotifyInput {
  now: Date;
  memos: MemberMemo[];
  requests: MemberRequest[];
  /** The newest settled statement of this sub-department, when it is recent. */
  settled?: MemberIncome;
  salary: number | null;
  results?: SettledResults | null;
  readAll: boolean;
  requestCode: (request: MemberRequest) => string;
  /** Where the app may take them (2026-10-11): news about a page their ticks close is not shown. */
  opens?: (go: NotifGo) => boolean;
  /**
   * What the database told them (2026-10-11, mig 20261011180000): a meeting booked for them, added,
   * changed or cancelled; their manpower request's step. Shown under All, as UPDATES.
   */
  notices?: readonly Notice[];
}

const STATUS: Record<string, { text: string; tone: NonNullable<NotifItem["done"]>["tone"] }> = {
  submitted: { text: "Pending HR", tone: "amber" },
  approved: { text: "Approved by HR", tone: "green" },
  rejected: { text: "Rejected by HR", tone: "red" },
  waiting: { text: "On the waiting list", tone: "amber" },
  reserved: { text: "Place reserved", tone: "amber" },
  accepted: { text: "Accepted", tone: "green" },
  allocated: { text: "Allocated", tone: "green" },
  executed: { text: "Done", tone: "green" },
  paid: { text: "Paid", tone: "green" },
  withdrawn: { text: "Cancelled", tone: "sub" },
  expired: { text: "Expired", tone: "sub" },
  failed: { text: "Removed from the waiting list", tone: "red" },
  scheduled: { text: "Scheduled", tone: "amber" },
};

/** `10 min`, `3 h`, then `2 Oct`. */
export function ago(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const minutes = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`;
  const kl = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  return shortDay(kl);
}

function firstSentence(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  const match = text.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim();
}

export function notifications(input: NotifyInput): { items: NotifItem[]; count: number } {
  const items: NotifItem[] = [];
  for (const r of input.requests) {
    const action = r.status === "needs_info";
    const status = STATUS[r.status];
    items.push({
      id: `rq-${r.id}`, kind: "req", tab: "requests", icon: action ? ICON.nBack : ICON.nOk, time: ago(r.createdAt, input.now),
      title: action ? `${input.requestCode(r)} returned by HR` : r.title,
      sub: action ? r.note || "HR needs more information." : `${input.requestCode(r)}${r.note ? ` · ${r.note}` : ""}`,
      open: action, unread: action, big: null, link: action ? "Open request" : null,
      done: action ? { text: "Returned · needs your update", tone: "red" } : status ? status : null,
      go: { to: "requests", requestId: r.id, kind: r.kind },
    });
  }
  for (const m of input.memos) {
    const needs = m.requiresAck && !m.acknowledgedAt;
    items.push({
      id: `memo-${m.id}`, kind: "memo", tab: "memos", icon: ICON.nMemo, time: ago(m.publishedAt, input.now),
      title: m.title, sub: `${m.sender} · ${firstSentence(m.body)}`,
      open: needs, unread: needs, big: null, link: needs ? "Read memo to acknowledge" : null,
      done: m.requiresAck && m.acknowledgedAt ? { text: "Read and acknowledged", tone: "green" } : null,
      go: { to: "memo", memoId: m.id },
    });
  }
  const settled = input.settled;
  if (settled) {
    const month = monthName(settled.period);
    const results = input.results;
    if (results) {
      items.push({
        id: `res-${settled.period}`, kind: "res", tab: "results", icon: ICON.nCup, time: "",
        title: `${month} is settled · rankings are final`, sub: `${results.subName} · Sales board · ${results.ranked} people ranked`,
        open: false, unread: !input.readAll,
        big: [
          { v: results.sales ? `#${results.sales}` : "—", l: "Sales" },
          { v: results.margin ? `#${results.margin}` : "—", l: "Margin" },
          { v: results.champ ?? "—", l: "Champ pts" },
        ],
        link: "View Arena boards", done: null, go: { to: "arena" },
      });
    }
    items.push({
      id: `pay-${settled.period}`, kind: "pay", tab: "results", icon: ICON.nCash, time: "",
      title: `${month} commission ${rm2(settled.total)}`,
      sub: input.salary !== null ? `Goes to payroll with your fixed salary of ${rm2(input.salary)}.` : "Goes to payroll with your fixed salary.",
      open: false, unread: !input.readAll, big: null, link: "Open My income", done: null, go: { to: "income" },
    });
  }
  for (const n of input.notices ?? []) {
    const room = n.refKind === "booking";
    items.push({
      id: `nt-${n.id}`, kind: room ? "room" : "hire", tab: "updates", icon: room ? ICON.calendar : ICON.queue, time: ago(n.at, input.now),
      title: n.title, sub: n.body, open: false, unread: !n.read, big: null, link: room ? "Open Book a room" : null, done: null,
      go: room ? { to: "rooms" } : { to: "none" },
    });
  }
  const shown = input.opens ? items.filter(n => input.opens!(n.go)) : items;
  return { items: shown, count: shown.filter(n => n.open).length };
}

export function notifGroups(items: NotifItem[], tab: NotifTab, settledMonth: string | null): NotifGroup[] {
  const visible = items.filter(n => tab === "all" || n.tab === tab);
  const need = visible.filter(n => n.open);
  const res = visible.filter(n => n.kind === "res" || n.kind === "pay");
  const upd = visible.filter(n => n.kind === "req" && !n.open);
  const news = visible.filter(n => n.kind === "room" || n.kind === "hire");
  const rest = visible.filter(n => !need.includes(n) && !res.includes(n) && !upd.includes(n) && !news.includes(n));
  const groups: [string, NotifItem[]][] = [
    ["NEEDS YOU", need],
    ["UPDATES", news],
    [`${(settledMonth ?? "").toUpperCase()} RESULTS`, res],
    ["REQUEST UPDATES", upd],
    ["EARLIER", rest],
  ];
  return groups.filter(([, list]) => list.length).map(([title, list]) => ({ title, items: list }));
}

export function notifSummary(count: number, settledMonth: string | null): string {
  const head = count ? `${count} waiting for you` : "All caught up";
  return settledMonth ? `${head} · ${settledMonth} results are in` : head;
}
