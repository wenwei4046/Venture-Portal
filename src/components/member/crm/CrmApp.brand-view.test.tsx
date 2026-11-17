import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";

// The owner, 2026-11-17: "Dream Crafter view 默认打开 dream crafter 的数据，聊天室等" — the Revenue app's Dream Crafter
// view opens the CRM on Dream Crafter's customers alone. The demo's customers wrote to no number of a brand, so in
// Dream Crafter's view the salesperson's Inbox holds none of them.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function rows(brand: "dc" | null) {
  window.history.replaceState({}, "", "/member/preview?crmAs=a1");
  const { container, unmount } = render(<CrmApp live={false} salesperson="You" onExit={() => {}} brand={brand} />);
  await act(async () => {});
  const n = container.querySelectorAll("[data-inbox-row]").length;
  unmount();
  return n;
}

describe("the CRM in a Revenue app view", () => {
  it("holds every brand's chats in any view but Dream Crafter's", async () => {
    expect(await rows(null)).toBeGreaterThan(0);
  });

  it("holds Dream Crafter's chats alone in Dream Crafter's view", async () => {
    expect(await rows("dc")).toBe(0);
  });
});
