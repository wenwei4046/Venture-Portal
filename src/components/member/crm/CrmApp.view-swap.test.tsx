import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";
// Renders the whole CrmApp: slow under the full suite's parallel load (passes alone in ~1 s).
vi.setConfig({ testTimeout: 20_000 });

// The owner, 2026-11-27, circling the bell on the phone CRM's Team Inbox: "change this icon of notification with change view,
// for ir & dc ( those have crm servcice connected )". With both CRM views the Revenue app hands the CRM `viewSwap`, and both
// Inboxes — Team's and Mine's — draw IR ⇄ DC where the bell was; without it, the bell as before. A new view takes the old
// view's Inbox filters with it (its ads, its teams), never the statuses.
vi.mock("@/app/(member)/member/crm-actions", () => ({ fetchAdInsights: vi.fn(), fetchAdDaily: vi.fn() }));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
async function tap(el: Element | null | undefined) { fireEvent.click(el!); await act(async () => {}); }

type Props = Partial<Parameters<typeof CrmApp>[0]>;
const app = (props: Props) => <CrmApp live={false} salesperson="You" onExit={() => {}} {...props} />;
async function at(crmAs: string, props: Props = {}) {
  window.history.replaceState({}, "", `/member/preview?crmAs=${crmAs}`);
  const r = render(app(props));
  await act(async () => {});
  return r;
}
/** The Principal's Team side opens on Insight: its Inbox is a tap away. */
async function teamInbox(props: Props = {}) {
  const r = await at("boss", props);
  await tap(screen.getAllByText("Inbox", { exact: true }).find(e => e.closest("nav")));
  return r;
}
const bell = () => screen.queryByRole("button", { name: /^Notifications/ });
const swapBtn = () => screen.queryByRole("button", { name: "IR view · switch to DC" });
const countLine = () => screen.getByText(/^\d+ chats?$/).textContent;

describe("IR ⇄ DC in the bell's place", () => {
  it("Team's Inbox: the view one is in, a swap badge, no bell; a tap moves the view", async () => {
    const swap = vi.fn();
    await teamInbox({ viewSwap: { label: "IR", to: "DC", swap } });
    expect(swapBtn()).not.toBeNull();
    expect(swapBtn()!.textContent).toBe("IR");
    expect(swapBtn()!.querySelector("svg")).not.toBeNull();
    expect(bell()).toBeNull();
    // Team | Mine and Contacts keep their places beside it.
    expect(screen.getByRole("button", { name: "Contacts" })).toBeTruthy();
    await tap(swapBtn());
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("Mine's Inbox: the same, the house still beside it", async () => {
    const swap = vi.fn();
    await at("a1", { viewSwap: { label: "IR", to: "DC", swap } });
    expect(swapBtn()!.textContent).toBe("IR");
    expect(bell()).toBeNull();
    expect(screen.getByRole("button", { name: "Back to Revenue app" })).toBeTruthy();
    await tap(swapBtn());
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it("with one CRM view (no viewSwap) both Inboxes keep the bell", async () => {
    await teamInbox();
    expect(bell()).not.toBeNull();
    expect(document.querySelector("[data-view-swap]")).toBeNull();
    cleanup();
    await at("a1");
    expect(bell()).not.toBeNull();
    expect(document.querySelector("[data-view-swap]")).toBeNull();
  });
});

describe("a new view takes the old view's Inbox filters with it", () => {
  it("Mine: the ads picked go back to All ads", async () => {
    const r = await at("a1", { viewSub: "ir" });
    await tap(screen.getByRole("button", { name: /All ads/ }));
    const sheet = screen.getByText("Choose an ad").closest("div")!.parentElement!;
    const row = [...sheet.children].filter(el => el.tagName === "DIV")[1].querySelector(":scope > div")!;
    const ad = row.querySelectorAll("span")[2].textContent!;
    await tap(row);
    await tap(within(sheet).getByText(/^Save · /));
    expect(screen.getByRole("button", { name: new RegExp(ad.split(" · ")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /All ads/ })).toBeNull();
    r.rerender(app({ viewSub: "dc" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: /All ads/ })).toBeTruthy();
  });

  it("Team: the people picked go, the statuses stay", async () => {
    const r = await teamInbox({ viewSub: "ir" });
    const total = countLine();
    await tap(screen.getByRole("button", { name: "People" }));
    const sheet = () => screen.getByRole("dialog", { name: "Filter chats" });
    const team = within(sheet()).getAllByRole("button").find(b => /^Team /.test(b.textContent ?? "") || /^Director\d+$/.test(b.textContent ?? ""))!;
    await tap(team);
    await tap(within(sheet()).getAllByRole("button").find(b => /^Follow up\d+$/.test(b.textContent ?? "")));
    await tap(within(sheet()).getByRole("button", { name: /^Show \d+ chats?$/ }));
    expect(screen.getByRole("button", { name: "People · 1 picked" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Status · 1 picked" })).toBeTruthy();
    r.rerender(app({ viewSub: "dc" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "People" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Status · 1 picked" })).toBeTruthy();
    // Only the status narrows now.
    await tap(screen.getByRole("button", { name: "Remove Follow up" }));
    expect(countLine()).toBe(total);
  });
});
