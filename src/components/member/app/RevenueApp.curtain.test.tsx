import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { protoData, protoFixture } from "./fixtures/proto";
import RevenueApp from "./RevenueApp";
import { AT } from "./shell/ViewSwitchCurtain";

// The switch to the CRM on a phone (2026-10-17 — the user: "when revenue app, press switch to crm, i want is have a
// motion"; the handoff "Revenue → CRM switch view motion", design 2c "Peach · Context"): Today's chat button puts a
// curtain up (Profile's My leads & appointments did too until it went, 2026-10-20), the CRM goes in under it at 950ms,
// and it lifts only once the CRM has drawn. The way out goes behind the mirror curtain (the user: "也做一个反方向的幕布")
// and still leads to where the CRM was opened — home when a tapped notice opened it.
vi.mock("next/navigation", () => ({
  usePathname: () => "/member/preview",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
// The CRM draws when the test says so: "CRM drawn" stands for its kept copy or its first read landing. Its house is the
// CRM's own button (as SalesInbox draws it); "Leave the CRM" stands for any other way out (a header's back).
vi.mock("../crm/CrmApp", () => ({
  default: ({ onExit, onReady }: { onExit: () => void; onReady?: () => void }) => (
    <>
      <button onClick={() => onReady?.()}>CRM drawn</button>
      <span onClick={onExit} title="Back to Revenue app" aria-label="Back to Revenue app">⌂</span>
      <button onClick={onExit}>Leave the CRM</button>
    </>
  ),
}));

type Anim = { el: Element; frames: Keyframe[]; finish: () => void };
let anims: Anim[] = [];

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  anims = [];
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: function (this: Element, frames: Keyframe[]) {
      let finish!: () => void;
      const finished = new Promise<void>(resolve => { finish = resolve; });
      anims.push({ el: this, frames, finish });
      return { cancel() {}, finished } as unknown as Animation;
    },
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (Element.prototype as { animate?: unknown }).animate;
});

const view = () => new URLSearchParams(window.location.search).get("view");
const page = () => new URLSearchParams(window.location.search).get("page");
const curtain = (to = "CRM") => screen.queryByRole("status", { name: `Opening ${to}` });
const leaving = (to = "CRM") => anims.find(a => a.el === curtain(to) && a.frames.length === 2 && (a.frames[0] as { transform?: string }).transform === "translateY(0)");
async function open(search: string) {
  window.history.replaceState({}, "", `/member/preview${search}`);
  render(<RevenueApp initialData={protoData()} initialSearch={search} today="2026-10-03" fixture={protoFixture()} crm />);
  await act(async () => {});
}
const wait = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
/** Into the CRM from Today's chat button, drawn, the curtain gone. */
async function inCrm() {
  await open("");
  fireEvent.click(screen.getByRole("button", { name: "Open CRM" }));
  await wait(AT.swap);
  fireEvent.click(screen.getByRole("button", { name: "CRM drawn" }));
  await wait(AT.uncover - AT.swap);
  await act(async () => { leaving()!.finish(); });
  expect(curtain()).not.toBeInTheDocument();
  anims = [];
}

describe("the switch to the CRM on a phone", () => {
  it("from Today's chat button: the button squeezes and ripples, the curtain rises, the CRM goes in under it at 950ms", async () => {
    await open("");
    const button = screen.getByRole("button", { name: "Open CRM" });
    fireEvent.click(button);
    await act(async () => {});
    // The press: the squeeze on the button, the ripple in it.
    expect(anims.some(a => a.el === button && JSON.stringify(a.frames).includes("scale(.96)"))).toBe(true);
    expect(anims.some(a => button.contains(a.el) && a.el !== button && JSON.stringify(a.frames).includes("scale(1.6)"))).toBe(true);
    expect(curtain()).toHaveTextContent("Now opening");
    // Today is still under it, and a second tap changes nothing.
    expect([page(), view()]).toEqual([null, null]);
    fireEvent.click(button);
    expect(screen.getAllByRole("status", { name: "Opening CRM" })).toHaveLength(1);
    await wait(AT.swap);
    expect([page(), view()]).toEqual(["account", "crm"]);
    expect(curtain()).toBeInTheDocument();
  });

  it("holds over a CRM still drawing and lifts once it has drawn", async () => {
    await open("");
    fireEvent.click(screen.getByRole("button", { name: "Open CRM" }));
    await wait(AT.uncover + 1000);
    expect(leaving()).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "CRM drawn" }));
    await wait(AT.uncover - AT.textOut);
    const lift = leaving();
    expect(lift).toBeDefined();
    await act(async () => { lift!.finish(); });
    expect(curtain()).not.toBeInTheDocument();
  });

  it("the house: its squeeze and a ripple laid over it, the mirror curtain, Today in under it at 950ms, gone at once", async () => {
    await inCrm();
    const house = screen.getByLabelText("Back to Revenue app");
    fireEvent.pointerDown(house);
    fireEvent.click(house);
    await act(async () => {});
    expect(anims.some(a => a.el === house && JSON.stringify(a.frames).includes("scale(.96)"))).toBe(true);
    const ripple = anims.find(a => JSON.stringify(a.frames).includes("scale(1.6)"));
    expect(ripple?.el.parentElement?.className).toMatch(/press/);
    // Down from the top: the mirror of the way in.
    expect(curtain("Revenue")).toHaveTextContent("Now opening");
    expect(anims.find(a => a.el === curtain("Revenue"))?.frames[0]).toEqual({ transform: "translateY(-100%)", borderRadius: "0 0 40px 40px" });
    expect(view()).toBe("crm");
    fireEvent.click(house);
    expect(screen.getAllByRole("status", { name: "Opening Revenue" })).toHaveLength(1);
    await wait(AT.swap);
    expect([page(), view()]).toEqual([null, null]);
    // The app is drawn already: no hold — it leaves through the bottom at 1850ms.
    await wait(AT.uncover - AT.swap);
    const out = leaving("Revenue");
    expect(out?.frames[1]).toEqual({ transform: "translateY(100%)", borderRadius: "40px 40px 0 0" });
    await act(async () => { out!.finish(); });
    expect(curtain("Revenue")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open CRM" })).toBeInTheDocument();
  });

  it("opened by a tapped notice: any way out goes behind the curtain too, home to Today", async () => {
    await open("?page=account&view=crm");
    fireEvent.click(screen.getByRole("button", { name: "CRM drawn" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave the CRM" }));
    await act(async () => {});
    // No house pressed: no ripple, the curtain alike.
    expect(anims.some(a => JSON.stringify(a.frames).includes("scale(1.6)"))).toBe(false);
    expect(curtain("Revenue")).toBeInTheDocument();
    await wait(AT.swap);
    // Profile has led to the CRM no more since 2026-10-20: the way back is home.
    expect([page(), view()]).toEqual([null, null]);
    await wait(AT.uncover - AT.swap);
    await act(async () => { leaving("Revenue")!.finish(); });
    expect(curtain("Revenue")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open CRM" })).toBeInTheDocument();
  });
});
