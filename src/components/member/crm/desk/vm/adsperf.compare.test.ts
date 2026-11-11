/**
 * The owner, 2026-11-11: on Insight › Ads performance, Custom 1–11 Nov, the chip "vs 21 Oct – 31 Oct ×" only offered
 * Stop comparing. Its dates now open the date picker, Apply compares with the days picked (and Meta's figures are asked
 * for them), × still stops comparing.
 */
import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import type { DeskCtx, DeskUi } from "./ctx";
import { initialDeskUi } from "./ctx";
import { adsPerfVM } from "./adsperf";

const data = {
  customers: [{ id: "a", name: "a", phone: "", channel: "whatsapp", accountId: "x", adId: "120210000000001", ad: "Skyline", status: "new", assignedTo: null, teamId: null,
    createdAt: new Date(2026, 10, 3).toISOString(), lastCustomerAt: null, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, messages: [] }],
  adNames: { "120210000000001": { name: "Skyline", added: true, pageId: "p" } },
  visits: [], events: [], adRules: [], can: { viewAll: true, manage: true, editAll: true },
} as unknown as CrmData;

function vm(over: Partial<DeskUi>) {
  let ui: DeskUi = { ...initialDeskUi(), stage: "op", tab: "insight", insTab: "ads", insPer: "custom", insRange: { a: new Date(2026, 10, 1).getTime(), b: new Date(2026, 10, 11).getTime() }, apCmp: true, apStF: "all", ...over };
  const patch = (p: Partial<DeskUi>) => { ui = { ...ui, ...p }; };
  const run = () => adsPerfVM({ ui, data, now: new Date(2026, 10, 11, 12), nameOf: (x: string) => x, act: {}, deskAct: {}, set: () => {}, patch } as unknown as DeskCtx);
  return { run, ui: () => ui };
}

describe("Insight's compare chip picks its dates", () => {
  it("reads the period before, and its dates open the picker on that range", () => {
    const s = vm({});
    const c = s.run().insCmp!;
    expect(c.label).toBe("vs 21 Oct – 31 Oct");
    expect(c.pick).toBeNull();
    c.open!();
    const p = s.run().insCmp!.pick!;
    expect(p.value).toEqual({ a: new Date(2026, 9, 21).getTime(), b: new Date(2026, 9, 31).getTime() });
  });

  it("Apply compares with the days picked, and asks Meta for them", () => {
    const s = vm({});
    s.run().insCmp!.open!();
    s.run().insCmp!.pick!.apply({ a: new Date(2026, 9, 1).getTime(), b: new Date(2026, 9, 11).getTime() });
    expect(s.ui()).toMatchObject({ apCmp: true, apCmpMode: "custom", apCF: "2026-10-01", apCT: "2026-10-11", insCmpPick: false });
    const v = s.run();
    expect(v.insCmp!.label).toBe("vs 1 Oct – 11 Oct");
    expect(v.apNeed.map((n: { since: string; until: string }) => `${n.since}|${n.until}`)).toContain("2026-10-01|2026-10-11");
  });

  it("× stops comparing and forgets the dates picked; Cancel only closes the picker", () => {
    const s = vm({ apCmpMode: "custom", apCF: "2026-10-01", apCT: "2026-10-11", insCmpPick: true });
    s.run().insCmp!.pick!.cancel();
    expect(s.ui()).toMatchObject({ apCmp: true, apCmpMode: "custom", insCmpPick: false });
    s.run().insCmp!.toggle();
    expect(s.ui()).toMatchObject({ apCmp: false, apCmpMode: 0 });
    s.run().insCmp!.toggle();
    expect(s.run().insCmp!.label).toBe("vs 21 Oct – 31 Oct");
  });
});
