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
});
