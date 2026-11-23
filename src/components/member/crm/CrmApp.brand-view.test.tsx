import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";
import type { SourceBrand } from "@/lib/member/crm-source";

// The owner, 2026-11-17: "Dream Crafter view 默认打开 dream crafter 的数据，聊天室等"; 2026-11-23: "IR 的 view 就只可以看到 IR，DC 就只
// 可以看到 DC，同等的 fair 也只能看到 fair" — the Revenue app's view holds the CRM to its own brand (lib/member/crm-view.ts). The
// demo's customers wrote to no number of a brand, so in any view the salesperson's Inbox holds none of them; with no view,
// all of them.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function rows(view: SourceBrand[] | null) {
  window.history.replaceState({}, "", "/member/preview?crmAs=a1");
  const { container, unmount } = render(<CrmApp live={false} salesperson="You" onExit={() => {}} view={view} />);
  await act(async () => {});
  const n = container.querySelectorAll("[data-inbox-row]").length;
  unmount();
  return n;
}

describe("the CRM in a Revenue app view", () => {
  it("holds every chat one may read with no view", async () => {
    expect(await rows(null)).toBeGreaterThan(0);
  });

  it("holds Dream Crafter's chats alone in Dream Crafter's view, The Conts' alone in IR's", async () => {
    expect(await rows(["dc"])).toBe(0);
    expect(await rows(["conts"])).toBe(0);
  });

  it("holds nothing in Fair's view — Fair has no number or Page yet", async () => {
    expect(await rows([])).toBe(0);
  });
});
