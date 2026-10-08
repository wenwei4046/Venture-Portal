import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminMemberData } from "@/lib/member/server";
import { adminMemberAction } from "@/app/(member)/member/actions";

vi.mock("@/app/(member)/member/actions", () => ({ adminMemberAction: vi.fn() }));
// The Brand weeks tab reads the live grid; it never answers in these tests.
vi.mock("@/app/(portal)/member-admin/brand-weeks-actions", () => ({
  fetchBrandWeeksAdmin: vi.fn(() => new Promise(() => {})),
  saveBrandWeeksAdmin: vi.fn(),
}));

import MemberAdmin from "./MemberAdmin";

const data: AdminMemberData = {
  canManageRequests: true,
  canPublishMemos: true,
  canConfigureProducts: true,
  requests: [
    {
      id: "REQ-0000000000001",
      kind: "replacement",
      title: "Replace a Fair member",
      status: "rejected",
      createdAt: "2026-09-20T00:00:00Z",
      detail: {},
    },
  ],
  departments: [],
  memos: [],
  products: [],
  candidates: [],
  titles: [],
  uplines: [],
  events: [],
};

// People › Member services renders MemberAdmin on the portal's white sheet
// (2026-09-27); the member app's preview renders the same component in its
// own look. The `portal` switch is what tells them apart.
describe("MemberAdmin", () => {
  it("keeps the member app's own head and pill in the preview", () => {
    render(<MemberAdmin initialData={data} demo />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("REVENUE · PEOPLE OPERATIONS")).toBeInTheDocument();
    expect(screen.getByText("Rejected").closest(".chip")).toBeNull();
  });

  it("wears the portal's page head and a status chip on the sheet", () => {
    const { container } = render(<MemberAdmin initialData={data} portal />);
    // The portal already has its <main>; the page must not add a second.
    expect(screen.queryByRole("main")).toBeNull();
    expect(container.querySelector(".page-head .page-title")).toHaveTextContent("Member services");
    expect(screen.queryByText("REVENUE · PEOPLE OPERATIONS")).toBeNull();
    expect(screen.getByRole("link", { name: "Member workspace →" })).toHaveAttribute("href", "/member");
    // A refused request is a word on the danger wash, not the amber pill.
    expect(screen.getByText("Rejected").closest(".chip")).toHaveClass("danger");
  });

  // The back office of My brand weeks (2026-10-03): whoever reviews member
  // requests sets any member's week there, closed ones too. Live data only —
  // never in the member app's admin preview.
  it("offers Brand weeks on the portal to whoever reviews member requests", () => {
    render(<MemberAdmin initialData={{ ...data, departments: [{ id: "71709f7e-9f7c-4e28-80cf-ce21be336995", name: "Fair", occupied: 25, reserved: 0, capacity: null }] }} portal />);
    fireEvent.click(screen.getByRole("button", { name: "Brand weeks" }));
    expect(screen.getByRole("heading", { name: /^Brand weeks · / })).toBeInTheDocument();
    expect(screen.getByText("Loading brand weeks…")).toBeInTheDocument();
  });

  it("keeps Brand weeks out of the preview and away from a memo-only account", () => {
    render(<MemberAdmin initialData={data} demo />);
    expect(screen.queryByRole("button", { name: "Brand weeks" })).toBeNull();
    cleanup();
    render(<MemberAdmin initialData={{ ...data, canManageRequests: false }} portal />);
    expect(screen.queryByRole("button", { name: "Brand weeks" })).toBeNull();
  });
});

// A member's claim is decided ONCE, here (2026-10-08): approved into their
// payroll or as a payment request to Finance — no second approval on Claims.
describe("MemberAdmin · a member's claim", () => {
  const claim = {
    id: "REQ-0000000000002",
    kind: "claim" as const,
    title: "Airbnb claim",
    status: "submitted",
    createdAt: "2026-09-20T00:00:00Z",
    detail: { claimType: "airbnb", amount: 220 },
    claimId: "CLAIM-1",
  };
  const withClaim = (overrides: Partial<typeof claim> & { payout?: unknown } = {}): AdminMemberData => ({
    ...data,
    requests: [{ ...claim, ...overrides } as AdminMemberData["requests"][number]],
  });

  it("offers the two ways to approve, and never sends HR to the Claims page", () => {
    render(<MemberAdmin initialData={withClaim()} portal />);
    fireEvent.click(screen.getByRole("button", { name: /Airbnb claim/ }));
    expect(screen.getByRole("heading", { name: "Decide the claim" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve · add to payroll" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Approve · request payment" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Open claim review" })).toBeNull();
    // Returning or rejecting still says why.
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request more information" })).toBeDisabled();
  });

  it("approves into the payroll without asking for a note", async () => {
    vi.mocked(adminMemberAction)
      .mockResolvedValueOnce({ ok: true, data: {} })
      .mockResolvedValueOnce({
        ok: true,
        data: withClaim({ status: "approved", payout: { route: "payroll", payrollMonth: "2026-09-01", voucherNo: null, voucherStatus: null } }),
      });
    render(<MemberAdmin initialData={withClaim()} portal />);
    fireEvent.click(screen.getByRole("button", { name: /Airbnb claim/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve · add to payroll" }));
    await waitFor(() =>
      expect(adminMemberAction).toHaveBeenCalledWith({ action: "approve", route: "payroll", requestId: claim.id, note: "" }),
    );
    expect(await screen.findByText("Added to the Sep 2026 payroll as a special claim")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Decide the claim" })).toBeNull();
  });

  it("says a payment request is waiting for Finance", () => {
    render(<MemberAdmin initialData={withClaim({ status: "approved", payout: { route: "payment", payrollMonth: null, voucherNo: null, voucherStatus: null } })} portal />);
    fireEvent.click(screen.getByRole("button", { name: /Airbnb claim/ }));
    expect(screen.getByText("Payment requested — waiting for Finance")).toBeInTheDocument();
  });
});
