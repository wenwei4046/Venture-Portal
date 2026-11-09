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
export interface F4Menu { open: boolean; close: () => void; items: { tag: string; label: string; bg: string; fg: string; pick: () => void }[] }
export interface F4Head { /** Insight's comparison, a pill that turns it off and on. */ vs?: { on: boolean; label: string; toggle(): void };
  /** v4 notes/20: the period tabs drawn as one segmented control, the dates in grey after it. */ seg?: boolean;
  /** v4 D2a: "+ Compare" after the dates (Insight › Ads performance). */ cmp?: { on: boolean; label: string; toggle(): void } | null; title: string; tabs: F4Tab[]; subTabs?: F4Tab[]; /** Up next: the tab bar holds the ad dropdown (DeskUpNext). */ subSlot?: boolean; /** A tab's padding where the design differs (Assignment: 10px 0, CRM Assignment People.dc.html). */ subPad?: string; sub: string; cta: { label: string; icon: Icon4a | null; act: () => void; menu?: F4Menu } | null;
  /** A tab's date picker open (Insight's Custom — shared/date-range.tsx), anchored on the tab it belongs to. */
  picker?: { tab: string; allFrom?: number; value: { a: number; b: number } | null; apply(r: { a: number; b: number }): void; cancel(): void } | null;
  /** An outline button left of the primary one (Showrooms' Save as draft). */
  alt?: { label: string; act: () => void } | null }

const CRM_ICON: Record<DeskTab, Icon4a> = {
  insight: "trending-up", inbox: "inbox", people: "contact", calendar: "calendar", adsperf: "arrow-up-right", assignment: "users",
  showrooms: "map-pin", forms: "list", channels: "phone", settings: "sliders-horizontal", auditlog: "clock-3", reports: "file-text", workspace: "file-text", activity: "activity",
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
    Showrooms: "showrooms", "Customer form": "forms", Forms: "forms", Channels: "channels", Settings: "settings", "Audit log": "auditlog", Reports: "reports", Workspace: "workspace", "Team activity": "activity" };
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
    head: { title: fr.pageTitle, tabs: h?.tabs ?? [], seg: h?.seg, cmp: h?.cmp ?? null, subTabs: h?.subTabs, subSlot: h?.subSlot, subPad: h?.subPad, picker: h?.picker ?? null, sub: h?.sub ?? "", vs: h?.vs, cta: h?.cta ?? null, alt: h?.alt ?? null } as F4Head,
    alertsN: fr.alertsN, openAlerts: fr.openAlerts,
    // Reports draws its own head too (v4 D6a, DeskReports).
    // Inbox runs its columns edge to edge under a rule (frame 02); every other page has the 36 px gutter.
    // Calendar's Book a visit (frame 04): pick the customer, then the booking pane every chat's Appointment opens.
    addCust: ui.addCust ? {
      title: ui.addCust === "chat" ? "New chat" : "Add customer", go: ui.addCust === "chat" ? "Start chat" : "Add customer",
      people: ctx.data.can.manage ? [...ctx.directors, ...ctx.teams.flatMap(t => t.people)].filter((p, i, a) => a.findIndex(x => x.id === p.id) === i).map(p => ({ id: p.id, name: p.name })) : null,
      me: ctx.me.id, close: () => ctx.patch({ addCust: null }),
      save: async (name: string, phone: string, assign: string | null) => {
        const id = await ctx.deskAct.addCustomer(name, phone, assign && assign !== ctx.me.id ? assign : null);
        if (!id) return false;
        if (ui.addCust === "chat") ctx.patch({ addCust: null, tab: "inbox", pane: "docked", kind: "chat", chat: id, inbF: "All", whoSel: [] });
        else ctx.patch({ addCust: null, toast: `${name.trim()} added · their chat opens with a template` });
        return true;
      },
    } : null,
    bookPick: (() => {
      const q = ui.bookQ.trim().toLowerCase();
      const rows = data.customers.filter(c => c.status !== "won" && c.status !== "lost" && (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q))).slice(0, 30);
      return { open: ui.bookPick, close: () => ctx.patch({ bookPick: false, bookQ: "" }), q: ui.bookQ, setQ: (e: { target: { value: string } }) => ctx.patch({ bookQ: e.target.value }),
        rows: rows.map(c => ({ id: c.id, name: c.name, sub: [c.phone, c.ad].filter(Boolean).join(" · "), pick: () => ctx.patch({ bookPick: false, bookQ: "", pane: "overlay", kind: "book", chat: c.id, book: null }) })) };
    })(),
    // v4 frames D1a–D4b: Insight keeps the prototype’s 32 px gutter (head, tab row and body); every other page keeps 36.
    gut: tab === "insight" ? "32px" : "36px",
    pad: tab === "insight" && ui.insTab === "upnext" ? "24px 32px 32px" : tab === "insight" && ui.insTab !== "activity" ? "0 32px 32px" : (tab === "reports" || tab === "workspace") && ui.rpCat !== "ads" ? "0" : tab === "inbox" || tab === "calendar" || tab === "activity" || (tab === "insight" && ui.insTab === "activity") ? "0" : tab === "people" ? "0 28px 20px 36px" : tab === "auditlog" ? "7px 36px 32px" : "0 36px 32px", gap: tab === "inbox" || tab === "adsperf" || (tab === "insight" && ui.insTab === "ads") || (tab === "reports" && ui.rpCat === "ads") ? "0" : tab === "insight" && ui.insTab === "upnext" ? "32px" : "24px", ownHead: tab === "calendar" || tab === "activity" || tab === "reports" || tab === "workspace", bodyTop: ["inbox", "people", "showrooms", "forms"].includes(tab) ? "1px solid var(--crm-rule)" : "0",
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
  apDl: { v: string; tag: string; label: string; bg: string; fg: string; pick: () => void }[];
  apDlOpen: boolean; apToggleDl: () => void;
  sr4: { save: () => void; dirty: boolean; draftable?: boolean; saveDraft: () => void };
  srPage: "rooms" | "types" | "keys"; at: { save: () => void; dirty: boolean };
  cfSave: () => void;
  cfSummary: string;
  ppCount: number;
  auditCsv: () => void;
  auCount: number;
  showroomCount: number;
  insightPdf: () => void;
  insightSub: string;
  insVs?: { on: boolean; label: string; toggle(): void };
  insCmp?: { on: boolean; label: string; toggle(): void } | null;
  insTabs: F4Tab[];
  insPicker?: { value: { a: number; b: number } | null; apply(r: { a: number; b: number }): void; cancel(): void } | null;
  kUpNext?: boolean;
  kInsAct?: boolean;
  ap4: { tabs: { label: string; on: boolean; custom: boolean; pick: () => void }[] };
  addAd?: { canAdd: boolean; show: () => void };
  reports?: { cat?: string; overview?: { bys: F4Tab[] }; cats: { label: string; on: boolean; pick: () => void }[]; canCsv: boolean; csv: () => void };
  dpOpen: () => void;
}

