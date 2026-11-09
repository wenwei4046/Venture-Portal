/**
 * The owner, 2026-11-09, on the desktop's Team activity: "对齐；展开后无法收起；灰色的放下面（默认收起）". The figures stand
 * over the table's columns, a row opens and closes, and the greyed people sit folded under "Not in turn N".
 */
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { CrmData, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "../shared/people-book";
import { activityVM, type ActivityUi } from "../shared/team-activity";
import { DeskTeamActivityView } from "./DeskTeamActivity";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Alvin", "tl")];
const d = { people, customers: [], visits: [], events: [], leaves: [], ftRules: [], lockedStaff: ["b"], settings: DEFAULT_CRM_SETTINGS,
  can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;
const teams = [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }];

function Harness() {
  const [ui, setUi] = useState<ActivityUi>({ team: "all", who: null, menu: false, per: "Today", from: "2026-11-01", to: "2026-11-06", open: {}, lead: null, sort: null, pMenu: false, pOpen: {}, pLead: null });
  const set = (p: Partial<ActivityUi> | ((u: ActivityUi) => Partial<ActivityUi>)) => setUi(u => ({ ...u, ...(typeof p === "function" ? p(u) : p) }));
  const v = activityVM({ data: d, book: peopleBook(d, teams, []), rows: [], now: new Date("2026-11-06T10:00:00+08:00"), ui, set, nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} });
  return <DeskTeamActivityView v={v} />;
}

describe("Team activity on the desktop", () => {
  it("folds the greyed people under Not in turn, and a row closes again", async () => {
    render(<Harness />);
    expect(screen.getByText("Chea Huan")).toBeInTheDocument();
    expect(screen.queryByText("Alvin")).toBeNull();
    const fold = screen.getByText(/Not in turn/).closest("[role=button]")!;
    expect(fold).toHaveAttribute("aria-expanded", "false");
    await act(async () => { fireEvent.click(fold); });
    expect(screen.getByText("Alvin")).toBeInTheDocument();
    const row = screen.getByText("Chea Huan").closest("[aria-expanded]")!;
    await act(async () => { fireEvent.click(row); });
    expect(row).toHaveAttribute("aria-expanded", "true");
    await act(async () => { fireEvent.click(row); });
    expect(row).toHaveAttribute("aria-expanded", "false");
  });
});
