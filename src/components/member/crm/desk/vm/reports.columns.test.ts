// 2026-11-11 (the owner, Reports › Overview's Columns: "加广告的 start date、end date、status … 其他有用的 Meta / CRM 数据"):
// the ad's Status, Start and End, Meta's figures for the period, and the CRM's rates, cost per appointment, won amount and ROAS.
import { describe, expect, it, vi } from "vitest";
import type { CrmCustomer, CrmData } from "@/lib/member/crm-data";
import { initialDeskUi, type DeskCtx, type DeskUi } from "./ctx";
import { colValue, overviewReport, pickGroup, readReportCols, reportColumns, RP_PICKS } from "./reports";
import { reportsVM } from "./reports-page";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import { teamsOf } from "../../panel/vm/common";

const now = new Date("2026-11-11T12:00:00+08:00");
const AD = "120210000000001";
const C = (id: string, extra: Partial<CrmCustomer> = {}) => ({ id, name: id, phone: "", channel: "whatsapp", adId: AD, ad: "Skyline", assignedTo: "p1", teamId: null,
  createdAt: "2026-11-05T02:00:00Z", status: "follow_up", wonAmount: null, messages: [], details: {}, unread: 0, lastCustomerAt: null, ...extra }) as unknown as CrmCustomer;
const customers = [C("a", { status: "won", wonAmount: 12000 }), C("b"), C("c", { status: "won", wonAmount: 3000 }), C("d")];
const visits = [{ id: "v1", customerId: "a", state: "attended", start: "2026-11-07T02:00:00Z" }, { id: "v2", customerId: "b", state: "booked", start: "2026-11-15T02:00:00Z" }];

function vm(picks: string[], ui: Partial<DeskUi> = {}) {
  const demo = crmDemoData();
  const data = { ...demo, customers, visits,
    adNames: { [AD]: { name: "Skyline", source: "meta", status: "ACTIVE", statusAt: "2026-11-11T03:00:00Z", startAt: "2026-10-20T01:00:00Z", endAt: "2026-11-30T15:59:00Z" } },
    uiPrefs: { reportCols: picks } } as unknown as CrmData;
  const me = data.people.find(p => p.role === "boss") ?? data.people[0];
  const ctx = { data, me, now, live: true, ui: { ...initialDeskUi(), tab: "reports", rpPer: "custom", rpRange: { a: new Date("2026-11-01T00:00:00+08:00").getTime(), b: now.getTime() }, ...ui },
    set: vi.fn(), patch: vi.fn(), deskAct: { saveUiPref: vi.fn() }, act: {}, nameOf: () => "Chin Ying", teams: teamsOf(data), directors: [], W: 1440, H: 900, slotCounts: {} } as unknown as DeskCtx;
  return reportsVM(ctx);
}
const cellsOf = (v: ReturnType<typeof vm>) => Object.fromEntries(v.reports.overview.ads[0].cells.map(c => [c.k, c.text]));

describe("Overview's new columns", () => {
  it("the picker lists the ad's Status, Start date and End date first, Meta's under their own head, and remembers them", () => {
    expect(RP_PICKS.filter(p => pickGroup(p[0]) === "Ad").map(p => p[1])).toEqual(["Status", "Start date", "End date"]);
    expect(RP_PICKS.filter(p => pickGroup(p[0]) === "Meta Ads").map(p => p[1])).toEqual(["Impressions", "Reach", "Link clicks", "CTR (link)", "CPC (link)", "CPM", "Conversations started", "Cost per conversation"]);
    expect(readReportCols(["start", "roas", "junk"])).toEqual(["start", "roas"]);
    expect(reportColumns(["end", "status"]).slice(6).map(c => c[1])).toEqual(["Status", "End"]);
  });

  it("an ad's status and run from crm_ad_names; Meta's figures once read; the CRM's won amount and ROAS", () => {
    const v = vm(["status", "start", "end", "spend", "impr", "ctr", "cpm", "apptRate", "cpappt", "wonAmt", "roas"], {
      apMeta: { "2026-11-01|2026-11-11": { [AD]: { spend: 500, impr: 20000, reach: 9000, clicks: 400, allClicks: 600, msgconv: 40 } } } } as Partial<DeskUi>);
    expect(cellsOf(v)).toMatchObject({ status: "Running", start: "20 Oct 26", end: "30 Nov 26", spend: "RM 500", impr: "20,000", ctr: "2.00%", cpm: "RM 25.00",
      apptRate: "50%", cpappt: "RM 250.00", wonAmt: "RM 15,000", roas: "30.00×" });
    // A person's row has no ad of its own: Meta's and the ad's read "—", the CRM's are theirs.
    const p = Object.fromEntries(v.reports.overview.ads[0].people[0].cells.map(c => [c.k, c.text]));
    expect(p).toMatchObject({ status: "—", start: "—", impr: "—", roas: "—", wonAmt: "RM 15,000" });
    expect(v.rpNeed).toEqual([]);
  });

  it("asks Meta for the period when a Meta column is picked and not read yet; not otherwise", () => {
    expect(vm(["impr"]).rpNeed).toEqual([{ key: "2026-11-01|2026-11-11", since: "2026-11-01", until: "2026-11-11", ids: [AD] }]);
    expect(vm(["status", "wonAmt"]).rpNeed).toEqual([]);
    expect(cellsOf(vm(["impr"])).impr).toBe("—");
  });

  it("a paused ad reads Paused; Running sorts above it", () => {
    const r = overviewReport(customers, [0, now.getTime()], c => c.ad, () => "x", () => "Follow up", [], "all", now).byAd[0];
    expect(colValue(r, "status", { meta: {}, status: "Running" })).toBe(1);
    expect(colValue(r, "status", { meta: {}, status: "Paused" })).toBe(0);
    expect(colValue(r, "roas", { meta: { spend: 1000 } })).toBe(15);
    expect(colValue(r, "wonAmt", null)).toBe(15000);
  });
});
