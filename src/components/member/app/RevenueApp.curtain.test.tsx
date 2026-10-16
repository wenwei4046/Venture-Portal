import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { protoData, protoFixture } from "./fixtures/proto";
import RevenueApp from "./RevenueApp";
import { AT } from "./shell/ViewSwitchCurtain";

// The switch to the CRM on a phone (2026-10-17 — the user: "when revenue app, press switch to crm, i want is have a
// motion"; the handoff "Revenue → CRM switch view motion", design 2c "Peach · Context"): Today's chat button and Profile's
// My leads & appointments alike put a curtain up, the CRM goes in under it at 950ms, and it lifts only once the CRM has
// drawn. The CRM's way out still leads to where it was opened.
vi.mock("next/navigation", () => ({
  usePathname: () => "/member/preview",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
// The CRM draws when the test says so: "CRM drawn" stands for its kept copy or its first read landing.
vi.mock("../crm/CrmApp", () => ({
  default: ({ onExit, onReady }: { onExit: () => void; onReady?: () => void }) => (
    <>
      <button onClick={() => onReady?.()}>CRM drawn</button>
      <button onClick={onExit}>Leave the CRM</button>
    </>
  ),
}));

type Lift = { el: Element; frames: Keyframe[]; finish: () => void };
let anims: Lift[] = [];

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
const curtain = () => screen.queryByRole("status", { name: "Opening CRM" });
const lifting = () => anims.find(a => a.el === curtain() && JSON.stringify(a.frames).includes("-100%"));
async function open(search: string) {
  window.history.replaceState({}, "", `/member/preview${search}`);
  render(<RevenueApp initialData={protoData()} initialSearch={search} today="2026-10-03" fixture={protoFixture()} crm />);
  await act(async () => {});
}
const wait = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

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

  it("holds over a CRM still drawing and lifts once it has drawn — then the CRM's way out leads back to Today", async () => {
    await open("");
    fireEvent.click(screen.getByRole("button", { name: "Open CRM" }));
    await wait(AT.uncover + 1000);
    expect(lifting()).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "CRM drawn" }));
    await wait(AT.uncover - AT.textOut);
    const lift = lifting();
    expect(lift).toBeDefined();
    await act(async () => { lift!.finish(); });
    expect(curtain()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave the CRM" }));
    await act(async () => {});
    expect([page(), view()]).toEqual([null, null]);
  });

  it("from Profile's My leads & appointments too — and its way out leads back to Profile", async () => {
    await open("?page=account");
    fireEvent.click(screen.getByRole("button", { name: /My leads & appointments/ }));
    await act(async () => {});
    expect(curtain()).toBeInTheDocument();
    expect(view()).toBeNull();
    await wait(AT.swap);
    expect(view()).toBe("crm");
    fireEvent.click(screen.getByRole("button", { name: "CRM drawn" }));
    await wait(AT.uncover);
    await act(async () => { lifting()!.finish(); });
    expect(curtain()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave the CRM" }));
    await act(async () => {});
    expect([page(), view()]).toEqual(["account", null]);
  });
});
