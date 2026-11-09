import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/app/(member)/member/crm-actions", () => ({ crmWrite: vi.fn(), fetchUpNext: vi.fn() }));

import { PhoneUpNext } from "./PhoneUpNext";
import { demoBook, UpNextDemo } from "./up-next-demo";
import { upNextFrame } from "./up-next";

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

describe("Up next keeps the head where every Insight side has it (no jump between Team · Ads · Up next · Activity)", () => {
  it("starts 6px down with 14px between rows, as v4 8b", () => {
    const { container } = draw();
    const main = container.querySelector("main")!;
    expect(main.style.padding.split(" ")[0]).toBe("6px");
    expect(main.style.gap).toBe("14px");
  });
});

describe("Up next = v4 frame 9g", () => {
  it("All ads and 'N in turn' in one row; the espresso #1 card; the rest of the turn as rows; two buttons", () => {
    draw();
    expect(screen.getByText(/^[0-9]+ in turn$/)).toBeTruthy();
    const card = document.querySelector<HTMLElement>("[data-un-first]")!;
    expect(card.style.background).toBe("var(--crm-ink)");
    expect(card.style.borderRadius).toBe("18px");
    expect(card.textContent).toContain("Last lead went to");
    expect(card.textContent).toContain("Skip");
    expect(card.textContent).toContain("Give to…");
    const rows = [...document.querySelectorAll("[data-un-row]")];
    expect(rows.length).toBeGreaterThan(0);
    expect((rows[0] as HTMLElement).style.height).toBe("50px");
    expect(screen.queryByText("In turn")).toBeNull(); // the tab control is gone
    expect(screen.getByLabelText(/^Not in turn [0-9]+$/)).toBeTruthy();
    expect(screen.getByLabelText(/^On leave [0-9]+$/)).toBeTruthy();
  });

  it("Not in turn and On leave open their lists", () => {
    draw();
    fireEvent.click(screen.getByLabelText(/^Not in turn [0-9]+$/));
    expect(screen.getByRole("dialog", { name: "Not in turn" })).toBeTruthy();
    fireEvent.click(screen.getByRole("dialog", { name: "Not in turn" }).parentElement!);
    fireEvent.click(screen.getByLabelText(/^On leave [0-9]+$/));
    expect(screen.getByRole("dialog", { name: "On leave" })).toBeTruthy();
  });

  it("a row says '{team} · {n} today' — leads today from the book, left out at 0", () => {
    const r = new UpNextDemo().read("all");
    const ui = { ad: "all", adOpen: false, tip: false, pick: false, more: false, why: false, hov: null, sheet: null, ltab: "in" as const };
    const noop = () => {};
    const acts = { set: noop, pickAd: noop, skip: noop, pause: noop, resume: noop, give: noop, unpin: noop, openLeave: noop, endLeave: noop, cancelLeave: noop };
    const plain = upNextFrame(r, demoBook, [], ui, acts, true);
    const lucky = plain.queue[0].id;
    const f = upNextFrame(r, { ...demoBook, todayOf: id => (id === lucky ? 3 : 0) }, [], ui, acts, true);
    expect(f.queue[0].right).toMatch(/ · 3 today$/);
    expect(f.queue[1].right).not.toMatch(/today/);
    expect(f.queue.map(q => q.id)).not.toContain(f.first!.id); // #1 is the card, not a row
    expect(f.first!.todayLine).not.toMatch(/today/);
  });
});

describe("9g's figures", () => {
  it("leads today: each customer given to them today (office time), as Team activity counts them", async () => {
    const { leadsTodayOf } = await import("./up-next-data");
    const ev = (to: string, at: string) => ({ id: 1, kind: "assigned", customerId: "c", actor: null, owner: null, data: { to }, at });
    const d = { events: [ev("a", "2026-11-09T17:00:00Z"), ev("a", "2026-11-10T01:00:00Z"), ev("a", "2026-11-10T02:00:00Z"), ev("b", "2026-11-10T03:00:00Z"), { ...ev("b", "2026-11-10T03:00:00Z"), kind: "won" }] };
    const n = leadsTodayOf(d as never, new Date("2026-11-10T04:00:00Z"));
    expect(n.get("a")).toBe(3); // 9 Nov 17:00 UTC = 10 Nov 01:00 office time
    expect(n.get("b")).toBe(1);
  });
  it("the last lead's time: 8:40 today, with its day before", async () => {
    const { lastWhen } = await import("./up-next");
    expect(lastWhen("2026-11-10T00:40:00Z", "2026-11-10T09:00")).toBe("8:40");
    expect(lastWhen("2026-11-08T00:40:00Z", "2026-11-10T09:00")).toBe("8 Nov, 8:40");
  });
});
