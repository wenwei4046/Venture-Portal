import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileHeader, badgeCount } from "./Chrome";

// Today's CRM chat button (2026-10-14 — the "Revenue app refresh" handoff §2; the user: the header stays Today's, its
// number the customers' messages not read yet).
const me = { name: "Jia Hui Tan", first: "Jia Hui", ini: "JT", title: "Senior Executive", rank: "Rank B" };
const noop = () => {};
const header = (crm?: { unread: number; onOpen: () => void } | null) => render(
  <MobileHeader ruled={false} back={false} subName="Fair" count={3} me={me} crm={crm}
    onLogo={noop} onBack={noop} onSubDept={noop} onBell={noop} onProfile={noop} />,
);

afterEach(cleanup);

describe("the phone header's CRM chat button", () => {
  it("sits between the rule and the bell, rust, with the unread count", () => {
    const onOpen = vi.fn();
    header({ unread: 4, onOpen });
    const crm = screen.getByRole("button", { name: "Open CRM" });
    const buttons = screen.getAllByRole("button").map(b => b.getAttribute("aria-label") ?? b.textContent);
    expect(buttons).toEqual(["HOUZS VENTURERevenue", "Switch sub-department", "Open CRM", "Notifications", "Profile"]);
    expect(crm).toHaveTextContent("4");
    expect(crm.parentElement?.className).toMatch(/capsuleWithCrm/);
    fireEvent.click(crm);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows no badge at 0, and 99+ above 99", () => {
    header({ unread: 0, onOpen: noop });
    expect(screen.getByRole("button", { name: "Open CRM" }).textContent).toBe("");
    cleanup();
    header({ unread: 150, onOpen: noop });
    expect(screen.getByRole("button", { name: "Open CRM" })).toHaveTextContent("99+");
    expect([badgeCount(7), badgeCount(99), badgeCount(100)]).toEqual(["7", "99", "99+"]);
  });

  it("without the CRM the capsule is as it was", () => {
    header(null);
    expect(screen.queryByRole("button", { name: "Open CRM" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" }).parentElement?.className).not.toMatch(/capsuleWithCrm/);
    expect(screen.getByRole("button", { name: "Notifications" })).toHaveTextContent("3");
  });
});
