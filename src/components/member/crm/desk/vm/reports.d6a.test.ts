// v4 D6a (docs/design_handoff_crm_redesign_v4, notes/25): Reports › Overview — no-ad leads by channel, each person's
// "N need a reply", the side panel's plain sentences (needs-a-reply first), the Columns picker remembered per user, and the
// period switch Today · This week · This month · Custom.
import { describe, expect, it, vi } from "vitest";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import { teamsOf } from "../../panel/vm/common";
import { initialDeskUi, type DeskCtx, type DeskUi } from "./ctx";
import { colValue, overviewReport, periodRange, readReportCols, replyState, reportColumns, RP_PERIODS, sortByCol, waitWords } from "./reports";
import { replySentence, reportsVM, RP_CATS } from "./reports-page";

const now = new Date("2026-11-10T12:00:00+08:00");
const iso = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const m = (from: "lead" | "me", h: number, auto = false) => ({ id: `${from}${h}`, kind: "text", text: "", from, at: iso(h), ...(auto ? { auto: true } : {}) });
const C = (id: string, msgs: ReturnType<typeof m>[], extra: Partial<CrmCustomer> = {}) =>
  ({ id, name: id.toUpperCase(), adId: null, ad: "", channel: "whatsapp", assignedTo: "p1", createdAt: iso(100), status: "follow_up", messages: msgs, ...extra }) as unknown as CrmCustomer;

describe("who a chat waits on", () => {
  it("never replied, needs our reply, the customer's turn, a visit booked, closed", () => {
    expect(replyState(C("a", [m("lead", 72), m("me", 71.9, true)]), [], now)).toMatchObject({ kind: "never", since: new Date(iso(72)).getTime() });
    expect(replyState(C("b", [m("lead", 20), m("me", 19), m("lead", 9), m("lead", 8)]), [], now)).toMatchObject({ kind: "ours", since: new Date(iso(9)).getTime() });
    expect(replyState(C("c", [m("lead", 60), m("me", 48)]), [], now).kind).toBe("theirs");
    const v = [{ customerId: "d", state: "booked", start: "2026-11-14T06:00:00Z" }] as CrmVisit[];
    expect(replyState(C("d", [m("lead", 5)]), v, now)).toMatchObject({ kind: "visit", visitAt: "2026-11-14T06:00:00Z" });
    expect(replyState(C("e", [m("lead", 5)], { status: "won" }), [], now).kind).toBe("closed");
  });
  it("says it in words, coloured as D6a", () => {
    expect(replySentence("never", now.getTime() - 3 * 86_400_000, null, now, "New")).toEqual({ text: "Never replied · 3 d", tone: "oxblood" });
    expect(replySentence("ours", now.getTime() - 9 * 3_600_000, null, now, "Follow up")).toEqual({ text: "Needs our reply · 9 h", tone: "oxblood" });
    expect(replySentence("theirs", now.getTime() - 2 * 86_400_000, null, now, "Follow up")).toEqual({ text: "Customer hasn't replied · 2 d", tone: "muted" });
    expect(replySentence("visit", 0, "2026-11-14T06:00:00Z", now, "Appointment")).toEqual({ text: "Visit booked · Sat 14 Nov", tone: "green" });
    expect(waitWords(40 * 60_000)).toBe("40 m");
  });
});

describe("the overview's rows", () => {
  const cs = [C("a", [m("lead", 72)], { adId: "A", ad: "Ad A" }), C("b", [m("lead", 9), m("me", 8)], { adId: "A", ad: "Ad A", assignedTo: "p2" }),
    C("c", [m("lead", 5)], { channel: "messenger" }), C("d", [m("lead", 5), m("me", 4)])];
  const r = overviewReport(cs, [0, now.getTime()], c => c.ad, id => id.toUpperCase(), c => (c.id === "a" ? "Attention" : "Follow up"), [], "all", now);
  it("splits leads from no ad by channel and counts statuses, channels and who needs a reply", () => {
    expect(r.byAd.map(a => [a.name, a.n, a.channel])).toEqual([["Ad A", 2, "whatsapp"], ["Messenger · no ad", 1, "messenger"], ["WhatsApp · no ad", 1, "whatsapp"]]);
    const A = r.byAd[0];
    expect(A.st).toEqual({ Attention: 1, "Follow up": 1 });
    expect([A.wa, A.ms, A.need]).toEqual([2, 0, 1]);
    expect(A.people.find(p => p.id === "p1")!.need).toBe(1);
  });
  it("columns: the six, then the extras in the picker's order; Channel is two counts", () => {
    expect(reportColumns([]).map(c => c[1])).toEqual(["Leads", "Avg reply", "Appts", "Show-up", "Won", "Lost"]);
    expect(reportColumns(["channel", "st:New", "wonRate"]).slice(6).map(c => c[1])).toEqual(["Won rate", "New", "WhatsApp", "Messenger"]);
    expect(readReportCols(["st:Cold leads", "junk", 3])).toEqual(["st:Cold leads"]);
    expect(readReportCols(undefined)).toEqual([]);
    expect(colValue(r.byAd[0], "st:Attention", null)).toBe(1);
    expect(colValue(r.byAd[0], "st:New", null)).toBe(0);
    expect(colValue(r.byAd[0], "perLead", 100)).toBe(50);
  });
  it("sorts by any column, high to low, then by name", () => {
    const rows = [{ name: "b", v: () => 2 }, { name: "a", v: () => 2 }, { name: "c", v: () => null }, { name: "d", v: () => 5 }];
    expect(sortByCol(rows, "leads", "desc").map(x => x.name)).toEqual(["d", "a", "b", "c"]);
    expect(sortByCol(rows, "leads", "asc").map(x => x.name)).toEqual(["a", "b", "d", "c"]);
  });
  it("the period is Today · This week · This month · Custom", () => {
    expect(RP_PERIODS.map(p => p[1])).toEqual(["Today", "This week", "This month", "Custom"]);
    const [a, b] = periodRange("today", now);
    expect(b - a).toBe(86_400_000 - 1);
  });
});

