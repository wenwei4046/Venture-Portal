import { describe, expect, it } from "vitest";
import type { CrmPerson } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";
import { leaderAssignees } from "./inbox";

// A leader's Assign to on the desktop (2026-10-27, the owner: "2 要"): Mine's and the phone Team side's rule — a TL / STL /
// TA gives a customer of their line to their own people in its team; CRM · Manage keeps everybody (crm_send_to).
const P = (id: string, role: CrmPerson["role"], uplineId: string | null) => ({ id, name: id.toUpperCase(), role, uplineId, fullTime: true }) as CrmPerson;
const people = [P("boss", "boss", null), P("tl", "tl", null), P("ta", "ta", "tl"), P("rs1", "rs", "ta"), P("rs2", "rs", "tl"), P("tl2", "tl", null), P("rs3", "rs", "tl2")];
const ctx = (me: string, manage = false) => ({ me: people.find(p => p.id === me)!, data: { can: { manage }, people } }) as unknown as DeskCtx;
const cust = (teamId: string, assignedTo: string | null) => ({ teamId, assignedTo }) as DeskCtx["data"]["customers"][number];

describe("the desktop's Assign to for a leader", () => {
  it("a TL gives their team's customer to their own people", () => {
    expect(leaderAssignees(ctx("tl"), cust("tl", "rs1")).map(p => p.id).sort()).toEqual(["rs2", "ta"]);
  });
  it("a TA gives only to the people below them", () => {
    expect(leaderAssignees(ctx("ta"), cust("tl", "ta")).map(p => p.id)).toEqual(["rs1"]);
  });
  it("nothing for another team's customer, a salesperson, or CRM · Manage (it keeps everybody)", () => {
    expect(leaderAssignees(ctx("tl"), cust("tl2", "rs3"))).toEqual([]);
    expect(leaderAssignees(ctx("rs1"), cust("tl", "rs1"))).toEqual([]);
    expect(leaderAssignees(ctx("boss", true), cust("tl", "rs1"))).toEqual([]);
  });
});
