import type { AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberData, MemberOrgMap, MemberOrgPerson } from "@/lib/member/types";
import MemberWorkspace from "./MemberWorkspace";

const mocks = vi.hoisted(() => ({ fetchOrgMap: vi.fn(), fetchInsight: vi.fn() }));
vi.mock("@/components/layout/view-as-actions", () => ({ setViewAs: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/app/(member)/member/actions", () => ({
  fetchMemberOrgMap: mocks.fetchOrgMap,
  fetchMemberInsight: mocks.fetchInsight,
  refreshMemberData: vi.fn(),
  acknowledgeMemberMemo: vi.fn(),
  submitMemberRequest: vi.fn(),
  calculateMemberQuote: vi.fn(),
}));

function node(departmentId: string, staffId: string, name: string, parent: string | null, self = false): MemberOrgPerson {
  return {
    id: `${departmentId}:${staffId}`, staffId, departmentId, schemeId: `${departmentId}-scheme`,
    name, parentId: parent === null ? null : `${departmentId}:${parent}`, self, mine: true,
    code: null, title: self ? "Team Leader" : "Revenue Specialist",
  };
}

function liveMap(): MemberOrgMap {
  return {
    asOf: "2026-09-16T00:00:00Z",
    departments: ["fair", "ir"].map((id) => ({ id, schemeId: `${id}-scheme`, name: id === "fair" ? "Fair" : "IR", code: id.toUpperCase(), capacity: 28, mine: true, directors: [] })),
    people: [
      node("fair", "boss", "Dana Ancestor", null),
      node("fair", "self", "Avery Self", "boss", true),
      node("fair", "child", "Bella Direct", "self"),
      node("fair", "grandchild", "Chris Grandchild", "child"),
      node("fair", "sibling", "Elena Sibling", "boss"),
      node("fair", "cousin", "Finley Cousin", "sibling"),
      node("ir", "boss", "Gale IR Ancestor", null),
      node("ir", "self", "Avery Self", "boss", true),
      node("ir", "own-child", "Harper IR Direct", "self"),
      // Same staff member as the Fair direct report, but this IR membership is a sibling.
      node("ir", "child", "Bella Direct", "boss"),
    ],
  };
}

/** Authenticated response shape: no demo factory, preview route or previewDesign prop. */
function liveData(): MemberData {
  const map = liveMap();
  return {
    demo: false, configured: true, refreshedAt: map.asOf,
    profile: { id: "self", userId: "live-user", name: "Avery Self", email: "member@example.invalid", salary: null },
    memberships: map.departments.map((department) => ({
      id: department.id, schemeId: department.schemeId, name: department.name, code: department.code,
      title: "Team Leader", rank: "Rank A", rate: .03, calculator: department.id === "fair", effective: "2026-09-01",
      capacity: department.capacity, occupied: map.people.filter((person) => person.departmentId === department.id).length,
      people: map.people.filter((person) => person.departmentId === department.id).map((person) => ({
        id: person.id, name: person.name, title: person.title, rank: "Rank A", parentId: person.parentId, self: person.self,
      })),
    })),
    products: [], bands: [], incomes: [], orders: [], requests: [], memos: [],
  };
}

function desktopTeam() {
  const navigation = screen.getByRole("navigation", { name: "Desktop navigation" });
  fireEvent.click(within(navigation).getByRole("button", { name: "My team" }));
  expect(within(navigation).getByRole("button", { name: "My team" })).toHaveAttribute("aria-current", "page");
  expect(window.location.pathname).toBe("/member");
  expect(new URLSearchParams(window.location.search).get("page")).toBe("team");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({}, "", "/member?page=today&department=fair");
  mocks.fetchOrgMap.mockResolvedValue({ ok: true, data: liveMap() });
  mocks.fetchInsight.mockResolvedValue({ ok: false, error: "Insight is outside this team test" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("live member desktop Team navigation", () => {
  it("fetches the full department map while limiting Member list to each self membership's descendants", async () => {
    render(<MemberWorkspace initialData={liveData()} />);
    expect(mocks.fetchOrgMap).not.toHaveBeenCalled();
    desktopTeam();
    const map = await screen.findByRole("application", { name: /Department map/ });
    expect(mocks.fetchOrgMap).toHaveBeenCalledTimes(1);
    for (const name of ["Dana Ancestor", "Elena Sibling", "Finley Cousin", "Gale IR Ancestor", "Harper IR Direct"]) {
      expect(within(map).getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }
    expect(within(map).getAllByRole("button", { name: /Bella Direct/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Member list" }));
    expect(screen.queryByRole("application", { name: /Department map/ })).not.toBeInTheDocument();
    const directory = within(screen.getByRole("button", { name: "Member list" }).closest("section")!);
    expect(directory.getAllByRole("heading", { name: "Avery Self" })).toHaveLength(2);
    for (const name of ["Bella Direct", "Chris Grandchild", "Harper IR Direct"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("heading", { name: "Bella Direct" })).toHaveLength(1);
    for (const name of ["Dana Ancestor", "Elena Sibling", "Finley Cousin", "Gale IR Ancestor"]) {
      expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    }
  });

  it("searches only the own-team list and restores the full map after switching views", async () => {
    render(<MemberWorkspace initialData={liveData()} />);
    desktopTeam();
    await screen.findByRole("application", { name: /Department map/ });
    fireEvent.click(screen.getByRole("button", { name: "Member list" }));
    const search = screen.getByRole("searchbox", { name: "Search your team by name" });
    fireEvent.change(search, { target: { value: "chris" } });
    expect(screen.getByRole("heading", { name: "Chris Grandchild" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bella Direct" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "Finley" } });
    expect(screen.getByRole("heading", { name: "No matching team members" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    const map = screen.getByRole("application", { name: /Department map/ });
    expect(within(map).getByRole("button", { name: /Finley Cousin/ })).toBeInTheDocument();
    expect(within(map).getByRole("button", { name: /Harper IR Direct/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search members by name" })).toHaveValue("Finley");
    expect(mocks.fetchOrgMap).toHaveBeenCalledTimes(1);
  });

  it("keeps the fallback membership tree scoped when the live map request fails", async () => {
    mocks.fetchOrgMap.mockResolvedValue({ ok: false, error: "Map temporarily unavailable" });
    render(<MemberWorkspace initialData={liveData()} />);
    desktopTeam();
    await screen.findByRole("heading", { name: "The team map is unavailable" });
    fireEvent.click(screen.getByRole("button", { name: "Member list" }));
    expect(screen.getByRole("heading", { name: "Chris Grandchild" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finley Cousin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dana Ancestor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Harper IR Direct" })).not.toBeInTheDocument();
  });

  it("does not replace an empty authoritative live map with stale fallback people", async () => {
    mocks.fetchOrgMap.mockResolvedValue({ ok: true, data: { ...liveMap(), people: [] } });
    render(<MemberWorkspace initialData={liveData()} />);
    desktopTeam();
    await waitFor(() => expect(mocks.fetchOrgMap).toHaveBeenCalledTimes(1));
    await screen.findByRole("heading", { name: "No one is placed yet" });
    fireEvent.click(screen.getByRole("button", { name: "Member list" }));
    expect(screen.getByRole("heading", { name: "No matching team members" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bella Direct" })).not.toBeInTheDocument();
  });
});

vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({ fetchMemberKpiSummary: vi.fn().mockResolvedValue({ ok: false, error: "KPI unavailable in this navigation test" }) }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: vi.fn().mockResolvedValue({ ok: false, error: "Arena unavailable in this navigation test" }), saveMemberArenaBrandWeeks: vi.fn() }));
