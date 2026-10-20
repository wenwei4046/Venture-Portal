import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { protoData, protoFixture } from "./fixtures/proto";
import RevenueApp from "./RevenueApp";

// Today's CRM chat button (2026-10-14 — the "Revenue app refresh" handoff §2; the user: the header stays Today's, its
// number the customers' messages not read yet): it opens the CRM, and the CRM's way out leads back to Today. Profile's
// My leads & appointments, a second way in until 2026-10-20, is gone (the user: "这个我们不用留了，帮我 delete 掉").
vi.mock("next/navigation", () => ({
  usePathname: () => "/member/preview",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
vi.mock("../crm/CrmApp", () => ({ default: ({ onExit }: { onExit: () => void }) => <button onClick={onExit}>Leave the CRM</button> }));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const view = () => new URLSearchParams(window.location.search).get("view");
const page = () => new URLSearchParams(window.location.search).get("page");
async function open(search: string, crm = true) {
  window.history.replaceState({}, "", `/member/preview${search}`);
  render(<RevenueApp initialData={protoData()} initialSearch={search} today="2026-10-03" fixture={protoFixture()} crm={crm} />);
  await act(async () => {});
}

describe("Today's CRM chat button", () => {
  it("is in Today's header with the unread messages, and opens the CRM", async () => {
    await open("");
    const button = screen.getByRole("button", { name: "Open CRM" });
    expect(button).toHaveTextContent("4");
    fireEvent.click(button);
    await act(async () => {});
    expect([page(), view()]).toEqual(["account", "crm"]);
    // Out of the CRM: back where it was opened.
    fireEvent.click(screen.getByRole("button", { name: "Leave the CRM" }));
    await act(async () => {});
    expect([page(), view()]).toEqual([null, null]);
    expect(screen.getByRole("button", { name: "Open CRM" })).toBeInTheDocument();
  });

  it("Profile has no My leads & appointments any more — and a CRM a tapped notice opened leads home", async () => {
    await open("?page=account");
    expect(screen.getByRole("button", { name: /Memos & notifications/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /My leads & appointments/ })).not.toBeInTheDocument();
    cleanup();
    await open("?page=account&view=crm");
    fireEvent.click(screen.getByRole("button", { name: "Leave the CRM" }));
    await act(async () => {});
    expect([page(), view()]).toEqual([null, null]);
  });

  it("only in Today's header: not over the Quote's second step, the Arena, nor for an account outside the CRM", async () => {
    await open("?page=calc");
    expect(screen.queryByRole("button", { name: "Open CRM" })).not.toBeInTheDocument();
    cleanup();
    await open("?page=arena");
    expect(screen.queryByRole("button", { name: "Open CRM" })).not.toBeInTheDocument();
    cleanup();
    await open("", false);
    expect(screen.queryByRole("button", { name: "Open CRM" })).not.toBeInTheDocument();
    // The capsule as it was: Fair ▾ · bell · avatar.
    expect(document.querySelector("[class*=capsuleWithCrm]")).toBeNull();
    expect(document.querySelector("[class*=_capsule_]")).not.toBeNull();
  });
});
