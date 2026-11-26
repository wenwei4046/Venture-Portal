import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, MemberMembership } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// The owner, 2026-11-27, circling the bell on the phone CRM's Inbox: "change this icon of notification with change view, for ir
// & dc ( those have crm servcice connected )". The Revenue app hands the CRM IR ⇄ DC — the views with a CRM of their own —
// and a tap moves the app to the other view as its sub-department sheet does, the CRM still open.
const crm = vi.hoisted(() => ({ calls: [] as { viewSwap: { label: string; to: string; swap: () => void } | null; viewSub: string | null }[] }));
vi.mock("../crm/CrmApp", () => ({
  default: (props: { viewSwap?: { label: string; to: string; swap: () => void } | null; viewSub?: string | null }) => {
    crm.calls.push({ viewSwap: props.viewSwap ?? null, viewSub: props.viewSub ?? null });
    return null;
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return { realtime: { setAuth: async () => {} }, channel: () => channel, removeChannel: async () => "ok" };
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));
vi.mock("@/app/(member)/member/share-actions", () => ({}));
vi.mock("@/app/(member)/member/not-mine-actions", () => ({}));
vi.mock("@/app/(member)/member/comm-ratio-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
vi.mock("@/app/(member)/member/batch-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { crm.calls = []; vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

const demo = memberDemo();
const fair = demo.memberships.find(m => m.id === "fair")!;
const ir = demo.memberships.find(m => m.id === "ir")!;
// Held in the CRM alone, as HECTOR's and LIM YAU WEI's DC is (crm.md › EVERY VIEW ITS OWN CRM).
const dc: MemberMembership = { ...ir, id: "dc", schemeId: "dc-scheme", name: "Dream Crafter", code: "DC", crm: true };
const member = (memberships: MemberMembership[]): MemberData => ({ ...demo, demo: false, memos: [], requests: [], incomes: [], memberships });
function source(data: MemberData): RevenueSource {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data })), notices: none,
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none, memoReceipts: none,
  };
}
async function openCrm(department: string, memberships: MemberMembership[]) {
  window.history.replaceState({}, "", `/member?page=account&view=crm&department=${department}`);
  const data = member(memberships);
  render(<RevenueApp initialData={data} source={source(data)} today="2026-11-27" />);
  await act(async () => {});
}
const last = () => crm.calls[crm.calls.length - 1];
const query = () => new URLSearchParams(window.location.search);

describe("the CRM's IR ⇄ DC", () => {
  it("in IR with DC too: IR, to DC; a tap moves the app to DC with the CRM still open, and the switch turns round", async () => {
    await openCrm("ir", [fair, ir, dc]);
    expect(last().viewSub).toBe("ir");
    expect(last().viewSwap).toMatchObject({ label: "IR", to: "DC" });
    await act(async () => { last().viewSwap!.swap(); });
    expect(query().get("department")).toBe("dc");
    expect(query().get("view")).toBe("crm");
    expect(last().viewSub).toBe("dc");
    expect(last().viewSwap).toMatchObject({ label: "DC", to: "IR" });
  });

  it("reads IR by its name where its code is empty, as on production", async () => {
    await openCrm("ir", [fair, { ...ir, code: "" }, dc]);
    expect(last().viewSwap).toMatchObject({ label: "IR", to: "DC" });
  });

  it("is none with one CRM view, or in Fair's", async () => {
    await openCrm("ir", [fair, ir]);
    expect(crm.calls.length).toBeGreaterThan(0);
    expect(crm.calls.every(c => c.viewSwap === null)).toBe(true);
    cleanup();
    crm.calls = [];
    await openCrm("fair", [fair, ir, dc]);
    expect(crm.calls.length).toBeGreaterThan(0);
    expect(crm.calls.every(c => c.viewSwap === null)).toBe(true);
  });
});
