import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// The owner, 2026-11-27, a reload of the CRM on a computer: "跳出来一个像中间的电话 screen 这样闪过零点几秒". The app
// cannot know its own width before its scripts run, so the server — and the page until then — drew the CRM as a phone,
// which crm.module.css shows on a wide window as a 430px phone in the middle of the page (traced on production: the
// phone for ~60 ms in headless Chrome, longer on a real machine, then the desktop CRM). Now that drawing carries
// `data-crm-unmeasured`, which a computer's layout hides, and the app measures itself before its first paint.
vi.mock("../crm/CrmApp", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return { default: (p: { desk?: boolean }) => React.createElement("div", { "data-fake-crm": p.desk ? "desk" : "phone" }) };
});
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
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
vi.mock("@/app/(member)/member/batch-actions", () => ({}));
vi.mock("@/app/(member)/member/comm-ratio-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); window.history.replaceState({}, "", "/member?page=account&view=crm"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });

const member = (): MemberData => ({ ...memberDemo(), demo: false, memos: [], requests: [], incomes: [] });
function source(): RevenueSource {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: member() })), notices: none,
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none, memoReceipts: none,
  };
}
const app = () => <RevenueApp initialData={member()} source={source()} today="2026-11-27" />;

/** The app's own box as wide as `width` (the window, in the live app); everything else 0, as happy-dom draws it. */
function appWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const w = this.hasAttribute("data-revenue-app") ? width : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: 0, width: w, height: 0, toJSON: () => ({}) } as DOMRect;
  });
}

describe("the CRM's first paint", () => {
  it("the server's drawing is the phone's, marked unmeasured", () => {
    const html = renderToString(app());
    expect(html).toMatch(/<div[^>]*data-crm-unmeasured=""[^>]*><div data-fake-crm="phone"><\/div><\/div>/);
  });

  it("on a computer the app measures itself before its first paint: the desktop CRM, nothing marked", async () => {
    appWidth(1440);
    const { container } = render(app());
    await act(async () => {});
    expect(container.querySelector('[data-fake-crm="desk"]')).not.toBeNull();
    expect(container.querySelector('[data-fake-crm="phone"]')).toBeNull();
    expect(container.querySelector("[data-crm-unmeasured]")).toBeNull();
  });

  it("on a phone it stays the phone's CRM, shown", async () => {
    appWidth(390);
    const { container } = render(app());
    await act(async () => {});
    expect(container.querySelector('[data-fake-crm="phone"]')).not.toBeNull();
    expect(container.querySelector("[data-crm-unmeasured]")).toBeNull();
  });

  it("only a computer's layout hides the unmeasured drawing; a phone's shows it from the first paint", () => {
    const css = readFileSync(join(process.cwd(), "src/components/member/app/shell.module.css"), "utf8");
    const start = css.indexOf("@container rv (min-width: 1024px) {");
    expect(start).toBeGreaterThan(-1);
    let depth = 0, end = start;
    for (let i = css.indexOf("{", start); i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) { end = i; break; }
    }
    const desk = css.slice(start, end), rest = css.slice(0, start) + css.slice(end);
    expect(desk).toMatch(/\.main \[data-crm-unmeasured\] \{ visibility: hidden; \}/);
    expect(rest).not.toContain("data-crm-unmeasured]");
  });
});
