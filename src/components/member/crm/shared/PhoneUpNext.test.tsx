import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/(member)/member/crm-actions", () => ({ crmWrite: vi.fn(), fetchUpNext: vi.fn() }));

import { PhoneUpNext } from "./PhoneUpNext";
import { demoBook } from "./up-next-demo";

const draw = () => render(<PhoneUpNext head={<div>Head</div>} live={false} book={demoBook} ads={[]} canAct line={null} />);
const picker = () => screen.getAllByRole("button").find(b => b.textContent?.startsWith("All ads") || b.textContent?.startsWith("Raya Promo"))!;

describe("Up next's ad picker on the phone (2026-11-08: on an iPhone a tap on an ad only closed the menu)", () => {
  it("draws no see-through layer over the screen while the menu is open — the iPhone put it over the menu", () => {
    const { container } = draw();
    fireEvent.click(picker());
    expect(screen.getByText("Raya Promo")).toBeTruthy();
    const layers = [...container.querySelectorAll<HTMLElement>("div")].filter(el => el.style.position === "absolute" && /^0(px)?$/.test(el.style.inset) && !el.childElementCount);
    expect(layers).toEqual([]);
  });

  it("a tapped ad becomes the one shown", () => {
    draw();
    fireEvent.click(picker());
    fireEvent.click(screen.getByText("Raya Promo"));
    expect(picker().textContent).toContain("Raya Promo");
    expect(screen.queryByText("EV Test Drive")).toBeNull();
  });

  it("a tap outside the menu closes it and keeps the ad", () => {
    draw();
    fireEvent.click(picker());
    act(() => { document.body.click(); });
    expect(screen.queryByText("EV Test Drive")).toBeNull();
    expect(picker().textContent).toContain("All ads");
  });
});
