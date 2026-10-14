import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sheet, { SWIPE_CLOSE_PX } from "./Sheet";
import { OrderSheet } from "./insight/InsightSheets";
import { CommissionSheet } from "./profile/IncomePages";
import { HonourSheet } from "./profile/HonoursPage";
import { PersonSheet } from "./profile/TeamPage";
import { RequestSheet } from "./profile/RequestsPage";
import { MemoSheet } from "./profile/MemosPage";

afterEach(cleanup);

/** Insight's My sales orders: the bills on the page, one of them open in the sheet beside it. */
function Bills({ peek = true, onClose, onWaiting }: { peek?: boolean; onClose?: () => void; onWaiting?: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  return (
    <>
      {["HC-SO-2610-042", "HC-SO-2610-043"].map(no => <button key={no} onClick={() => setPick(no)}>{no}</button>)}
      <button onClick={onWaiting}>Waiting for deposit</button>
      <Sheet open={pick !== null} onClose={() => { onClose?.(); setPick(null); }} z={22} scroll peek={peek} label="Sales order">
        <p>Showing {pick}</p>
        <button onClick={() => setPick(null)}>Done</button>
      </Sheet>
    </>
  );
}

const panel = () => screen.getByRole("dialog", { hidden: true });
const isOpen = () => !panel().hasAttribute("inert");

describe("Sheet › peek (a row of the page beside it)", () => {
  it("clicking another bill while one is open shows that bill — one click, not close-then-open", () => {
    render(<Bills />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));
    expect(isOpen()).toBe(true);
    expect(panel()).toHaveTextContent("Showing HC-SO-2610-042");

    fireEvent.click(screen.getByText("HC-SO-2610-043"));
    expect(isOpen()).toBe(true);
    expect(panel()).toHaveTextContent("Showing HC-SO-2610-043");
  });

  it("the next bill opens at its top, not where the last one was scrolled to", () => {
    render(<Bills />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));
    panel().scrollTop = 240;
    fireEvent.click(screen.getByText("HC-SO-2610-043"));
    expect(panel().scrollTop).toBe(0);
  });

  it("a click anywhere else on the page still closes it — and still does what it says", () => {
    const onClose = vi.fn();
    const onWaiting = vi.fn();
    render(<Bills onClose={onClose} onWaiting={onWaiting} />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));
    fireEvent.click(screen.getByText("Waiting for deposit"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onWaiting).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);
  });

  it("a click inside the panel leaves it open; Done closes it", () => {
    render(<Bills />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));
    fireEvent.click(screen.getByText(/^Showing/));
    expect(isOpen()).toBe(true);
    fireEvent.click(screen.getByText("Done"));
    expect(isOpen()).toBe(false);
  });

  it("selecting text out of the panel, or dragging across the page, is not a click outside", () => {
    const onClose = vi.fn();
    render(<Bills onClose={onClose} />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));

    // Pressed in the panel, let go over the page: the browser clicks their common ancestor.
    fireEvent.pointerDown(screen.getByText(/^Showing/), { clientX: 1200, clientY: 200 });
    fireEvent.click(document.body, { clientX: 700, clientY: 200 });
    // Pressed on the page and dragged away before letting go.
    fireEvent.pointerDown(screen.getByText("Waiting for deposit"), { clientX: 300, clientY: 400 });
    fireEvent.click(screen.getByText("Waiting for deposit"), { clientX: 360, clientY: 470 });

    expect(onClose).not.toHaveBeenCalled();
    expect(isOpen()).toBe(true);
  });

  it("on a phone the dim closes it, once", () => {
    const onClose = vi.fn();
    render(<Bills onClose={onClose} />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));
    fireEvent.click(panel().previousElementSibling!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);
  });

  it("once closed it stops listening to the page", () => {
    const onClose = vi.fn();
    render(<Bills onClose={onClose} />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));
    fireEvent.click(screen.getByText("Done"));
    fireEvent.click(screen.getByText("Waiting for deposit"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a sheet that is not a peek leaves the page's clicks to its dim", () => {
    const onClose = vi.fn();
    render(<Bills peek={false} onClose={onClose} />);
    fireEvent.click(screen.getByText("HC-SO-2610-042"));
    fireEvent.click(screen.getByText("Waiting for deposit"));
    expect(onClose).not.toHaveBeenCalled();
  });

  // The swallowed click itself was CSS: on desktop the dim is transparent but still
  // covered the whole page, so the first click on another bill only reached the dim.
  it("on desktop only a peek's panel catches clicks — the page beside it gets the rest", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/member/app/sheet.module.css"), "utf8");
    const desk = css.slice(css.indexOf("@container rv (min-width: 1024px)"));
    expect(desk).toMatch(/\.layer\.peek\s*\{\s*pointer-events:\s*none;\s*\}/);
    expect(desk).toMatch(/\.peek \.panelOpen\s*\{\s*pointer-events:\s*auto;\s*\}/);
  });
});

/** Every sheet that shows one row of the page behind it. */
const ROW_SHEETS: [string, (onClose: () => void) => ReactNode][] = [
  ["Insight › a sales order", onClose => <OrderSheet open vm={null} onClose={onClose} />],
  ["My income › an order's commission", onClose => <CommissionSheet open vm={null} onClose={onClose} />],
  ["My honours › a finish", onClose => <HonourSheet open place={null} vm={null} periodLabel="" onClose={onClose} />],
  ["Team & capacity › a person", onClose => <PersonSheet open vm={null} onClose={onClose} />],
  ["Requests › a request", onClose => <RequestSheet open vm={null} busy={false} error={null} onCancel={() => {}} onUpdate={() => {}} onClose={onClose} />],
  ["Memos › a memo", onClose => <MemoSheet open memo={null} busy={false} readOnly={false} error={null} onAck={() => {}} onClose={onClose} />],
];

describe.each(ROW_SHEETS)("%s is a peek", (_, sheet) => {
  it("a click on the next row closes it without swallowing the click", () => {
    const onClose = vi.fn();
    const onRow = vi.fn();
    render(<><button onClick={onRow}>Next row</button>{sheet(onClose)}</>);
    fireEvent.click(screen.getByText("Next row"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRow).toHaveBeenCalledTimes(1);
  });
});

// A phone's sheet closes when it is pulled down (2026-10-14, the refresh handoff's motion: "swipe-down closes").
describe("Sheet › pulled down", () => {
  const drag = (el: HTMLElement, by: number) => {
    fireEvent.touchStart(el, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(document, { touches: [{ clientY: 100 + by / 2 }] });
    fireEvent.touchMove(document, { touches: [{ clientY: 100 + by }] });
    fireEvent.touchEnd(document, { touches: [] });
  };
  function Pulled({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(true);
    return <Sheet open={open} onClose={() => { onClose(); setOpen(false); }} z={22} label="Food claim"><p>Days</p><textarea aria-label="Notes" /></Sheet>;
  }

  it("past the line it closes; short of it, it springs back", () => {
    const onClose = vi.fn();
    render(<Pulled onClose={onClose} />);
    drag(panel(), SWIPE_CLOSE_PX - 30);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel().style.transform).toBe("");
    drag(panel(), SWIPE_CLOSE_PX + 30);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);
  });

  it("a field inside it keeps its own touch", () => {
    const onClose = vi.fn();
    render(<Pulled onClose={onClose} />);
    drag(screen.getByLabelText("Notes"), SWIPE_CLOSE_PX + 60);
    expect(onClose).not.toHaveBeenCalled();
  });
});
