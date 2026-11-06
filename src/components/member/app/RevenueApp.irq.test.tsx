import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { protoData, protoFixture } from "./fixtures/proto";
import RevenueApp from "./RevenueApp";

// IR Quote (2026-11-05 — the handoff `.design/ir-quote/design_handoff_ir_quote`): an IR membership's Quote is the
// renovation-package quote, never the brand list; the Product List's editors find Quote settings in the sidebar.
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
vi.mock("@/app/(member)/member/ir-quote-actions", () => ({
  loadIrQuote: vi.fn(async () => ({ ok: false, error: "the preview reads nothing" })),
  searchIrQuoteCustomers: vi.fn(),
}));
vi.mock("./irq/IrQuoteScreens", () => ({
  IrQuoteScreen: (p: { inApp: boolean; offline?: unknown; onSettings?: unknown }) => (
    <div data-testid="irq-quote" data-in-app={String(p.inApp)} data-offline={String(!!p.offline)} data-settings={String(!!p.onSettings)} />
  ),
  IrQuoteSettingsScreen: (p: { phone: boolean }) => <div data-testid="irq-settings" data-phone={String(p.phone)} />,
}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open(search: string) {
  window.history.replaceState(null, "", `/member/preview${search}`);
  render(<RevenueApp initialData={protoData()} initialSearch={search} today="2026-10-03" fixture={protoFixture()} />);
}

describe("IR's Quote", () => {
  it("opens the renovation quote for an IR membership — the preview's own price list, nothing read", () => {
    open("?department=ir&page=quote");
    const q = screen.getByTestId("irq-quote");
    expect(q.dataset.offline).toBe("true");
    expect(screen.queryByText(/Loading the catalogue/)).toBeNull();
  });

  // View as (2026-11-06): the Principal viewing a member stays told so, inside the quote's own layer too.
  it("shows the viewing bar over the quote while viewing a member", () => {
    const data = protoData({ principal: true });
    const ir = data.memberships.find(m => m.id === "ir")!;
    const person = ir.people[0];
    const search = `?department=ir&page=quote&staff=${person.id}`;
    window.history.replaceState(null, "", `/member/preview${search}`);
    render(<RevenueApp initialData={data} initialSearch={search} today="2026-10-03" fixture={protoFixture()} />);
    expect(screen.getByTestId("irq-quote")).toBeTruthy();
    expect(screen.getByText(`Viewing as ${person.name}`)).toBeTruthy();
  });

  it("leaves Fair's Quote as it was", () => {
    open("?department=fair&page=quote");
    expect(screen.queryByTestId("irq-quote")).toBeNull();
  });

  it("opens IR's quote from the bottom bar's Quote, never the brand list", () => {
    open("?department=ir&page=today");
    act(() => screen.getAllByRole("button", { name: "Quote" })[0].click());
    expect(screen.getByTestId("irq-quote")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /brand/i })).toBeNull();
  });
});