/** Assignment's tabs as the design names them (docs/design_handoff_crm, CRM Assignment People.dc.html). */
const TAB_WORDS: Record<string, string> = { "Ads to teams": "Ad split", "Full time lead allocation": "Full time days", People: "Leave" };

/**
 * Reports' head tabs: My reports is gone (the owner, 2026-11-09: "如果把 my reports 删掉，by ad & by salesperson 调整他的画面 UI
 * 可以吗") — Overview's By ad | By salesperson stand where Ready-made | My reports stood; the other reports have none. The
 * saved reports themselves are kept (crm_workspace_*), only the page left.
 */
const rpTabs = (v: HeadBits): F4Tab[] => (v.reports?.cat === "overview" && v.reports.overview ? v.reports.overview.bys : []);

/** Each page's head (frames 01–11): its tabs, its line and its one primary button — each bound to what the page already does. */
export function heads4a(ctx: DeskCtx, v: HeadBits): Partial<Record<DeskTab, Omit<F4Head, "title">>> {
  const n = (k: number, one: string, many: string) => `${k.toLocaleString("en-MY")} ${k === 1 ? one : many}`;
  return {
    // v2 frames 01 / 01b: Team performance | Ads performance under the title; Export PDF.
    // v4 notes/20–23 (frames D1a–D4b): every Insight tab has the same head — the period as one segmented control, its
    // dates in grey, Export PDF — so switching tabs moves nothing. The "vs … ×" chip is gone (the figures still compare).
    // Up next and Team activity read this period (Team activity's own Today / Week / Month / Custom went); Ads
    // performance adds "+ Compare" (D2a), its own third filter gone.
    insight: { tabs: v.periodOpts, seg: true, subTabs: v.insTabs, sub: v.insightSub, cmp: v.insCmp ?? null, cta: { label: "Export PDF", icon: "file-text", act: v.insightPdf }, picker: v.insPicker ? { tab: "Custom", ...v.insPicker } : null },
    // v2 frames 02 / 03 (the owner: "做手动新增客户"): New chat and Add customer — one sheet, a customer added by hand.
    inbox: { tabs: [], sub: "", cta: ctx.data.can.editOwn ? { label: "New chat", icon: "plus", act: () => ctx.patch({ addCust: "chat" }) } : null },
    people: { tabs: [], sub: n(v.ppCount, "customer", "customers"), cta: ctx.data.can.editOwn ? { label: "Add customer", icon: "user-plus", act: () => ctx.patch({ addCust: "contact" }) } : null },
    calendar: { tabs: v.calViews, sub: v.calTitle, cta: { label: "Book a visit", icon: "calendar", act: () => ctx.patch({ bookPick: !ctx.ui.bookPick }) } },
    // v2 (frame 05, note 02): no period tabs (the range button under the title does it); Export is the head's primary, its
    // menu Excel / CSV / PDF report as before.
    adsperf: { tabs: [], sub: "", cta: { label: "Export", icon: null, act: v.apToggleDl, menu: { open: v.apDlOpen, close: v.apToggleDl, items: v.apDl } } },
    // v2 (frames 06b / 06c): Assignment's five sections are the second row of tabs.
    assignment: { tabs: [], subPad: "10px 0", subTabs: v.listCards.map(c => ({ label: TAB_WORDS[c.title] ?? c.title, on: c.title === v.opItem, pick: c.pick })), sub: "", cta: v.opItem === "Ads to teams" && v.addAd?.canAdd ? { label: "Add ad", icon: "plus", act: v.addAd.show } : null },
    // Showrooms and Appointment types (2026-10-24: "在電腦端有個控制面板，可以放在showroom 那邊"), each saved by the head's Save.
    // …and Key log (2026-10-29: "在 showroom 要有一个表单，去记录 member 借还钥匙的情况"), read only, no Save.
    showrooms: { tabs: [], subTabs: ([["rooms", "Showrooms"], ["types", "Appointment types"], ["keys", "Key log"]] as const).map(([k, label]) => ({ label, on: v.srPage === k, pick: () => ctx.patch({ srPage: k }) })),
      sub: v.srPage === "rooms" ? n(v.showroomCount, "showroom", "showrooms") : "", cta: v.srPage === "keys" ? null : { label: "Save", icon: "check", act: v.srPage === "types" ? v.at.save : v.sr4.save },
      // Save as draft (2026-11-03): the showroom's changes kept, not live until Save.
      alt: v.srPage === "rooms" && v.sr4.draftable ? { label: "Save as draft", act: v.sr4.saveDraft } : null },
    forms: { tabs: [], sub: v.cfSummary, cta: { label: "Publish", icon: "check", act: v.cfSave } },
    channels: { tabs: [], sub: "", cta: { label: "Add a number", icon: "plus", act: () => window.open("https://business.facebook.com/wa/manage/phone-numbers/", "_blank", "noopener") } },
    // Settings: General · Booking link · Cold lead templates · Notifications (the owner, 2026-11-08: Reply library deleted).
    settings: { tabs: v.listCards.map(c => ({ label: c.title, on: c.title === v.opItem, pick: c.pick })), sub: "", cta: null },
    auditlog: { tabs: [], sub: n(v.auCount, "change", "changes"), cta: { label: "Export CSV", icon: "download", act: v.auditCsv } },
    // Reports (2026-10-23): its categories as the head's tabs, Export CSV of the one on screen.
    // v2 frame 12: the categories are the second row of tabs; Ads performance is frame 05's body and its Export menu.
    reports: { tabs: rpTabs(v), subTabs: v.reports?.cats ?? [], sub: "", cta: v.reports?.cats.find(c => c.on)?.label === "Ads performance"
      ? { label: "Export", icon: "download", act: v.apToggleDl, menu: { open: v.apDlOpen, close: v.apToggleDl, items: v.apDl } }
      : v.reports?.canCsv ? { label: "Export", icon: "download", act: v.reports.csv } : null },
    workspace: { tabs: rpTabs(v), subTabs: v.reports?.cats ?? [], sub: "", cta: null },
  };
}
