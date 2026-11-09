// v4 D5a (docs/design_handoff_crm_redesign_v4, notes/24): the Inbox's list — People / Status as the phone's 2c (several at
// once, removable tags, "N chats of M"), rows as 2d (the wait on line 1, owner · ad on line 2, no urgency line).
import { describe, expect, it, vi } from "vitest";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import { teamsOf } from "../../panel/vm/common";
import { initialDeskUi, type DeskCtx, type DeskUi } from "./ctx";
import { inboxVM, joinPicked, stPicked } from "./inbox";
import { chatRows } from "./data";
import { FB_BLOCKED } from "../../shared/fb-blocked";

const KNOWN = ["All", "New", "Attention", "Follow up", "Appointment", "Won", "Lost", "Cold leads", "Blocked"];

function ctxOf(ui: Partial<DeskUi> = {}) {
  const data = crmDemoData();
  const teams = teamsOf(data), patch = vi.fn(), set = vi.fn();
  const me = data.people.find(p => p.role === "boss") ?? data.people[0];
  const ctx = { data, me, now: new Date(), live: false, ui: { ...initialDeskUi(), tab: "inbox", ...ui }, set, patch, teams, directors: data.people.filter(p => p.role === "hod"),
    nameOf: (id: string | null | undefined) => data.people.find(p => p.id === id)?.name ?? "", W: 1440, H: 900, slotCounts: {} } as unknown as DeskCtx;
  return { ctx, patch, set, data };
}

describe("the Inbox's Status picks", () => {
  it("reads several statuses from inbF and drops anything unknown; none is All", () => {
    expect(stPicked("All", KNOWN)).toEqual([]);
    expect(stPicked("Follow up,Won,Nope,Won", KNOWN)).toEqual(["Follow up", "Won"]);
    expect(stPicked("Lost", KNOWN)).toEqual(["Lost"]);
    expect(joinPicked([])).toBe("All");
    expect(joinPicked(["New", "Won"])).toBe("New,Won");
  });
});

describe("the Inbox's list (D5a)", () => {
  it("shows only the statuses picked, and says how many of how many", () => {
    const { ctx } = ctxOf({ inbF: "Follow up,Won" });
    const L = inboxVM(ctx).list4;
    const keys = new Map(chatRows(ctx).map(r => [r.id, r.key]));
    expect(L.rows.length).toBeGreaterThan(0);
    expect(L.rows.every(r => ["Follow up", "Won"].includes(keys.get(r.id)!))).toBe(true);
    expect(L.filter.statusN).toBe(2);
    expect(L.filter.shownN).toBe(L.rows.length);
    expect(L.filter.chips.map(c => c.label)).toEqual(["Follow up", "Won"]);
    expect(L.filter.totalN).toBeGreaterThanOrEqual(L.rows.length);
  });

  it("applies People and Status together, counts a draft before it is applied, and clears both", () => {
    const { ctx, patch } = ctxOf();
    const L = inboxVM(ctx).list4;
    const team = L.filter.teams.find(t => t.val)!;
    const n = L.filter.count([team.val!], ["Follow up"]);
    expect(n).toBeLessThanOrEqual(L.filter.count([], []));
    L.filter.apply([team.val!], ["Follow up"]);
    expect(patch).toHaveBeenCalledWith({ whoSel: [team.val!], inbF: "Follow up", whoOpen: false });
    L.filter.clear();
    expect(patch).toHaveBeenLastCalledWith({ whoSel: [], inbF: "All", ibLabel: null });
    // With a team picked, its chip removes it.
    const { ctx: c2, set } = ctxOf({ whoSel: [team.val!] });
    const chip = inboxVM(c2).list4.filter.chips[0];
    expect(chip.label).toBe(team.label);
    chip.remove();
    expect(set).toHaveBeenCalled();
  });

  it("each row: the wait instead of the time when the chat waits, owner and ad on line 2, no urgency line", () => {
    const { ctx, data } = ctxOf();
    const rows = inboxVM(ctx).list4.rows;
    for (const r of rows) {
      expect(r.note).toBe(r.blocked ? FB_BLOCKED : "");
      expect(typeof r.ownerDot).toBe("string");
      expect(r.ad.length).toBeGreaterThan(0);
      if (r.wait) expect(r.wait.text).toMatch(/^\d+ h$/);
    }
    // Every customer waiting past the first reply line shows its wait.
    const waiting = chatRows(ctx).filter(x => ["Overdue", "Urgent", "Reply soon"].includes(x.key)).map(x => x.id);
    expect(rows.filter(r => waiting.includes(r.id)).every(r => !!r.wait)).toBe(true);
    void data;
  });
});
