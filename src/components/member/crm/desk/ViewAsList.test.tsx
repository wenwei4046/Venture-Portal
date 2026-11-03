/** View as's list (2026-10-29): grouped by title, no avatar circles, a search, the person on screen ticked. */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ViewAsList } from "./ViewAsList";

const people = [
  { id: "p", name: "Peter", title: "Revenue Director" },
  { id: "a", name: "Anthony", title: "Team Leader" },
  { id: "r", name: "Rachael", title: "Revenue Specialist" },
  { id: "s", name: "Shawn", title: "Team Leader" },
];

describe("ViewAsList", () => {
  it("groups by title, ticks the one on screen and picks another", () => {
    const pick = vi.fn();
    render(<ViewAsList people={people} pick={pick} current="a" />);
    expect(screen.getAllByText(/Team Leader|Revenue Director|Revenue Specialist/).map(e => e.textContent)).toEqual(["Revenue Director", "Team Leader", "Revenue Specialist"]);
    expect(screen.getByRole("button", { name: /Anthony/ }).getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Shawn/ }));
    expect(pick).toHaveBeenCalledWith("s");
  });
  it("searches by name or title", () => {
    render(<ViewAsList people={people} pick={() => {}} />);
    fireEvent.change(screen.getByLabelText("Search name or title"), { target: { value: "specialist" } });
    expect(screen.queryByRole("button", { name: /Anthony/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Rachael/ })).toBeTruthy();
  });
});
