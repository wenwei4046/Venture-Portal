import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import { insightMain, type InsightInput } from "./insight-model";
import { Personal } from "./InsightMain";
import { monthPeriod } from "./period";

afterEach(cleanup);

const own = (id: string, revenue: number): MemberBookOrder => ({
  id, number: `2990-SO-2611-${id}`, ref: null, customer: "Helena Kong", date: "2026-11-03", sourceMonth: "2026-11", recognitionMonth: "2026-11",
  brand: "2990S", booth: "2990S", venue: "PENANG WATERFRONT CONVENTION CENTRE", fairStart: "2026-10-29", fairEnd: "2026-12-31", organiser: "MALL MGMT",
  week: "2026-10-30", revenue, margin: null, noSales: false, ownScheme: true, kpiQty: 0, cleared: true, carried: false, manual: false,
  total: revenue, paid: revenue, depositNeeded: 0, lines: [], own: true, share: null,
});
const book = (orders: MemberBookOrder[]): MemberOrderBook => ({
  from: "2026-11", through: "2026-11", asOf: "2026-11-12T00:00:00Z", paysFrom: "2026-11", closedMonths: [], brandWeeks: {}, orders,
  margins: { overall: null, brands: {} },
});
const input = (orders: MemberBookOrder[]): InsightInput => ({
  period: monthPeriod("2026-11", "2026-11"), book: book(orders), me: null, downline: [], target: null,
  kpi: { schemeId: "s", period: "2026-11", asOf: "2026-11-12T00:00:00Z", enabled: false, items: [], total: 0, threshold: null, hit: null },
  bands: [], name: "ETHAN", title: "Revenue Specialist",
});
const actions = { toBills() {}, toKpi() {}, toWaiting() {}, openBrand() {} };
const margins = () => screen.getByRole("heading", { name: "Margin by brand" }).closest("section")!;

// 2026-11-12 — found on production the day 2990s went onto its own scheme: ETHAN's November (six 2990s bills,
// RM 21,200) read "Margin by brand · No sales yet" over "No counted sales yet."
describe("Insight › Margin by brand", () => {
  it("says Own scheme of a month sold on a brand's own scheme — never that nothing was sold", () => {
    render(<Personal vm={insightMain(input([own("017", 3_740), own("020", 3_990)])).personal} actions={actions} />);
    expect(screen.getByText("RM 7,730")).toBeVisible();
    expect(within(margins()).getByText("Own scheme")).toBeVisible();
    expect(screen.queryByText("No sales yet")).toBeNull();
    expect(screen.queryByText("No counted sales yet.")).toBeNull();
  });

  it("still says so of a month with no bill", () => {
    render(<Personal vm={insightMain(input([])).personal} actions={actions} />);
    expect(within(margins()).getByText("No sales yet")).toBeVisible();
    expect(within(margins()).getByText("No counted sales yet.")).toBeVisible();
  });
});
