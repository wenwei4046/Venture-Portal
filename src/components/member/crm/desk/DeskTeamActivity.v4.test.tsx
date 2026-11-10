/**
 * v4 notes/22 (frames D4a + D4b): Team activity on the desktop is one list, leads high → low, the top 6 then
 * "Show N more"; a lead opens the 420 px drawer and the table tightens to 230 / 160 px with a 452 px right padding;
 * ‹ › steps through the person's leads; Esc closes and gives the table its width back.
 */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CrmCustomer, CrmData, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "../shared/people-book";
import { activityVM, type ActivityUi, type AssignedRow } from "../shared/team-activity";
import { ACT_COLS, ACT_COLS_TIGHT, DeskTeamActivityView } from "./DeskTeamActivity";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const names = ["Aina", "Bala", "Chen", "Dina", "Eva", "Faiz", "Gita", "Hana"];
const people = [P("tl", "Stanley", null, "tl"), ...names.map((n, i) => P(`p${i}`, n, "tl"))];
// p0 gets 3 leads, p1..p7 one each (p7 none): eight people with leads → top 6 + "Show 2 more".
const cust = (id: string, name: string): CrmCustomer => ({ id, name, channel: "whatsapp", messages: [], status: "new", createdAt: "2026-11-06T00:00:00Z", adId: null, ad: "" } as unknown as CrmCustomer);
const customers: CrmCustomer[] = [cust("c0", "Grace Lee"), cust("c1", "Tan Wei Ming"), cust("c2", "Nurul Huda"), ...names.slice(1, 7).map((n, i) => cust(`d${i}`, `Lead ${n}`))];
const rows: AssignedRow[] = [
  { contact_id: "c0", actor: null, data: { to: "p0" }, at: "2026-11-06T00:40:00Z" },
  { contact_id: "c1", actor: null, data: { to: "p0" }, at: "2026-11-06T01:12:00Z" },
  { contact_id: "c2", actor: null, data: { to: "p0" }, at: "2026-11-06T01:30:00Z" },
  ...names.slice(1, 7).map((_, i) => ({ contact_id: `d${i}`, actor: null, data: { to: `p${i + 1}` }, at: "2026-11-06T01:00:00Z" })),
];
const d = { people, customers, visits: [], events: [], leaves: [], ftRules: [], lockedStaff: [], settings: DEFAULT_CRM_SETTINGS,
  can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;
const teams = [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }];

function Harness() {
  const [ui, setUi] = useState<ActivityUi>({ team: "all", who: null, menu: false, per: "Today", from: "2026-11-01", to: "2026-11-06", open: {}, lead: null, sort: null, pMenu: false, pOpen: {}, pLead: null });
  const set = (p: Partial<ActivityUi> | ((u: ActivityUi) => Partial<ActivityUi>)) => setUi(u => ({ ...u, ...(typeof p === "function" ? p(u) : p) }));
  const v = activityVM({ data: d, book: peopleBook(d, teams, []), rows, now: new Date("2026-11-06T10:00:00+08:00"), ui, set, nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} });
  return <DeskTeamActivityView v={v} />;
}
const order = () => [...document.querySelectorAll("[data-act-person]")].map(e => e.getAttribute("data-act-person"));

describe("Team activity, D4a + D4b", () => {
  it("one list, leads high → low, the top 6 then Show N more", async () => {
    render(<Harness />);
    expect(order()[0]).toBe("p0");
    expect(order()).toHaveLength(6);
    await act(async () => { fireEvent.click(screen.getByText((_, el) => el?.getAttribute("role") === "button" && /^Show \d+ more$/.test(el.textContent ?? ""))); });
    expect(order().length).toBeGreaterThan(6);
    // The header: sentence case, Name indented 23 px, Leads sorted (default) in ink.
    expect(screen.getByText("Name").style.paddingLeft).toBe("23px");
    expect(screen.getByText("Leads ↓")).toBeInTheDocument();
  });

  it("a lead opens the drawer; the table tightens and ‹ › steps; Esc closes", async () => {
    render(<Harness />);
    const head = document.querySelector("[data-act-head]") as HTMLElement, scroll = document.querySelector("[data-act-scroll]") as HTMLElement;
    expect(head.style.gridTemplateColumns).toBe(ACT_COLS);
    await act(async () => { fireEvent.click(screen.getByText("Aina")); });
    expect(screen.getByText("Nurul Huda")).toBeInTheDocument(); // newest first
    await act(async () => { fireEvent.click(screen.getByText("Nurul Huda")); });
    const drawer = document.querySelector("[data-act-drawer]") as HTMLElement;
    expect(drawer).toBeTruthy();
    expect(drawer.style.width).toBe("420px");
    expect(head.style.gridTemplateColumns).toBe(ACT_COLS_TIGHT);
    expect(scroll.style.padding).toContain("452px");
    expect(drawer.textContent).toContain("1 / 3");
    // The open lead's name is rust in the list.
    expect((document.querySelector("[data-act-lead] span") as HTMLElement).style.color).toBe("var(--crm-rust)");
    await act(async () => { fireEvent.click(screen.getByLabelText("Next lead")); });
    expect(document.querySelector("[data-act-drawer]")!.textContent).toContain("2 / 3");
    expect(document.querySelector("[data-act-drawer]")!.textContent).toContain("Tan Wei Ming");
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(document.querySelector("[data-act-drawer]")).toBeNull();
    expect(head.style.gridTemplateColumns).toBe(ACT_COLS);
    expect(scroll.style.padding).not.toContain("452px");
  });
});
