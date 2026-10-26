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

  // 2026-10-27 — the user, of SHAWN's chart: "pei fen and wei shun should be same line, direct under sally" (they
  // were stacked one above the other), as the portal's Staff Hierarchy draws a team; then "let all people can view
  // their own full tree".
  it("draws a person's own people side by side under them, every level down", () => {
    const person = (id: string, name: string, parentId: string) =>
      ({ id: `n-${id}`, staffId: id, departmentId: "fair", schemeId: "s", name, code: null, title: "Revenue Specialist", parentId, self: false, mine: true });
    const deep: MemberOrgMap = { ...map, people: [...map.people, person("pf", "PEI FEN", "n-yu"), person("ws", "WEI SHUN", "n-yu"), person("jo", "JOAN", "n-ws")] };
    const team = teamVM({ map: deep, departmentId: "fair", subName: "Fair", staffId: "an", people: [], month: "2026-10",
      kpi: { enabled: false, threshold: null }, capacity: 27, occupied: 26, ranks: new Map() })!;
    const onPerson = vi.fn();
    render(<TeamPage vm={team} onBack={() => {}} onPerson={onPerson} />);
    const column = (name: RegExp) => screen.getByRole("button", { name }).parentElement!;
    // One row under YUNY's card, not one above the other.
    expect(column(/PEI FEN/).parentElement).toBe(column(/WEI SHUN/).parentElement);
    expect(column(/PEI FEN/).parentElement?.parentElement).toBe(column(/YUNY/));
    // A third level down is drawn too, under its own person, and counted.
    expect(column(/JOAN/).parentElement?.parentElement).toBe(column(/WEI SHUN/));
    expect(screen.getByText("2 above · 5 below")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /JOAN/ }));
    expect(onPerson).toHaveBeenCalledWith("n-jo");
    // YUNY's column is her people's row (132 each); LUCAS CHOOI, at the bar's other end, is given half the difference
    // past it, so ANTHONY's line comes down in the bar's middle.
    expect(column(/YUNY/).style.width).toBe("264px");
    expect(column(/LUCAS/).style.width).toBe("145px");
    expect(column(/LUCAS/).style.marginLeft).toBe("59.5px");
    expect(column(/YUNY/).style.marginRight).toBe("");
  });
});
