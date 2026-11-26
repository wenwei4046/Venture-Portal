import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";

// The owner, 2026-11-27: "relaod time , change to crm frame". While the desktop CRM waits for its first answer it is the
// CRM's own frame with nothing in it yet (desk/DeskLoading) — it was a line in the Revenue app's page, under the app's
// sidebar. A phone keeps its own loading screen.
const net = vi.hoisted(() => ({ fetchCrmData: vi.fn(), loadSnapshot: vi.fn() }));
vi.mock("@/app/(member)/member/crm-actions", () => ({
  fetchCrmData: net.fetchCrmData,
  crmWrite: vi.fn(async () => ({ ok: true, data: null })),
}));
vi.mock("./shared/snapshot", () => ({ loadSnapshot: net.loadSnapshot, saveSnapshot: vi.fn() }));

import CrmApp from "./CrmApp";

class NoResize { observe() {} unobserve() {} disconnect() {} }
let land: (r: { ok: true; data: CrmData } | { ok: false; error: string }) => void = () => {};
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  net.fetchCrmData.mockReset().mockImplementation(() => new Promise(resolve => { land = resolve; }));
  net.loadSnapshot.mockReset().mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function open(desk: boolean) {
  const r = render(<CrmApp live desk={desk} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
  return r.container;
}

describe("the CRM waiting for its first answer", () => {
  it("on a computer is the CRM's frame — the ink rail, the CRM nav, the top bar's date — with its line", async () => {
    const box = await open(true);
    const frame = box.querySelector("[data-crm-desk-loading]") as HTMLElement;
    expect(frame).not.toBeNull();
    expect(frame.style.position).toBe("fixed");
    expect(frame).toHaveTextContent("CRM");
    expect(frame).toHaveTextContent("Loading your customers…");
    expect(frame.textContent).toMatch(/[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}/); // "Fri, 27 Nov 2026"
  });

  it("…and says why when the read fails", async () => {
    const box = await open(true);
    await act(async () => { land({ ok: false, error: "Could not load your customers." }); });
    expect(box.querySelector("[data-crm-desk-loading]")).toHaveTextContent("Could not load your customers.");
  });

  it("a phone keeps its own loading screen", async () => {
    const box = await open(false);
    expect(box.querySelector("[data-crm-desk-loading]")).toBeNull();
    expect(box).toHaveTextContent("Loading your customers…");
  });
});
