import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberOrgMap } from "@/lib/member/types";
import TeamPage from "./TeamPage";
import { teamVM } from "./profile-model";

afterEach(cleanup);

// Fair as it stands: two directors over ANTHONY, the top of his tree, and two people under him.
const map: MemberOrgMap = {
  asOf: "",
  departments: [{ id: "fair", schemeId: "s", name: "Fair", code: "FAIR", capacity: 27, mine: true, directors: [{ id: "kris", name: "KRIS" }, { id: "peter", name: "PETER" }] }],
  people: [
    { id: "n-an", staffId: "an", departmentId: "fair", schemeId: "s", name: "ANTHONY", code: null, title: "Team Leader", parentId: null, self: true, mine: true },
    { id: "n-lc", staffId: "lc", departmentId: "fair", schemeId: "s", name: "LUCAS CHOOI", code: null, title: "Revenue Specialist", parentId: "n-an", self: false, mine: true },
    { id: "n-yu", staffId: "yu", departmentId: "fair", schemeId: "s", name: "YUNY", code: null, title: "Team Assistant", parentId: "n-an", self: false, mine: true },
  ],
};
const vm = teamVM({ map, departmentId: "fair", subName: "Fair", staffId: "an", people: [], month: "2026-10",
  kpi: { enabled: false, threshold: null }, capacity: 27, occupied: 26, ranks: new Map([["an", "Rank B"]]) })!;

describe("Team & capacity", () => {
  it("draws the two directors side by side on one level, not one above the other", () => {
    render(<TeamPage vm={vm} onBack={() => {}} onPerson={() => {}} />);
    const kris = screen.getByRole("button", { name: /KRIS/ });
    const peter = screen.getByRole("button", { name: /PETER/ });
    // One label for the level, and both cards in the same row of it.
    expect(screen.getByText("DIRECTORS")).toBeInTheDocument();
    expect(screen.queryByText("DIRECTOR")).not.toBeInTheDocument();
    expect(kris.parentElement?.parentElement).toBe(peter.parentElement?.parentElement);
    expect(screen.getByText("2 above · 2 below")).toBeInTheDocument();
  });

  it("opens the director tapped", () => {
    const onPerson = vi.fn();
    render(<TeamPage vm={vm} onBack={() => {}} onPerson={onPerson} />);
    fireEvent.click(screen.getByRole("button", { name: /PETER/ }));
    expect(onPerson).toHaveBeenCalledWith("d:peter");
  });
});
