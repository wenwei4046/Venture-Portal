import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberOrgMap as MapData } from "@/lib/member/types";
import MemberOrgMap from "./MemberOrgMap";

function mapData(self = false): MapData {
  return {
    asOf: "2026-09-16T00:00:00Z",
    departments: ["fair", "ir"].map(id => ({
      id, schemeId: id, name: id.toUpperCase(), code: id.toUpperCase(),
      capacity: null, mine: self, directors: [],
    })),
    people: ["fair", "ir"].map(id => ({
      id: `${id}:staff`, staffId: "staff", departmentId: id, schemeId: id,
      name: "Sales Member", code: "HV100", title: "Sales", parentId: null,
      self, mine: self,
    })),
  };
}

const shared = { busy: false, error: null, search: "", onRefresh: vi.fn(), onDialog: vi.fn() };

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800, height: 500, x: 0, y: 0, top: 0, left: 0, bottom: 500, right: 800,
    toJSON: () => ({}),
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("member map viewing context", () => {
  it("centres the selected membership when the same person belongs to two departments without calling them You", async () => {
    const data = mapData();
    const { rerender } = render(<MemberOrgMap {...shared} map={data} viewedMembershipId="fair:staff" />);
    const canvas = screen.getByRole("application").firstElementChild as HTMLElement;
    await waitFor(() => expect(canvas.style.transform).not.toContain("translate(0px, 0px)"));
    const fairOrigin = canvas.style.transform;
    rerender(<MemberOrgMap {...shared} map={data} viewedMembershipId="ir:staff" />);
    await waitFor(() => expect(canvas.style.transform).not.toBe(fairOrigin));
    const irOrigin = canvas.style.transform;
    fireEvent.click(screen.getByRole("button", { name: "Centre on selected member" }));
    expect(canvas.style.transform).toBe(irOrigin);
    expect(screen.queryByRole("button", { name: "Centre on me" })).not.toBeInTheDocument();
    expect(screen.queryByText("You", { exact: true })).not.toBeInTheDocument();
    expect(data.people.every(person => !person.self)).toBe(true);
  });

  it("omits a dead centre control when neither a caller nor a valid selected membership is present", () => {
    render(<MemberOrgMap {...shared} map={mapData()} viewedMembershipId="missing" />);
    expect(screen.queryByRole("button", { name: /Centre on/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
  });

  it("keeps the caller centre control for an ordinary member", () => {
    render(<MemberOrgMap {...shared} map={mapData(true)} />);
    expect(screen.getByRole("button", { name: "Centre on me" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Centre on selected member" })).not.toBeInTheDocument();
    expect(screen.getAllByText("You", { exact: true })).toHaveLength(2);
  });
});
