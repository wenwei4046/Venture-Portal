/**
 * The owner, 2026-11-27: "手机版也可以吗？" — on the phone's Ads Performance an ad, opened, offers its leads and its
 * appointments of the period, each opening the panel's list sheet with exactly the customers its figure counts.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";

vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchAdDaily: vi.fn(async () => ({ ok: false })) }));
vi.mock("./ad-figures-read", () => ({ readAdFigures: vi.fn(async () => {}) }));

import { Phone4aAdsPerf, adLists } from "./phone-ads-perf";

const AD = "120210000000001";
const cust = (id: string, day: number): CrmCustomer => ({ id, name: id, phone: "", channel: "whatsapp", accountId: "x", adId: AD, ad: "Skyline", status: "new", assignedTo: null, teamId: null,
  createdAt: new Date(2026, 10, day, 10).toISOString(), lastCustomerAt: null, unread: 0, details: {}, messages: [] } as unknown as CrmCustomer);
const visit = (customerId: string, state: string) => ({ id: `v-${customerId}`, customerId, state, start: new Date(2026, 10, 20, 14).toISOString(), showroomId: "kl" }) as unknown as CrmVisit;
const customers = [cust("amy", 3), cust("ben", 9), cust("cat", 10), cust("old", 1)];
const visits = [visit("amy", "booked"), visit("ben", "cancelled"), visit("cat", "attended")];
const range = { a: new Date(2026, 10, 2).getTime(), b: new Date(2026, 10, 11).getTime() };

describe("an ad's lists on the phone", () => {
  it("adLists: the range's leads newest first, and those who booked (a cancelled visit not counted)", () => {
    expect(adLists(customers, visits, range)).toEqual({ leads: ["cat", "ben", "amy"], appts: ["cat", "amy"] });
  });

  it("an opened ad offers its leads and appointments, each to the list sheet", () => {
    const openList = vi.fn();
    render(<Phone4aAdsPerf p={{ customers, visits, adNames: { [AD]: { name: "Skyline", pageId: "p", status: "Running" } } as never, now: new Date(2026, 10, 11, 12), live: false, manage: false,
      range, cmp: null, chips: [{ label: "This month", on: true, pick: () => {} }], custom: false, openDates: () => {}, openCompare: () => {}, clearCompare: () => {}, openList }} />);
    fireEvent.click(screen.getByText("Skyline"));
    fireEvent.click(screen.getByRole("button", { name: "3 leads" }));
    expect(openList).toHaveBeenLastCalledWith("Leads · Skyline · This month", ["cat", "ben", "amy"]);
    fireEvent.click(screen.getByRole("button", { name: "2 appts" }));
    expect(openList).toHaveBeenLastCalledWith("Appointments · Skyline · This month", ["cat", "amy"]);
  });
});
