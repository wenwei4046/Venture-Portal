import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData } from "@/lib/member/types";
import { crmOpenTarget } from "@/lib/push/notices";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// A tapped CRM notice opens `/member?page=account&view=crm&chat=<id>` (lib/push/notices noticeUrl). The app read that
// address in an effect after its first drawing and handed the CRM the chat by a state set there — which on the phone
// reached the CRM only once the app's first reads were all back (2026-10-17, traced on a production build: 11.6 s with
// each read 3 s; the user: "when i press the pop up notification, it wont jump direct to the chat screen"). The CRM is
// handed it from its FIRST drawing now, and the address drops it.
const crm = vi.hoisted(() => ({ opens: [] as unknown[] }));
vi.mock("../crm/CrmApp", () => ({ default: (props: { open?: unknown }) => { crm.opens.push(props.open ?? null); return null; } }));
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
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
vi.mock("@/app/(member)/member/batch-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { crm.opens = []; vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

const member = (): MemberData => ({ ...memberDemo(), demo: false, memos: [], requests: [], incomes: [] });
function source(): RevenueSource {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: member() })), notices: none,
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none, memoReceipts: none,
  };
}

async function openAt(address: string) {
  window.history.replaceState({}, "", address);
  render(<RevenueApp initialData={member()} source={source()} today="2026-10-17" />);
  await act(async () => {});
}

describe("a tapped CRM notice", () => {
  it("hands the CRM its chat from the CRM's first drawing, and the address drops it", async () => {
    await openAt("/member?page=account&view=crm&chat=c-9");
    expect(crm.opens[0]).toEqual({ chat: "c-9" });
    expect(window.location.search).toBe("?page=account&view=crm");
  });

  it("an invitation's notice hands it the notifications", async () => {
    await openAt("/member?page=account&view=crm&crm=notifs");
    expect(crm.opens[0]).toEqual({ notifs: true });
    expect(window.location.search).toBe("?page=account&view=crm");
  });

  it("the CRM opened by hand is handed nothing", async () => {
    await openAt("/member?page=account&view=crm");
    expect(crm.opens.length).toBeGreaterThan(0);
    expect(crm.opens.every(o => o === null)).toBe(true);
  });
});

// A tapped request notice opens `/member?bell=1`: the bell's page was opened by the same kind of effect, and waited the
// same way (4.9 s with one read held 3 s, production). It is open in the app's first drawing now — the server's too.
describe("a tapped request notice", () => {
  /** The notifications page as the app's first drawing has it — always there, `inert` while closed. */
  const notificationsAt = (address: string) => {
    window.history.replaceState({}, "", address);
    const html = renderToString(<RevenueApp initialData={member()} source={source()} today="2026-10-17" />);
    const tag = /<div[^>]*role="dialog"[^>]*aria-label="Notifications"[^>]*>/.exec(html)?.[0] ?? "";
    expect(tag).not.toBe("");
    return tag.includes("inert") ? "closed" : "open";
  };

  it("opens the notifications in the app's first drawing, and the address drops it", async () => {
    expect(notificationsAt("/member?bell=1")).toBe("open");
    await openAt("/member?bell=1");
    expect(window.location.search).toBe("");
  });

  it("an app opened by hand opens on its page", () => {
    expect(notificationsAt("/member")).toBe("closed");
  });
});

// A tapped memo's notice opens `/member?page=account&view=memos&memo=<id>` (before 2026-10-17 `/member?memo=<id>`, which
// named no page). Its page and the memo were opened by an effect and waited the same way — 4.8 s with one read held,
// production — and the address then fell back to `/member` (Next's router put back the address it last knew).
describe("a tapped memo's notice", () => {
  const MEMO = { id: "m-1", title: "Fair dress code", body: "Please read.", sender: "People & Culture", publishedAt: "2026-10-14T02:00:00Z",
    effectiveAt: "2026-10-14", version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments: [] };
  const withMemo = (): MemberData => ({ ...member(), memos: [MEMO] });
  /** The app's first drawing: the page it stands on, and the memo sheet's state ("" when no memo sheet is drawn). */
  const firstDrawing = (address: string) => {
    window.history.replaceState({}, "", address);
    const html = renderToString(<RevenueApp initialData={withMemo()} source={source()} today="2026-10-17" />);
    const sheet = /<div[^>]*role="dialog"[^>]*aria-label="(Fair dress code|Memo)"[^>]*>/.exec(html);
    return { memosPage: html.includes("Memos &amp; notifications"), sheet: sheet ? `${sheet[1]}${sheet[0].includes("inert") ? " (closed)" : ""}` : "" };
  };

  it("draws Profile › Memos with the memo open in the app's first drawing — the old address too", () => {
    expect(firstDrawing("/member?page=account&view=memos&memo=m-1")).toEqual({ memosPage: true, sheet: "Fair dress code" });
    expect(firstDrawing("/member?memo=m-1")).toEqual({ memosPage: true, sheet: "Fair dress code" });
  });

  it("a memo not in the list leaves its page open, and no empty sheet", () => {
    expect(firstDrawing("/member?page=account&view=memos&memo=gone")).toEqual({ memosPage: true, sheet: "Memo (closed)" });
  });

  it("is read once on the screen, and the address keeps its page and drops the memo", async () => {
    for (const address of ["/member?page=account&view=memos&memo=m-1", "/member?memo=m-1"]) {
      const src = source();
      const read = vi.fn(async () => ({ ok: true as const, data: { acknowledgedAt: null } }));
      window.history.replaceState({}, "", address);
      render(<RevenueApp initialData={withMemo()} source={{ ...src, memo: read }} today="2026-10-17" />);
      await act(async () => {});
      expect(read.mock.calls).toEqual([["m-1", false]]);
      expect(window.location.search).toBe("?page=account&view=memos");
      cleanup();
    }
  });
});

describe("crmOpenTarget", () => {
  it("reads the chat, else the notifications, else nothing", () => {
    expect(crmOpenTarget("?page=account&view=crm&chat=abc%201")).toEqual({ chat: "abc 1" });
    expect(crmOpenTarget("?page=account&view=crm&crm=notifs")).toEqual({ notifs: true });
    expect(crmOpenTarget("?page=account&view=crm&crm=other")).toBeNull();
    expect(crmOpenTarget("")).toBeNull();
  });
});
