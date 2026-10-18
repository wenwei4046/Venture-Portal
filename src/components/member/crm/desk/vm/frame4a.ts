/**
 * The desktop CRM's frame in 4a "Espresso & White" (2026-10-18, docs/design_handoff_crm_redesign — change list 9,
 * frames 01–11): the Revenue app's sidebar in ink with the CRM item filled rust (drawn only while the CRM is open —
 * the owner, 2026-10-18), the CRM nav on cream with its active item and orange bar, the 56 px top bar and each page's
 * head (title, underline tabs, a muted line, CRM alerts and the page's one primary button). Built on the frame's own
 * view model, so every link, count and permission is the one the frame already had.
 */
import type { DeskCtx, DeskTab } from "./ctx";
import type { Icon4a } from "../../shared/icons4a";

export interface F4Item { label: string; icon: Icon4a; on: boolean; pick: () => void; badge: string }
export interface F4Tab { label: string; on: boolean; pick: () => void }
export interface F4Head { title: string; tabs: F4Tab[]; sub: string; cta: { label: string; icon: Icon4a; act: () => void } | null }

const CRM_ICON: Record<DeskTab, Icon4a> = {
  insight: "trending-up", inbox: "inbox", people: "contact", calendar: "calendar", adsperf: "arrow-up-right", assignment: "users",
  showrooms: "map-pin", forms: "list", channels: "phone", settings: "sliders-horizontal", auditlog: "clock-3",
};

/** "Sun, 18 Oct 2026" — the top bar's date, as the frames write it. */
export function topDate(now: Date): string {
  const d = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).formatToParts(now);
  const p = (t: string) => d.find(x => x.type === t)?.value ?? "";
  return `${p("weekday")}, ${p("day")} ${p("month").slice(0, 3)} ${p("year")}`;
}

interface FrameBits {
  crmGroups: { label: string | null; items: { label: string; on: boolean; pick: () => void }[] }[];
  appTop: { label: string; pick?: () => void }[];
  me: { ini: string; name: string; sub: string };
  pageTitle: string;
  alertsN: string;
  openAlerts: () => void;
}

