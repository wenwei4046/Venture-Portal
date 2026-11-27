/**
 * The owner, 2026-11-27: "crm 的 ads performance 不是能够点击后看到所有的 leads 名单吗？" — an ad's row on Ads Performance
 * opens that ad's leads of the range (the Leads cell's customers) in Insight's list pane, each to Customer info.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { adsPerfVM, leadIds } from "./adsperf";
import { clistVM } from "./insight";

const AD = "120210000000001", OTHER = "120210000000002";
const cust = (id: string, o: Record<string, unknown>) => ({ id, name: id, phone: `6012345${id.length}${id.charCodeAt(0)}`, channel: "whatsapp", accountId: "x", adId: AD, ad: "Skyline", status: "new",
  assignedTo: null, teamId: null, createdAt: new Date(2026, 10, 3, 10).toISOString(), lastCustomerAt: null, unread: 0,
  details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [], ...o });
const data = {
  uiPrefs: {},
  customers: [
    cust("amy", {}),
    cust("ben", { createdAt: new Date(2026, 10, 9, 10).toISOString() }),
    cust("old", { createdAt: new Date(2026, 9, 20, 10).toISOString() }), // October: not in the range
    cust("cat", { adId: OTHER, ad: "Harbour" }),
  ],
  adNames: { [AD]: { name: "Skyline", pageId: "p" }, [OTHER]: { name: "Harbour", pageId: "p" } },
  visits: [], events: [], adRules: [], can: { viewAll: true, manage: true, editAll: true },
} as unknown as CrmData;

function ctxOf(over: Partial<DeskUi>, patches: Partial<DeskUi>[] = []) {
  const ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "insight", insTab: "ads", insPer: "custom", insRange: { a: new Date(2026, 10, 1).getTime(), b: new Date(2026, 10, 11).getTime() },
    apStF: "all", apMeta: {}, ...over };
  return { ui, data, now: new Date(2026, 10, 11, 12), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch: (p: Partial<DeskUi>) => patches.push(p) } as unknown as DeskCtx;
}

describe("an ad's row opens its leads", () => {
  it("leadIds is the range's leads, newest first", () => {
    const a = new Date(2026, 10, 1).getTime(), b = new Date(2026, 10, 11).getTime();
    expect(leadIds(data.customers.filter(c => c.adId === AD), a, b)).toEqual(["ben", "amy"]);
  });

  it("the row opens the list pane on that ad's leads of the range, as many as its Leads cell", () => {
    const patches: Partial<DeskUi>[] = [];
    const vm = adsPerfVM(ctxOf({}, patches));
    const row = vm.ap4.rows.find(r => r.name === "Skyline")!;
    row.open();
    expect(patches[0]).toMatchObject({ pane: "overlay", kind: "clist", clist: "Leads · Skyline", clistIds: ["ben", "amy"], infoId: null });
    expect(patches[0].clistSub).toMatch(/Nov/);
  });

  it("the list shows exactly those customers, under the ad's name and range", () => {
    const vm = clistVM(ctxOf({ kind: "clist", pane: "overlay", clist: "Leads · Skyline", clistIds: ["ben", "amy"], clistSub: "1 Nov – 11 Nov" }));
    expect(vm.clistRows.map(r => r.name).sort()).toEqual(["amy", "ben"]);
    expect(vm.clistN).toBe("2 customers");
    expect(vm.clistHead).toEqual({ title: "Leads · Skyline", sub: "1 Nov – 11 Nov · tap a customer for their info" });
  });

  it("a customer opened from it comes back to the ad's leads", () => {
    const patches: Partial<DeskUi>[] = [];
    const vm = clistVM(ctxOf({ kind: "info", pane: "overlay", infoId: "amy", clist: "Leads · Skyline", clistIds: ["ben", "amy"] }, patches));
    expect(vm.infoBackLabel).toBe("Back to the ad's leads");
    vm.backToList();
    expect(patches[0]).toMatchObject({ kind: "clist", infoId: null });
  });
});
