import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import type { CrmData } from "@/lib/member/crm-data";

// A tapped phone notice opens its chat (2026-10-17 — the user: "when i press the pop up notification, it wont jump
// direct to the chat screen"). The CRM opens on the phone's kept copy of its last answer and reads the network behind it
// (shared/snapshot.ts); a chat that copy does not have yet — a new lead's first message, a customer handed over since —
// was given up on the copy, before the network's answer could bring it. On the demo's data, as "a1" (their own chats).
const net = vi.hoisted(() => ({ fetchCrmData: vi.fn(), loadSnapshot: vi.fn() }));
vi.mock("@/app/(member)/member/crm-actions", () => ({
  fetchCrmData: net.fetchCrmData,
  crmWrite: vi.fn(async () => ({ ok: true, data: null })),
  fetchCrmReplyExamples: vi.fn(async () => null),
}));
vi.mock("./shared/snapshot", () => ({ loadSnapshot: net.loadSnapshot, saveSnapshot: vi.fn() }));

import CrmApp from "./CrmApp";

class NoResize { observe() {} unobserve() {} disconnect() {} }
let land: (r: { ok: true; data: CrmData }) => void = () => {};
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResize);
  net.fetchCrmData.mockReset().mockImplementation(() => new Promise(resolve => { land = resolve; }));
  net.loadSnapshot.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const FULL = crmDemoData("You");
/** Ahmad Faizal's chat (l2): its first reply is drawn only inside the chat — the Inbox shows the last line. */
const INSIDE = /Which colour are you looking for\?/;
const without = (id: string): CrmData => ({ ...FULL, customers: FULL.customers.filter(c => c.id !== id) });

async function openOn(kept: CrmData | null) {
  net.loadSnapshot.mockResolvedValue(kept);
  render(<CrmApp live salesperson="You" onExit={() => {}} open={{ chat: "l2" }} />);
  await act(async () => {});
}

describe("a tapped notice opens its chat", () => {
  it("a chat the phone's kept copy lacks opens when the network's answer brings it", async () => {
    await openOn(without("l2"));
    expect(screen.queryByText(INSIDE)).toBeNull();
    await act(async () => { land({ ok: true, data: FULL }); });
    expect(screen.getByText(INSIDE)).toBeTruthy();
  });

  it("a chat in the kept copy opens at once, before the network answers", async () => {
    await openOn(FULL);
    expect(screen.getByText(INSIDE)).toBeTruthy();
  });

  it("with nothing kept, it opens on the network's answer", async () => {
    await openOn(null);
    await act(async () => { land({ ok: true, data: FULL }); });
    expect(screen.getByText(INSIDE)).toBeTruthy();
  });

  it("a chat the network's answer lacks too is let go — the Inbox stays", async () => {
    await openOn(without("l2"));
    await act(async () => { land({ ok: true, data: without("l2") }); });
    expect(screen.queryByText(INSIDE)).toBeNull();
    expect(screen.getAllByText("Inbox").length).toBeGreaterThan(0);
  });
});
