import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import type { CrmData } from "@/lib/member/crm-data";

// The Revenue app's curtain to the CRM (2026-10-17, #524 — app/shell/ViewSwitchCurtain) lifts only once the CRM says it
// has drawn: `onReady`. Without it every switch holds on the peach curtain until its 6s fallback — about 8s each time —
// and the app's own tests stand a fake CRM in, so only this test sees the real one keep its word.
const net = vi.hoisted(() => ({ fetchCrmData: vi.fn(), loadSnapshot: vi.fn() }));
vi.mock("@/app/(member)/member/crm-actions", () => ({
  fetchCrmData: net.fetchCrmData,
  crmWrite: vi.fn(async () => ({ ok: true, data: null })),
  fetchCrmReplyExamples: vi.fn(async () => null),
}));
vi.mock("./shared/snapshot", () => ({ loadSnapshot: net.loadSnapshot, saveSnapshot: vi.fn() }));

import CrmApp from "./CrmApp";

class NoResize { observe() {} unobserve() {} disconnect() {} }
let land: (r: { ok: true; data: CrmData } | { ok: false; error: string }) => void = () => {};
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  net.fetchCrmData.mockReset().mockImplementation(() => new Promise(resolve => { land = resolve; }));
  net.loadSnapshot.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openOn(kept: CrmData | null) {
  const onReady = vi.fn();
  net.loadSnapshot.mockResolvedValue(kept);
  render(<CrmApp live salesperson="You" onExit={() => {}} onReady={onReady} />);
  await act(async () => {});
  return onReady;
}

describe("the CRM tells the Revenue app's curtain it has drawn", () => {
  it("on the phone's kept copy, before the network answers", async () => {
    const onReady = await openOn(crmDemoData("You"));
    expect(onReady).toHaveBeenCalled();
  });

  it("with nothing kept, once the network's answer lands — not before", async () => {
    const onReady = await openOn(null);
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => { land({ ok: true, data: crmDemoData("You") }); });
    expect(onReady).toHaveBeenCalled();
  });

  it("and when it cannot read: the curtain never holds over the reason", async () => {
    const onReady = await openOn(null);
    await act(async () => { land({ ok: false, error: "Could not load your customers." }); });
    expect(onReady).toHaveBeenCalled();
  });
});
