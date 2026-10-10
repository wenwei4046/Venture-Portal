import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AdminMemberData } from "@/lib/member/server";

vi.mock("@/app/(member)/member/actions", () => ({ adminMemberAction: vi.fn() }));

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

// The member app's admin preview (/member/preview) keeps MemberAdmin in the
// app's own look; People › Member services in the portal is its own page since
// the HR revamp (2026-10-10, member-admin/_components/MemberServicesView).
describe("MemberAdmin · the member app's admin preview", () => {
  it("keeps the member app's own head and pill", () => {
    render(<MemberAdmin initialData={data} demo />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByText("REVENUE · PEOPLE OPERATIONS")).toBeInTheDocument();
    expect(screen.getByText("Rejected").closest(".chip")).toBeNull();
  });

  it("has no Brand weeks or Claim rates — live data, the portal's", () => {
    render(<MemberAdmin initialData={data} demo />);
    expect(screen.queryByRole("button", { name: "Brand weeks" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Claim rates" })).toBeNull();
  });
});
