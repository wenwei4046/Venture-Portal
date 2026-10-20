/**
 * The desktop sidebar's IT requests (2026-10-20 — the user: "log in 进去的时候，左边这里 category 就会多一个 IT request" …
 * "just principal or ulitmate full access"): everybody's requests for whoever holds IT requests · View, under the
 * Product List's group label, the New ones counted; absent for everybody else.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeskAside } from "./Chrome";

const base = { active: "today" as const, count: 0, notifOpen: false, onGo: () => {}, onQuote: () => {}, onNotif: () => {}, onProfile: () => {} };

describe("IT requests in the desktop sidebar", () => {
  it("counts the New ones under the group's label, and opens the list", () => {
    const open = vi.fn();
    render(<DeskAside {...base} it={{ group: "PRINCIPAL", count: 3, on: false, onOpen: open }} />);
    expect(screen.getByText("PRINCIPAL")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /IT requests/ });
    expect(row).toHaveTextContent("IT requests3");
    expect(row).not.toHaveAttribute("aria-current");
    fireEvent.click(row);
    expect(open).toHaveBeenCalledOnce();
  });

  it("shares the Product List's label rather than writing it twice, and marks itself while open", () => {
    render(<DeskAside {...base} products={{ group: "PRINCIPAL", onOpen: () => {} }} it={{ group: "PRINCIPAL", count: 0, on: true, onOpen: () => {} }} />);
    expect(screen.getAllByText("PRINCIPAL")).toHaveLength(1);
    const row = screen.getByRole("button", { name: /IT requests/ });
    expect(row).toHaveTextContent(/^IT requests$/);
    expect(row).toHaveAttribute("aria-current", "page");
  });

  it("is not there for an account without IT requests · View", () => {
    render(<DeskAside {...base} it={null} />);
    expect(screen.queryByRole("button", { name: /IT requests/ })).toBeNull();
  });
});
