import { describe, expect, it } from "vitest";
import { dailyBudget, metaFigures, moveHeld } from "./adsperf";

describe("Ads Performance's Meta figures", () => {
  it("sums the ads read and builds the costs with the CRM's own counts", () => {
    const f = metaFigures([{ spend: 32.96, impr: 664, reach: 616, clicks: 4, allClicks: 23, msgconv: 1 }, { spend: 40.15, impr: 675, reach: 597, clicks: 4, allClicks: 13, msgconv: 1 }, null], { leads: 2, appt: 1, won: 0 });
    expect(f.spend).toBeCloseTo(73.11);
    expect(f.cpl).toBeCloseTo(36.555);
    expect(f.cpappt).toBeCloseTo(73.11);
    expect(f.cpwon).toBeNull();
    expect(f.cpr).toBeCloseTo(36.555);
    expect(f.ctr).toBeCloseTo((8 / 1339) * 100);
  });
  it("is empty when no ad could be read (the screen shows —)", () => {
    expect(metaFigures([null, undefined], { leads: 3 })).toEqual({});
  });
});

describe("Customise metrics › Column order, dragged (2026-10-27: \"拉住无法调整\")", () => {
  it("moves the row held and keeps it there as the pointer passes on", () => {
    // Leads held and dragged down two rows: each dragover reads where the row is now, so it never swaps back.
    let list = ["leads", "appt", "apptrate", "showrate"], held: number | null = 0;
    for (const over of [1, 1, 2, 2]) { const next = moveHeld(list, held, over); if (next) { list = next; held = over; } }
    expect(list).toEqual(["appt", "apptrate", "leads", "showrate"]);
  });
  it("does nothing with no row held or over itself", () => {
    expect(moveHeld(["a", "b"], null, 1)).toBeNull();
    expect(moveHeld(["a", "b"], 1, 1)).toBeNull();
  });
});

describe("Daily budget (2026-10-27)", () => {
  const fig = (budget: { daily: number | null; key: string }) => ({ spend: 0, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0, budget: { lifetime: null, level: "adset" as const, ...budget } });
  it("adds each ad set's budget, a shared campaign budget once", () => {
    expect(dailyBudget([fig({ daily: 70, key: "adset:1" }), fig({ daily: 70, key: "adset:2" })])).toBe(140);
    expect(dailyBudget([fig({ daily: 400, key: "campaign:5" }), fig({ daily: 400, key: "campaign:5" })])).toBe(400);
    expect(dailyBudget([fig({ daily: null, key: "adset:3" }), null])).toBeNull();
  });
  it("is one of the figures the table reads", () => {
    expect(metaFigures([fig({ daily: 70, key: "adset:1" })], {}).dbudget).toBe(70);
  });
});
