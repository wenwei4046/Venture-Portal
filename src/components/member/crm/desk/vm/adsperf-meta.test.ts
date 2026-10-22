import { describe, expect, it } from "vitest";
import { metaFigures } from "./adsperf";

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
