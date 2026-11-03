import { describe, expect, it } from "vitest";
import { showRateOnce, showUpOnce, type CrmVisit } from "./crm-data";

// The owner, 2026-10-27: "appt rate, show up rate 一个客户只记录一次" — booked twice, or came twice, is one customer.
const now = new Date("2026-10-27T12:00:00+08:00");
const v = (customerId: string, state: CrmVisit["state"], start = "2026-10-20T10:00:00+08:00") => ({ customerId, state, start }) as CrmVisit;

describe("show-up counts a customer once", () => {
  it("two visits that came are one customer who came", () => {
    const o = showUpOnce([v("a", "attended"), v("a", "attended"), v("b", "no_show")], now);
    expect([o.due.size, o.came.size, o.noshow.size]).toEqual([2, 1, 1]);
    expect(showRateOnce([v("a", "attended"), v("a", "attended"), v("b", "no_show")], now)).toBe("50%");
  });
  it("a No show then a visit that came is a customer who came", () => {
    const o = showUpOnce([v("a", "no_show"), v("a", "attended", "2026-10-22T10:00:00+08:00")], now);
    expect([o.came.size, o.noshow.size]).toEqual([1, 0]);
  });
  it("a visit still to come is not due", () => {
    expect(showUpOnce([v("a", "booked", "2026-10-30T10:00:00+08:00")], now).due.size).toBe(0);
    expect(showRateOnce([v("a", "booked", "2026-10-20T10:00:00+08:00")], now, true)).toBe("0%");
  });
});