function ctxOf(ui: Partial<DeskUi> = {}) {
  const data = crmDemoData();
  const patch = vi.fn(), set = vi.fn(), saveUiPref = vi.fn();
  const me = data.people.find(p => p.role === "boss") ?? data.people[0];
  const ctx = { data, me, now: new Date(), live: false, ui: { ...initialDeskUi(), tab: "reports", ...ui }, set, patch, teams: teamsOf(data), directors: data.people.filter(p => p.role === "hod"),
    deskAct: { saveUiPref }, act: {}, nameOf: (id: string | null | undefined) => data.people.find(p => p.id === id)?.name ?? "", W: 1440, H: 900, slotCounts: {} } as unknown as DeskCtx;
  return { ctx, patch, saveUiPref, data };
}

describe("Reports (D6a)", () => {
  it("has three tabs; Lead sources & status is gone", () => {
    expect(RP_CATS.map(c => c[1])).toEqual(["Overview", "Ads performance", "Appointments & show-ups"]);
    expect(reportsVM(ctxOf({ rpCat: "src" }).ctx).reports.cat).toBe("overview");
  });
  it("Columns: off by default, a tick is saved for this user on the server", () => {
    const { ctx, saveUiPref } = ctxOf({ rpPer: "custom", rpRange: { a: 0, b: Date.now() } });
    const o = reportsVM(ctx).reports.overview;
    expect(o.heads.map(h => h.label)).toEqual(["Leads", "Avg reply", "Appts", "Show-up", "Won", "Lost"]);
    expect(o.heads[0]).toMatchObject({ on: true, arrow: " ↓" });
    o.picker.find(p => p.k === "st:Follow up")!.toggle();
    expect(saveUiPref).toHaveBeenCalledWith("reportCols", ["st:Follow up"]);
  });
  it("a remembered column shows on ad rows and people rows", () => {
    const { ctx, data } = ctxOf({ rpPer: "custom", rpRange: { a: 0, b: Date.now() } });
    data.uiPrefs = { reportCols: ["channel"] };
    const o = reportsVM(ctx).reports.overview;
    expect(o.heads.slice(-2).map(h => h.label)).toEqual(["WhatsApp", "Messenger"]);
    expect(o.ads.every(a => a.cells.length === 8 && a.people.every(p => p.cells.length === 8))).toBe(true);
  });
  it("a person opens their leads, needs-a-reply first; a customer opens their log", () => {
    const base = ctxOf({ rpPer: "custom", rpRange: { a: 0, b: Date.now() } });
    const ad = reportsVM(base.ctx).reports.overview.ads.find(a => a.people.some(p => p.pick))!;
    const person = ad.people.find(p => p.pick)!;
    person.pick!();
    const pick = base.patch.mock.calls.at(-1)![0] as Partial<DeskUi>;
    expect(pick).toMatchObject({ rpPickAd: ad.key, rpLead: null });
    const { ctx } = ctxOf({ rpPer: "custom", rpRange: { a: 0, b: Date.now() }, ...pick });
    const panel = reportsVM(ctx).reports.overview.panel!;
    expect(panel.name).toBe(person.name);
    const hot = panel.customers.map(c => c.tone === "oxblood");
    expect(hot.indexOf(false) === -1 || hot.lastIndexOf(true) < hot.indexOf(false)).toBe(true);
    const first = panel.customers[0];
    const withLead = reportsVM(ctxOf({ rpPer: "custom", rpRange: { a: 0, b: Date.now() }, ...pick, rpLead: first.id }).ctx).reports.overview.panel!;
    expect(withLead.lead?.name).toBe(first.name);
    expect(withLead.lead?.lines.length).toBeGreaterThan(0);
    expect(withLead.lead?.facts.map(f => f.k)).toEqual(["Got", "First reply", "Now with"]);
  });
  it("Custom opens the calendar with All time from the first lead; applying it sets the dates", () => {
    const { ctx, patch } = ctxOf({ rpDates: true });
    const r = reportsVM(ctx).reports;
    expect(r.picker).not.toBeNull();
    expect(r.picker!.allFrom).toBeLessThanOrEqual(Date.now());
    r.picker!.apply({ a: 1, b: 2 });
    expect(patch).toHaveBeenCalledWith({ rpPer: "custom", rpRange: { a: 1, b: 2 }, rpDates: false });
  });
});
