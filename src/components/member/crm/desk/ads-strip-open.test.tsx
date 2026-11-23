import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { DeskAdsStrip } from "./Desk4a";
import { apptIds } from "./vm/adsperf";
import type { DeskCtx } from "./vm/ctx";
import type { CrmCustomer } from "@/lib/member/crm-data";

// The owner, 2026-11-23: "点 appt 6 的时候可以显示该客户资料" — Ads performance's Appointments opens its customers.
describe("Ads performance › Appointments", () => {
  it("is the range's leads who booked a visit, each once, a cancelled visit not counted", () => {
    const cs = [
      { id: "a", createdAt: "2026-11-03T02:00:00Z" }, { id: "b", createdAt: "2026-11-05T02:00:00Z" },
      { id: "c", createdAt: "2026-11-06T02:00:00Z" }, { id: "d", createdAt: "2026-10-20T02:00:00Z" },
    ] as unknown as CrmCustomer[];
    const ctx = { data: { visits: [
      { customerId: "a", state: "booked" }, { customerId: "a", state: "attended" },
      { customerId: "b", state: "cancelled" }, { customerId: "d", state: "booked" }, { customerId: "c", state: "no_show" },
    ] } } as unknown as DeskCtx;
    const a = new Date(2026, 10, 1).getTime(), b = new Date(2026, 10, 30).getTime();
    expect(apptIds(cs, ctx, a, b).sort()).toEqual(["a", "c"]);
  });

  it("a figure with open is a button on the strip", () => {
    const open = vi.fn();
    const item = (key: string, extra = {}) => ({ key, label: key, total: "6", color: "#000", remove: null, ...extra });
    const { container } = render(<DeskAdsStrip S={{ items: [item("leads"), item("appt", { open })], canAdd: true, add: () => {}, open: false, toggle: () => {} }} />);
    const appt = container.querySelector('[data-ads-figure="appt"]')!;
    expect(appt.getAttribute("role")).toBe("button");
    expect(container.querySelector('[data-ads-figure="leads"]')!.getAttribute("role")).toBeNull();
    fireEvent.click(appt);
    expect(open).toHaveBeenCalled();
  });
});
