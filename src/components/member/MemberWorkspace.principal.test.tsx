import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData } from "@/lib/member/types";
import MemberWorkspace from "./MemberWorkspace";

const mocks = vi.hoisted(() => ({ acknowledge: vi.fn(), submit: vi.fn(), view: vi.fn() }));
vi.mock("@/components/layout/view-as-actions", () => ({ setViewAs: mocks.view }));
vi.mock("@/app/(member)/member/actions", () => ({
  acknowledgeMemberMemo: mocks.acknowledge, submitMemberRequest: mocks.submit,
  refreshMemberData: vi.fn(), calculateMemberQuote: vi.fn(),
}));

function data(): MemberData {
  const value = memberDemo();
  return { ...value, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: value.memberships.map(member => ({ ...member, title: "Principal", rank: "All members", rate: 0, people: member.name === "Fair" ? [
      { id: "lead", name: "Team Lead", title: "Lead", rank: "Gold", parentId: null, self: false },
      { id: "staff", name: "Sales Member", title: "Sales", rank: "Silver", parentId: "lead", self: false },
    ] : [] })),
    memos: [{ id: "memo", title: "Team update", body: "A memo for staff.", sender: "HR", publishedAt: "2026-09-12", effectiveAt: "2026-09-12", version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments: ["Fair"] }],
    requests: [{ id: "request", kind: "claim", title: "Member accommodation", status: "needs_info", createdAt: "2026-09-12", detail: { subDepartmentId: "fair", amount: 100 } }],
  };
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({}, "", "/member?page=today&department=fair");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("Principal Revenue workspace", () => {
  it("opens a real team overview without an employee profile or fabricated salary", () => {
    render(<MemberWorkspace initialData={data()} />);
    expect(screen.getByRole("heading", { name: "Revenue overview" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "View portal as role" })).toHaveValue("revenue_member");
    expect(screen.getByRole("option", { name: "Principal", exact: true })).toBeInTheDocument();
    expect(screen.queryByText("No member profile linked")).not.toBeInTheDocument();
    expect(screen.queryByText("Fixed salary", { exact: true })).not.toBeInTheDocument();
  });

  it("opens Fair quotation and changes to the empty IR workspace", async () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build an offer →" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Build your offer" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Revenue department" }), { target: { value: "ir" } });
    expect(screen.getByRole("heading", { name: "Revenue overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "IR workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quote", exact: true })).not.toBeInTheDocument();
  });

  it("renders the full hierarchy with no self member and supports search", () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole("button", { name: "Team", exact: true }));
    expect(screen.getByRole("heading", { name: "Team Lead" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales Member" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search members by name" }), { target: { value: "Sales Member" } });
    expect(screen.queryByRole("heading", { name: "Team Lead" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales Member" })).toBeInTheDocument();
  });

  it("reads staff memos without acknowledging or submitting as a member", () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(screen.getByRole("button", { name: /Team update/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("A memo for staff.");
    expect(screen.queryByRole("button", { name: "I have read and acknowledge" })).not.toBeInTheDocument();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("routes staff request management through Principal services, never a resubmission", () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole("button", { name: "Requests", exact: true }));
    expect(screen.queryByRole("button", { name: "Submit Claim" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Member accommodation/ }));
    expect(screen.queryByRole("button", { name: "Update details and resubmit" })).not.toBeInTheDocument();
    const manage = screen.getByRole("button", { name: /Review in Member Services/ }).closest("form")!;
    expect(new FormData(manage).get("role")).toBe("principal");
    expect(new FormData(manage).get("destination")).toBe("/member-admin");
  });

  it("keeps the Principal switcher available when Revenue has no active scheme", () => {
    const value = data(); value.memberships = []; value.configured = false;
    render(<MemberWorkspace initialData={value} />);
    expect(screen.getByRole("heading", { name: "Revenue setup" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "View portal as role" })).toBeInTheDocument();
    expect(screen.queryByText("No member profile linked")).not.toBeInTheDocument();
  });
});
