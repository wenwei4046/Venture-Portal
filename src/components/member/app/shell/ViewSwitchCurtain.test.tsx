import { act, cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AT, EASE, HOLD_MAX, ViewSwitchCurtain } from "./ViewSwitchCurtain";

// The switch to the CRM (2026-10-17 — the handoff "Revenue → CRM switch view motion", design 2c "Peach · Context"): the
// curtain's sequence from the tap — the CRM put in under it at 950ms, the lift held until the CRM has drawn, never
// onto an empty screen — and at once with reduced motion or where the browser cannot animate.

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

function draw(ready = false) {
  const screenEl = document.createElement("div");
  document.body.appendChild(screenEl);
  const ref = createRef<HTMLDivElement>() as { current: HTMLDivElement | null };
  ref.current = screenEl;
  const onSwap = vi.fn();
  const onDone = vi.fn();
  const view = render(<ViewSwitchCurtain from="Revenue" to="CRM" ready={ready} screen={ref} onSwap={onSwap} onDone={onDone} />);
  return { screenEl, onSwap, onDone, rerender: (r: boolean) => view.rerender(<ViewSwitchCurtain from="Revenue" to="CRM" ready={r} screen={ref} onSwap={onSwap} onDone={onDone} />) };
}

const panelOf = () => screen.getByRole("status", { name: "Opening CRM" });

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