export function frame4aVM(ctx: DeskCtx, fr: FrameBits, head: Partial<Record<DeskTab, Omit<F4Head, "title">>>) {
  const { ui, data, app } = ctx;
  const hidden = new Set(app.hidden ?? []);
  const inboxUnread = data.customers.reduce((n, c) => n + (c.unread || 0), 0);
  const ids: Record<string, DeskTab> = { Insight: "insight", Inbox: "inbox", Contacts: "people", Calendar: "calendar", "Ads Performance": "adsperf", Assignment: "assignment",
    Showrooms: "showrooms", "Customer form": "forms", Channels: "channels", Settings: "settings", "Audit log": "auditlog" };
  const crmNav = fr.crmGroups.map(g => ({ head: g.label ?? "", items: g.items.map((n): F4Item => {
    const id = ids[n.label] ?? "insight";
    return { label: n.label, icon: CRM_ICON[id], on: n.on, pick: n.pick, badge: id === "inbox" && inboxUnread ? (inboxUnread > 99 ? "99+" : String(inboxUnread)) : "" };
  }) }));
  const appPick = (label: string) => fr.appTop.find(a => a.label === label)?.pick ?? (() => {});
  const crmBadge = app.crmUnread ? (app.crmUnread > 99 ? "99+" : String(app.crmUnread)) : "";
  const rev: (F4Item & { screen: string })[] = [
    { screen: "today", label: "Today", icon: "calendar", on: false, pick: appPick("Today"), badge: "" },
    { screen: "insight", label: "Insight", icon: "trending-up", on: false, pick: appPick("Insight"), badge: "" },
    { screen: "quote", label: "Quote", icon: "file-text", on: false, pick: appPick("Quote"), badge: "" },
    { screen: "arena", label: "Arena", icon: "flag", on: false, pick: appPick("Arena"), badge: "" },
    { screen: "crm", label: "CRM", icon: "message-circle", on: true, pick: () => {}, badge: crmBadge },
    { screen: "account", label: "Profile", icon: "user-round", on: false, pick: () => app.go("account"), badge: "" },
  ];
  const revNav = rev.filter(r => !hidden.has(r.screen));
  const tab = ui.tab;
  const h = head[tab];
  return {
    revNav, crmNav,
    notif: { label: "Notifications", count: app.notifCount ? String(app.notifCount) : "", pick: app.openNotifications },
    products: app.products ?? null,
    modules: app.modules ?? null,
    account: { ini: fr.me.ini, name: fr.me.name, sub: fr.me.sub },
    greet: app.greeting, first: ctx.me.role === "boss" ? "Principal" : ctx.me.name.trim().split(/\s+/)[0] ?? "",
    subName: app.subName, openSubDept: app.openSubDept, date: topDate(ctx.now),
    head: { title: fr.pageTitle, tabs: h?.tabs ?? [], sub: h?.sub ?? "", cta: h?.cta ?? null } as F4Head,
    alertsN: fr.alertsN, openAlerts: fr.openAlerts,
    // Inbox runs its columns edge to edge under a rule (frame 02); every other page has the 36 px gutter.
    // Calendar's Book a visit (frame 04): pick the customer, then the booking pane every chat's Appointment opens.
    bookPick: (() => {
      const q = ui.bookQ.trim().toLowerCase();
      const rows = data.customers.filter(c => c.status !== "won" && c.status !== "lost" && (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q))).slice(0, 30);
      return { open: ui.bookPick, close: () => ctx.patch({ bookPick: false, bookQ: "" }), q: ui.bookQ, setQ: (e: { target: { value: string } }) => ctx.patch({ bookQ: e.target.value }),
        rows: rows.map(c => ({ id: c.id, name: c.name, sub: [c.phone, c.ad].filter(Boolean).join(" · "), pick: () => ctx.patch({ bookPick: false, bookQ: "", pane: "overlay", kind: "book", chat: c.id, book: null }) })) };
    })(),
    pad: tab === "inbox" ? "0" : tab === "people" ? "0 28px 20px 36px" : tab === "calendar" ? "0 24px 16px 36px" : tab === "auditlog" ? "7px 36px 32px" : "0 36px 32px", gap: tab === "inbox" ? "0" : "24px", bodyTop: ["inbox", "people", "calendar", "showrooms", "assignment", "forms", "adsperf"].includes(tab) && tab !== "adsperf" ? "1px solid var(--crm-rule)" : "0",
  };
}
export type Frame4a = ReturnType<typeof frame4aVM>;

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "1–31 Oct", "28 Sep – 4 Oct" — a range as the frames' heads write it. */
export function rangeLine(r: { a: number; b: number }): string {
  const a = new Date(r.a), b = new Date(r.b);
  if (r.a === r.b) return `${a.getDate()} ${SHORT[a.getMonth()]}`;
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${SHORT[b.getMonth()]}` : `${a.getDate()} ${SHORT[a.getMonth()]} – ${b.getDate()} ${SHORT[b.getMonth()]}`;
}

interface HeadBits {
  periodOpts: { label: string; on: boolean; pick: () => void }[];
  calViews: { label: string; on: boolean; pick: () => void }[];
  calTitle: string;
  listCards: { title: string; pick: () => void; titleColor: string }[];
  opItem: string;
  apDl: { v: string; pick: () => void }[];
  sr4: { save: () => void; dirty: boolean };
  cfSave: () => void;
  ppCount: number;
  auditCsv: () => void;
  auCount: number;
  showroomCount: number;
  insightPdf: () => void;
  insightSub: string;
  ap4: { tabs: { label: string; on: boolean; custom: boolean; pick: () => void }[] };
  dpOpen: () => void;
}

/** Each page's head (frames 01–11): its tabs, its line and its one primary button — each bound to what the page already does. */
export function heads4a(ctx: DeskCtx, v: HeadBits): Partial<Record<DeskTab, Omit<F4Head, "title">>> {
  const n = (k: number, one: string, many: string) => `${k.toLocaleString("en-MY")} ${k === 1 ? one : many}`;
  const pdf = v.apDl.find(d => d.v === "pdf");
  return {
    insight: { tabs: v.periodOpts, sub: v.insightSub, cta: { label: "Export PDF", icon: "file-text", act: v.insightPdf } },
    inbox: { tabs: [], sub: "", cta: null },
    people: { tabs: [], sub: n(v.ppCount, "customer", "customers"), cta: null },
    calendar: { tabs: v.calViews, sub: v.calTitle, cta: { label: "Book a visit", icon: "calendar", act: () => ctx.patch({ bookPick: !ctx.ui.bookPick }) } },
    adsperf: { tabs: v.ap4.tabs.map(t => ({ label: t.label, on: t.on, pick: t.custom ? v.dpOpen : t.pick })), sub: "", cta: pdf ? { label: "Download PDF", icon: "download", act: pdf.pick } : null },
    assignment: { tabs: v.listCards.map(c => ({ label: c.title, on: c.title === v.opItem, pick: c.pick })), sub: "", cta: null },
    showrooms: { tabs: [], sub: n(v.showroomCount, "showroom", "showrooms"), cta: { label: "Save", icon: "check", act: v.sr4.save } },
    forms: { tabs: [], sub: "", cta: { label: "Publish", icon: "check", act: v.cfSave } },
    channels: { tabs: [], sub: "", cta: { label: "Add a number", icon: "plus", act: () => window.open("https://business.facebook.com/wa/manage/phone-numbers/", "_blank", "noopener") } },
    settings: { tabs: v.listCards.map(c => ({ label: c.title, on: c.title === v.opItem, pick: c.pick })), sub: "", cta: null },
    auditlog: { tabs: [], sub: n(v.auCount, "change", "changes"), cta: { label: "Export CSV", icon: "download", act: v.auditCsv } },
  };
}
