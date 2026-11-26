import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search), usePathname: () => "/member" }));

import AppLoading from "./AppLoading";

afterEach(cleanup);

// /member while the server loads (2026-10-06, user: not the old "Preparing your
// Revenue workspace…" page): the app's frame on the URL's tab, and one spinner.
const open = (query: string) => {
  search = query;
  return render(<AppLoading />);
};
const tab = (name: string) => screen.getAllByRole("button", { name, hidden: true });

describe("AppLoading — the app's frame while /member loads", () => {
  it("says it is loading, with a spinner where the page will be", () => {
    open("");
    expect(screen.getByRole("status")).toHaveTextContent("Loading your Revenue app…");
    expect(screen.queryByText(/Preparing your Revenue workspace/)).not.toBeInTheDocument();
  });

  it("draws Today's header and lights Today on the bottom bar", () => {
    const { container } = open("");
    // The sidebar's wordmark (desktop) and the phone header's: CSS shows one.
    expect(screen.getAllByText("HOUZS VENTURE", { exact: true })).toHaveLength(2);
    expect(container.querySelectorAll("header")).toHaveLength(2);
    for (const button of tab("Today")) expect(button).toHaveAttribute("aria-current", "page");
  });

  it("keeps to the tab in the URL, with no phone header where the app has none", () => {
    const { container } = open("?page=arena&view=board&board=champ");
    expect(screen.getAllByText("HOUZS VENTURE", { exact: true })).toHaveLength(1);
    expect(container.querySelectorAll("header")).toHaveLength(1);
    for (const button of tab("Arena")) expect(button).toHaveAttribute("aria-current", "page");
    for (const button of tab("Today")) expect(button).not.toHaveAttribute("aria-current");
  });

  it("reads the old links the way the app does (?page=income is Profile)", () => {
    open("?page=income");
    for (const button of tab("Profile")) expect(button).toHaveAttribute("aria-current", "page");
  });

  // The owner, 2026-11-27: "relaod time , change to crm frame" — a reload of the CRM on a computer loads in the CRM's frame.
  it("a reload of the CRM shows the CRM's own frame, at the app's desktop width only", () => {
    const { container } = open("?page=account&view=crm");
    const frame = container.querySelector("[data-crm-desk-loading]");
    expect(frame).not.toBeNull();
    expect(frame).toHaveTextContent("CRM");
    expect(frame).toHaveTextContent("Loading your customers…");
    expect(frame?.parentElement?.className).toMatch(/crmLoadingDesk/);
  });

  it("no other page's loading has it", () => {
    for (const query of ["", "?page=insight", "?page=account", "?page=account&view=memos", "?page=quote"]) {
      const { container } = open(query);
      expect(container.querySelector("[data-crm-desk-loading]")).toBeNull();
      cleanup();
    }
  });

  it("leaves the frame inert and the sidebar without anybody's card", () => {
    const { container } = open("?page=insight");
    const nav = container.querySelector("nav");
    expect(nav?.closest("[inert]")).not.toBeNull();
    expect(container.querySelector("aside")?.closest("[inert]")).not.toBeNull();
    // The wordmark, five places and Notifications — no profile card at the foot (nobody to name yet).
    expect(container.querySelectorAll("aside button")).toHaveLength(7);
  });
});
