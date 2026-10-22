import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AT, EASE, HOLD_MAX, ViewSwitchCurtain } from "./ViewSwitchCurtain";

// The switch to the CRM (2026-10-17 — the handoff "Revenue → CRM switch view motion", design 2c "Peach · Context"): the
// curtain's sequence from the tap — the CRM put in under it at 950ms, the lift held until the CRM has drawn, never
// onto an empty screen — and at once with reduced motion or where the browser cannot animate. The way back (the user:
// "也做一个反方向的幕布") is its mirror image, with the press of the CRM's own house laid over it.

type Call = { el: Element; frames: Keyframe[]; opts: KeyframeAnimationOptions; cancel: ReturnType<typeof vi.fn>; finish: () => void };

function fakeAnimate() {
  const calls: Call[] = [];
  const animate = vi.fn(function (this: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    const call: Call = { el: this, frames, opts, cancel: vi.fn(), finish };
    calls.push(call);
    return { cancel: call.cancel, finished } as unknown as Animation;
  });
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
  return calls;
}

const reduced = (on: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));

function draw(ready = false, { back = false, press = null }: { back?: boolean; press?: HTMLElement | null } = {}) {
  const screenEl = document.createElement("div");
  document.body.appendChild(screenEl);
  const ref = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
  ref.current = screenEl;
  const onSwap = vi.fn();
  const onDone = vi.fn();
  const [from, to] = back ? ["CRM", "Revenue"] : ["Revenue", "CRM"];
  const curtain = (r: boolean) => <ViewSwitchCurtain from={from} to={to} back={back} ready={r} screen={ref} press={press} onSwap={onSwap} onDone={onDone} />;
  const view = render(curtain(ready));
  return { screenEl, onSwap, onDone, rerender: (r: boolean) => view.rerender(curtain(r)) };
}

const panelOf = (to = "CRM") => screen.getByRole("status", { name: `Opening ${to}` });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  reduced(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
  document.body.innerHTML = "";
});

