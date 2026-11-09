import { describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import CrmApp from "../CrmApp";

vi.mock("@/app/(member)/member/crm-actions", async importOriginal => ({ ...(await importOriginal<object>()), fetchCrmAssignedSince: vi.fn(async () => ({ ok: true, rows: [] })) }));
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
async function tap(el: Element | null | undefined) { fireEvent.click(el!); await act(async () => {}); }

// v4 (notes/17 — frame 2c / 2c·2): People is a button with the filter sheet — teams, then the people of each team picked
// (All = the whole team, or some of them); each pick a removable tag. (Since 2026-11-09 it was one whose-chats dropdown.)
describe("Team inbox › People", () => {
  it("a team picked shows its people; one of them picked shows only theirs; removing the team tag takes them both off", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap([...document.querySelectorAll("nav button, nav [role=button], nav a, nav span")].find(b => b.textContent?.trim() === "Inbox"));
    const total = screen.getByText(/^\d+ chats?$/).textContent;
    await tap(screen.getByRole("button", { name: "People" }));
    const sheet = () => screen.getByRole("dialog", { name: "Filter chats" });
    const btns = () => within(sheet()).getAllByRole("button");
    expect(btns().find(b => /^Everyone\d+$/.test(b.textContent ?? ""))).toHaveAttribute("aria-pressed", "true");
    const team = btns().find(b => /^Team /.test(b.textContent ?? "") || /^Director\d+$/.test(b.textContent ?? ""))!;
    const teamName = team.textContent!.replace(/\d+$/, "");
    await tap(team);
    expect(within(sheet()).getByText(`${teamName} · people`)).toBeTruthy();
    const box = within(sheet()).getByText(`${teamName} · people`).parentElement!;
    const person = within(box).getAllByRole("button").find(b => !/^All\d+$/.test(b.textContent ?? ""))!;
    const name = person.textContent!.replace(/\d+$/, ""), n = Number(person.textContent!.match(/(\d+)$/)![1]);
    await tap(person);
    await tap(within(sheet()).getByRole("button", { name: /^Show \d+ chats?$/ }));
    expect(screen.getByRole("button", { name: "People · 2 picked" })).toBeTruthy();
    expect(screen.getByText(/^\d+ chats?$/).textContent).toBe(`${n} chat${n === 1 ? "" : "s"}`);
    expect(screen.getByRole("button", { name: `Remove ${name}` })).toBeTruthy();
    await tap(screen.getByRole("button", { name: `Remove ${teamName}` }));
    expect(screen.queryByRole("button", { name: `Remove ${name}` })).toBeNull();
    expect(screen.getByRole("button", { name: "People" })).toBeTruthy();
    expect(screen.getByText(/^\d+ chats?$/).textContent).toBe(total);
  });
});
