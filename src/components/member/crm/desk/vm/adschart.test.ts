import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { chartFmt, dailySeries, daysOf, scaled } from "./adschart";

// Ads Performance's chart (2026-10-23): each metric day by day, the CRM's and Meta's.
const c = (id: string, createdAt: string, status = "new") => ({ id, createdAt, status }) as unknown as CrmCustomer;
const v = (customerId: string, state: string) => ({ customerId, state }) as unknown as CrmVisit;
const days = daysOf(new Date(2026, 9, 20).getTime(), new Date(2026, 9, 22).getTime());

describe("the chart's day-by-day figures", () => {
  it("lists every day of the range", () => {
    expect(days).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("counts the CRM's leads on the day they came, with their visits and wins, and Meta's sums with cost per lead", () => {
    const cs = [c("a", new Date(2026, 9, 20, 10).toISOString()), c("b", new Date(2026, 9, 20, 15).toISOString(), "won"), c("d", new Date(2026, 9, 22, 9).toISOString())];
    const visits = [v("a", "attended"), v("b", "cancelled"), v("d", "booked")];
    const meta = [{ "2026-10-20": { spend: 20, impr: 100, reach: 50, clicks: 5, allClicks: 7, msgconv: 2 } }, { "2026-10-20": { spend: 10, impr: 100, reach: 50, clicks: 5, allClicks: 7, msgconv: 1 }, "2026-10-22": { spend: 9, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 } }, null];
    const s = dailySeries(["leads", "appt", "showup", "won", "spend", "cpl", "ctr"], days, cs, visits, meta);
    expect(s.leads).toEqual([2, 0, 1]);
    expect(s.appt).toEqual([1, 0, 1]);
    expect(s.showup).toEqual([1, 0, 0]);
    expect(s.won).toEqual([1, 0, 0]);
    expect(s.spend).toEqual([30, 0, 9]);
    expect(s.cpl).toEqual([15, null, 9]);
    expect(s.ctr).toEqual([5, null, null]);
  });
  it("leaves Meta's metrics empty until an ad has been read", () => {
    expect(dailySeries(["spend", "leads"], days, [], [], [undefined, null]).spend).toEqual([null, null, null]);
  });
  it("draws each line against its own highest day", () => {
    expect(scaled([2, null, 4, 0])).toEqual([0.5, null, 1, 0]);
    expect(scaled([0, 0])).toEqual([0, 0]);
    expect(chartFmt(545.4, "rm")).toBe("RM 545.40");
    expect(chartFmt(null, "n")).toBe("—");
  });
});
