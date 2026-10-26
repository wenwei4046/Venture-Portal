import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";
import { tickPathOf } from "../shared/chat-media";
import { failNote } from "../sales/vm/chat";

// A message WhatsApp refused, in both chats (2026-10-17 — the owner: two videos filmed with the CRM's camera on Android
// showed in the Team chat as sent, two ticks and nothing more, while Mine's on the iPhone said "Not delivered"; the other
// phone never got them). On the demo's data with Lim Wei Jie's first reply refused as Meta refused those (131053).
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
vi.mock("@/lib/member/crm-demo-data", async importOriginal => {
  const real = await importOriginal<typeof import("@/lib/member/crm-demo-data")>();
  return {
    ...real,
    crmDemoData: (...a: Parameters<typeof real.crmDemoData>) => {
      const d = real.crmDemoData(...a);
      return { ...d, customers: d.customers.map(c => (c.name !== "Lim Wei Jie" ? c : {
        ...c, messages: c.messages.map(m => (m.from === "me" && m.text.startsWith("We have a few firm models") ? { ...m, status: "failed" as const, error: "131053 Media upload error" } : m)),
      })) };
    },
  };
});

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}
/** The refused reply's bubble in the open chat. */
const refused = () => screen.getByText(/We have a few firm models/).closest<HTMLElement>("main[data-chat-screen] [data-chat-list] > div")!;
const NOTE = failNote("131053 Media upload error");

/** The board shows one status at a time (2026-10-24): step through the status tabs until `name` shows. */
async function toCustomer(name: string) {
  const tabs = [...document.querySelectorAll<HTMLElement>("span")].filter(e => e.style.borderBottom && /^(New|Attention|Follow up|Appointment|Won|Lost|Cold leads)/.test(e.textContent ?? ""));
  for (const t of tabs) { if (screen.queryAllByText(name, { exact: true }).length) break; fireEvent.click(t); await act(async () => {}); }
}

describe("a message WhatsApp refused", () => {
  it("says so under its time in the Team chat — a ! where the ticks were, and why", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getAllByText("Inbox", { exact: true }).find(e => e.closest("nav")) ?? null);
    await toCustomer("Lim Wei Jie");
    await tap(screen.getAllByText("Lim Wei Jie", { exact: true })[0]);
    expect(refused().textContent).toContain(NOTE);
    expect(refused().querySelector("svg path")?.getAttribute("d")).toBe(tickPathOf("failed"));
    expect(screen.getByText(NOTE).style.color).toBe("var(--crm-page)");
  });

  it("says so in Mine's chat too, in white on its orange", async () => {
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await toCustomer("Lim Wei Jie");
    await tap(screen.getAllByText("Lim Wei Jie", { exact: true })[0]);
    expect(refused().textContent).toContain(NOTE);
    expect(refused().querySelector('svg[aria-label="Not delivered"] path')?.getAttribute("d")).toBe(tickPathOf("failed"));
    expect(screen.getByText(NOTE).style.color).toBe("var(--crm-page)");
  });
});

describe("the mark after your own message's time", () => {
  it("is a clock while it goes, a ! when it did not reach the customer, else the two ticks", () => {
    expect(tickPathOf("sending")).toContain("a4.3 4.3");
    expect(tickPathOf("failed")).toContain("a4.5 4.5");
    for (const s of ["sent", "delivered", "read", undefined]) expect(tickPathOf(s)).toBe("M1 6l3 3 6-7M7 8.5l.5.5 6-7");
  });
});
