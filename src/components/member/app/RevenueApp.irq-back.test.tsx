import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { protoData, protoFixture } from "./fixtures/proto";
import RevenueApp from "./RevenueApp";

// v4 notes/18-B (2026-11-10): CRM › Profile › Quotation settings — their Back (and the phone's) returns to the CRM on
// Profile; it dropped the person outside the CRM. The settings open OVER the CRM, which stays mounted under them (its page,
// its scroll, its Back steps kept). Opened from the Quote screen, Back stays as it was.
vi.mock("next/navigation", () => ({
  usePathname: () => "/member/preview",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));
vi.mock("@/app/(member)/member/share-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
vi.mock("@/app/(member)/member/ir-quote-actions", () => ({ loadIrQuote: vi.fn(async () => ({ ok: false, error: "none" })), searchIrQuoteCustomers: vi.fn() }));
vi.mock("./irq/IrQuoteScreens", () => ({
  IrQuoteScreen: (p: { onSettings?: () => void }) => <button data-testid="irq-quote" onClick={p.onSettings}>Quote settings</button>,
  IrQuoteSettingsScreen: (p: { onBack: () => void }) => <div data-testid="irq-settings"><button onClick={p.onBack}>Settings back</button></div>,
}));
let mounts = 0;
vi.mock("../crm/CrmApp", () => ({
  default: function FakeCrm({ onQuoteSettings }: { onQuoteSettings?: () => void }) {
    // The CRM's own state — its tab — must survive the settings opening over it.
    const [tab] = useState(() => { mounts++; return "profile"; });
    return <div data-testid="crm">{tab}<button onClick={onQuoteSettings}>Quotation settings</button></div>;
  },
}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  mounts = 0;
  vi.stubGlobal("ResizeObserver", NoResize);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

async function open(search: string) {
  window.history.replaceState(null, "", `/member/preview${search}`);
  render(<RevenueApp initialData={protoData()} initialSearch={search} today="2026-10-03" fixture={protoFixture()} productList={{ group: "g" } as never} />);
  await act(async () => {});
}
const crmShown = () => getComputedStyle(screen.getByTestId("crm").parentElement!).visibility !== "hidden";

describe("Quotation settings opened from the CRM", () => {
  it("open over the CRM; their Back returns to the CRM as it was (never drawn afresh)", async () => {
    await open("?department=ir&page=account&view=crm");
    fireEvent.click(screen.getByText("Quotation settings"));
    await act(async () => {});
    expect(screen.getByTestId("irq-settings")).toBeInTheDocument();
    expect(crmShown()).toBe(false);
    fireEvent.click(screen.getByText("Settings back"));
    await act(async () => {});
    expect(screen.queryByTestId("irq-settings")).toBeNull();
    expect(crmShown()).toBe(true);
    expect(new URLSearchParams(window.location.search).get("view")).toBe("crm");
    expect(mounts).toBe(1);
  });

  it("the phone's Back does the same: one history step of their own while open", async () => {
    await open("?department=ir&page=account&view=crm");
    fireEvent.click(screen.getByText("Quotation settings"));
    await act(async () => {});
    expect((history.state as Record<string, unknown>).irqSettings).toBe(1);
    act(() => { history.replaceState({}, ""); window.dispatchEvent(new PopStateEvent("popstate", { state: {} })); });
    await act(async () => {});
    expect(screen.queryByTestId("irq-settings")).toBeNull();
    expect(crmShown()).toBe(true);
    expect(mounts).toBe(1);
  });
});

describe("Quotation settings opened from the Quote", () => {
  it("stay as before: the whole screen, no step of their own", async () => {
    await open("?department=ir&page=quote");
    fireEvent.click(screen.getByTestId("irq-quote"));
    await act(async () => {});
    expect(screen.getByTestId("irq-settings")).toBeInTheDocument();
    expect((history.state as Record<string, unknown> | null)?.irqSettings).toBeUndefined();
    expect(screen.queryByTestId("crm")).toBeNull();
  });
});
