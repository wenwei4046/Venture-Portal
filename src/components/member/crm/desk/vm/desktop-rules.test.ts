/**
 * What the Control panel on a computer sets, as every phone reads it (CRM Desktop rev 1, 2026-10-13): a closure for some
 * hours, the Customer info form, and History's words.
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmForm, CrmRoom } from "@/lib/member/crm-data";
import { roomClosed, roomSlots } from "../../sales/vm/chat";
import { customerForm, formOf, infoRows } from "../../sales/vm/customer";
import { historyRows, words } from "./history";

const room = (blocks: CrmRoom["blocks"]): CrmRoom => ({ id: "kl", name: "KL", active: true, address: "", slots: ["10:00", "14:00", "16:00"], cap: 2, weekly: [], blocks });
const mon = new Date(2030, 0, 7).getTime();

describe("a closure for some hours (B9)", () => {
  it("takes only the slots inside its hours, and leaves the day open", () => {
    const r = room([{ a: "2030-01-07", b: "2030-01-07", why: "Event", ranges: [{ f: "13:00", t: "15:00" }] }]);
    expect(roomClosed(r, mon)).toBe(false);
    expect(roomSlots(r, mon)).toEqual(["10:00 am", "4:00 pm"]);
    expect(roomSlots(r, mon + 86_400_000)).toEqual(["10:00 am", "2:00 pm", "4:00 pm"]);
  });
  it("a closure with no hours closes the whole day, as before", () => {
    expect(roomClosed(room([{ a: "2030-01-07", b: "2030-01-07", why: "Closed" }]), mon)).toBe(true);
  });
});

const customer: CrmCustomer = {
  id: "c1", name: "Ahmad", phone: "60123456783", channel: "whatsapp", adId: null, ad: "WhatsApp · no ad", status: "follow_up",
  wonAmount: null, assignedTo: null, teamId: null, lastCustomerAt: null, createdAt: new Date(2026, 9, 5).toISOString(), unread: 0,
  details: { type: "Condo", size: "", loc: "", req: "", budget: "5000" }, extra: { pets: "Yes" }, detailsSaved: true, messages: [],
};
const form: CrmForm = { id: "f1", name: "Customer info", sections: [
  { id: "s1", title: "Customer", fields: [{ id: "name", label: "Name", type: "Text", req: 1, locked: 1 }, { id: "phone", label: "Phone", type: "Phone", req: 0, locked: 1 }] },
  { id: "s2", title: "Property", fields: [{ id: "type", label: "Property type", type: "Choice", req: 0, opts: ["Condo", "Landed"] }] },
  { id: "s3", title: "Household", fields: [{ id: "pets", label: "Pets", type: "Choice", req: 1, opts: ["Yes", "No"] }, { id: "move", label: "Move-in date", type: "Date", req: 0 }] },
] };

describe("Customer info follows the Control panel's form (B5)", () => {
  it("with no form, the design's own questions", () => {
    expect(Object.values(formOf({}).has).every(Boolean)).toBe(true);
    expect(formOf({}).extra).toEqual([]);
  });
  it("keeps what the form keeps, adds its own questions by section", () => {
    const f = formOf({ forms: [form] });
    expect(f.has).toEqual({ name: true, phone: true, type: true, size: false, loc: false, req: false, budget: false });
    expect(f.extra.map(s => [s.title, s.fields.map(q => q.id)])).toEqual([["Household", ["pets", "move"]]]);
  });
  it("Customer info's rows: the dropped questions go, the form's own show their answers", () => {
    const rows = infoRows(customer, { forms: [form] }).map(r => [r.k, r.v]);
    expect(rows.find(r => r[0] === "Budget")).toBeUndefined();
    expect(rows.find(r => r[0] === "Pets")).toEqual(["Pets", "Yes"]);
    expect(rows.find(r => r[0] === "Move-in date")).toEqual(["Move-in date", "—"]);
  });
  it("a required question of the form holds Save until it is answered, and is saved with the rest", async () => {
    const saved: unknown[] = [];
    let state = { customerId: "c1", edit: true, extra: { pets: "" } as Record<string, string> };
    const vm = () => customerForm({ form: state, data: { forms: [form], customers: [customer] } as never,
      saveDetails: async (_id, f) => { saved.push(f); return true; }, setForm: f => { if (typeof f === "function") state = f(state) as typeof state; }, onSaved: () => {} });
    expect(vm().cfSave).toBeUndefined();
    vm().cfExtra[0].fields[0].chips[1].pick();
    expect(state.extra.pets).toBe("No");
    await vm().cfSave!();
    expect(saved[0]).toMatchObject({ name: "Ahmad", extra: { pets: "No" } });
  });
});

describe("History's words (B8)", () => {
  const nameOf = (id: string) => ({ "00000000-0000-4000-8000-000000000001": "PETER" })[id] ?? "?";
  it("names people, days and closures", () => {
    expect(words("weekly", [1, 0], nameOf)).toBe("Mon, Sun");
    expect(words("blocks", [{}, {}], nameOf)).toBe("2 closures");
    expect(words("full_time", true, nameOf)).toBe("Yes");
    expect(words("team_split", { "00000000-0000-4000-8000-000000000001": 60 }, nameOf)).toBe("PETER: 60");
  });
  it("an update lists only what changed, never its bookkeeping", () => {
    const [r] = historyRows([{ id: 1, at: "2026-10-13T02:00:00Z", who: "KRIS", table: "crm_showrooms", op: "UPDATE", key: "kl",
      before: { name: "KL", weekly: [], updated_at: "x" }, after: { name: "KL", weekly: [1], updated_at: "y" }, changed: ["weekly", "updated_at"] }], nameOf);
    expect(r).toMatchObject({ what: "KL", who: "KRIS", changes: [{ field: "Closed every week", from: "None", to: "Mon" }] });
  });
});
