/**
 * The owner, 2026-11-09: "我点了 team activity，也做了一些筛选条件，等我看完聊天记录返回时，要一样的筛选条件 不要重新来过".
 */
import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";
import type { CrmData, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "./people-book";
import { forgetActivityFilters, useTeamActivity } from "./use-team-activity";
import type { ActivityVM } from "./team-activity";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl")];
const d = { people, customers: [], visits: [], events: [], leaves: [], ftRules: [], lockedStaff: [], settings: DEFAULT_CRM_SETTINGS, can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;
const book = peopleBook(d, [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }], []);
let v: ActivityVM;
function Page() { v = useTeamActivity({ data: d, book, live: false, who: null, nameOf: () => "", roleOf: () => "", openChat: () => {} }); return null; }

describe("Team activity keeps its filters across a chat", () => {
  it("comes back with the period, the ad, the person and the open rows it had — menus shut", async () => {
    forgetActivityFilters();
    const first = render(<Page />);
    await act(async () => { v.periods.find(p => p.label === "Month")!.go(); });
    await act(async () => { v.setAd({ target: { value: "AD1" } }); });
    await act(async () => { v.menu.find(m => m.label === "Chea Huan")!.go(); });
    await act(async () => { v.toggleMenu(); });
    first.unmount(); // a chat takes the screen
    render(<Page />);
    expect(v.perVal).toBe("Month");
    expect(v.adVal).toBe("AD1");
    expect(v.selLabel).toBe("");               // nameOf here answers "" — the pick is Chea Huan's id
    expect(v.groups.flatMap(g => g.rows).map(r => r.id)).toEqual(["a"]);
    expect(v.menuOpen).toBe(false);
  });
});