describe("the curtain to the CRM", () => {
  it("says what opens and rolls Revenue into CRM over three dots", () => {
    fakeAnimate();
    draw();
    expect(panelOf()).toHaveTextContent("Now opening");
    expect(panelOf()).toHaveTextContent("Revenue");
    expect(panelOf()).toHaveTextContent("CRM");
  });

  it("rises 400ms after the tap, the screen stepping back under it from 50% 40%", () => {
    const calls = fakeAnimate();
    const { screenEl } = draw();
    const rise = calls.find(c => c.el === panelOf())!;
    expect(rise.frames).toEqual([{ transform: "translateY(100%)", borderRadius: "40px 40px 0 0" }, { transform: "translateY(0)", borderRadius: "0" }]);
    expect(rise.opts).toMatchObject({ delay: AT.cover, duration: AT.coverFor, easing: EASE, fill: "both" });
    const back = calls.find(c => c.el === screenEl)!;
    expect(back.frames).toEqual([{ transform: "scale(1)" }, { transform: "scale(.96)" }]);
    expect(screenEl.style.transformOrigin).toBe("50% 40%");
    // The words roll from 1150ms.
    const rolls = calls.filter(c => c.opts.delay === AT.roll);
    expect(rolls.map(c => c.frames)).toEqual([
      [{ transform: "translateY(0)" }, { transform: "translateY(-100%)" }],
      [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
    ]);
  });

  it("puts the CRM in at 950ms, the screen at full size again", () => {
    const calls = fakeAnimate();
    const { screenEl, onSwap } = draw();
    act(() => { vi.advanceTimersByTime(AT.swap - 1); });
    expect(onSwap).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(calls.find(c => c.el === screenEl)!.cancel).toHaveBeenCalled();
    expect(screenEl.style.transformOrigin).toBe("");
  });

  it("lifts at 1850ms onto a CRM that has drawn, the CRM rising 36px into place, then goes", async () => {
    const calls = fakeAnimate();
    const { screenEl, onDone } = draw(true);
    act(() => { vi.advanceTimersByTime(AT.uncover - 1); });
    expect(calls.some(c => c.el === panelOf() && JSON.stringify(c.frames).includes("-100%"))).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    const lift = calls.find(c => c.el === panelOf() && JSON.stringify(c.frames).includes("-100%"))!;
    expect(lift.frames).toEqual([{ transform: "translateY(0)", borderRadius: "0" }, { transform: "translateY(-100%)", borderRadius: "0 0 40px 40px" }]);
    expect(lift.opts).toMatchObject({ duration: AT.uncoverFor, easing: EASE });
    const crmIn = calls.find(c => c.el === screenEl && JSON.stringify(c.frames).includes("36px"))!;
    expect(crmIn.opts).toMatchObject({ delay: AT.screenIn - AT.uncover, duration: AT.screenInFor, fill: "backwards" });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => { lift.finish(); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("holds over a CRM still drawing — the dots pulsing — and lifts the moment it has drawn", () => {
    const calls = fakeAnimate();
    const { rerender } = draw(false);
    act(() => { vi.advanceTimersByTime(AT.uncover + 2000); });
    expect(calls.some(c => c.el === panelOf() && JSON.stringify(c.frames).includes("-100%"))).toBe(false);
    rerender(true);
    act(() => { vi.advanceTimersByTime(AT.uncover - AT.textOut); });
    expect(calls.some(c => c.el === panelOf() && JSON.stringify(c.frames).includes("-100%"))).toBe(true);
  });

  it("never holds for good: it lifts after HOLD_MAX onto whatever is there", () => {
    const calls = fakeAnimate();
    draw(false);
    act(() => { vi.advanceTimersByTime(AT.textOut + HOLD_MAX + (AT.uncover - AT.textOut)); });
    expect(calls.some(c => c.el === panelOf() && JSON.stringify(c.frames).includes("-100%"))).toBe(true);
  });

  it("the way back is the mirror image: down from the top, the words rolling down, out through the bottom onto the app settling from above", async () => {
    const calls = fakeAnimate();
    const { screenEl, onSwap, onDone } = draw(true, { back: true });
    expect(panelOf("Revenue")).toHaveTextContent("Now opening");
    const panel = panelOf("Revenue");
    expect(calls.find(c => c.el === panel)!.frames).toEqual([{ transform: "translateY(-100%)", borderRadius: "0 0 40px 40px" }, { transform: "translateY(0)", borderRadius: "0" }]);
    expect(screenEl.style.transformOrigin).toBe("50% 60%");
    expect(calls.filter(c => c.opts.delay === AT.roll).map(c => c.frames)).toEqual([
      [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }],
      [{ transform: "translateY(-100%)" }, { transform: "translateY(0)" }],
    ]);
    act(() => { vi.advanceTimersByTime(AT.swap); });
    expect(onSwap).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(AT.uncover - AT.swap); });
    const out = calls.find(c => c.el === panel && JSON.stringify(c.frames[0]) === JSON.stringify({ transform: "translateY(0)", borderRadius: "0" }))!;
    expect(out.frames[1]).toEqual({ transform: "translateY(100%)", borderRadius: "40px 40px 0 0" });
    expect(calls.find(c => c.el === screenEl && JSON.stringify(c.frames).includes("px"))!.frames[0]).toEqual({ transform: "translateY(-36px)" });
    await act(async () => { out.finish(); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("presses a button it does not draw: the squeeze on it, the ripple laid over where it stands", () => {
    const calls = fakeAnimate();
    const house = document.createElement("span");
    document.body.appendChild(house);
    house.getBoundingClientRect = () => ({ left: 300, top: 52, width: 40, height: 40, right: 340, bottom: 92, x: 300, y: 52, toJSON() {} }) as DOMRect;
    draw(true, { back: true, press: house });
    expect(calls.find(c => c.el === house)!.frames).toEqual([{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1)" }]);
    const ripple = calls.find(c => JSON.stringify(c.frames).includes("scale(1.6)"))!;
    const over = ripple.el.parentElement as HTMLElement;
    expect([over.style.left, over.style.top, over.style.width, over.style.height]).toEqual(["300px", "52px", "40px", "40px"]);
  });

  it("switches at once with reduced motion", () => {
    fakeAnimate();
    reduced(true);
    const { onSwap, onDone } = draw();
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("switches at once where the browser cannot animate", () => {
    const { onSwap, onDone } = draw();
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
