/**
 * The Customer form (CRM Desktop v2, README › 6): ONE model that the form's page edits and Inbox's Customer info, Edit
 * customer and Contacts read — so a field added, renamed or removed there shows everywhere (the owner: "规则要连通").
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmData, CrmForm } from "@/lib/member/crm-data";
import { answerOf, budgetOf, defaultForm, formV2, toCrmForm } from "./form";

const ids = (f: ReturnType<typeof defaultForm>) => f.map(s => `${s.key}: ${s.fields.map(x => x.id).join(",")}`);

describe("the default form", () => {
  it("is the design's D0: four sections, system fields, core fields and every built-in", () => {
    expect(ids(defaultForm())).toEqual([
      "contact: name,phone,first,last", "lead: plat,ad,status,sp", "visit: visit,showroom", "property: type,size,loc,req,budget"]);
  });
  it("is what formV2 answers when nothing is saved", () => {
    expect(formV2({ forms: [] })).toEqual(defaultForm());
  });
});

describe("saved and read back", () => {
  it("keeps the own questions, their type, choices and required; never stores system fields or Status", () => {
    const f = defaultForm();
    f[3].fields.push({ id: "pets", label: "Pets", type: "Choice", opts: "Yes, No", req: true, kind: "own" });
    f[2].fields.push({ id: "move", label: "Move-in", type: "Range (from–to)", opts: "", req: false, kind: "own" });
    f[3].fields = f[3].fields.filter(x => x.id !== "loc");
    const saved = toCrmForm(f, "f1");
    const stored = saved.sections.flatMap(s => s.fields.map(x => x.id));
    expect(stored).not.toContain("first");
    expect(stored).not.toContain("status");
    expect(stored).not.toContain("loc");
    expect(saved.sections[0].fields.every(x => x.locked === 1)).toBe(true);
    const back = formV2({ forms: [{ id: "f1", name: saved.name, sections: saved.sections } as CrmForm] });
    const pets = back[3].fields.find(x => x.id === "pets")!;
    expect(pets).toMatchObject({ type: "Choice", opts: "Yes, No", req: true, kind: "own" });
    expect(back[2].fields.find(x => x.id === "move")).toMatchObject({ type: "Range (from–to)" });
    expect(back[3].fields.some(x => x.id === "loc")).toBe(false);
    expect(back[1].fields.some(x => x.id === "status")).toBe(true);
  });
  it("Range is kept as the database's Range, with its hint", () => {
    const f = defaultForm(); f[3].fields.push({ id: "r", label: "Size range", type: "Range (from–to)", opts: "", req: false, kind: "own" });
    const r = toCrmForm(f, null).sections[3].fields.find(x => x.id === "r")!;
    expect(r).toMatchObject({ type: "Range", ph: "From – to" });
  });
  it("an older form's free section goes by its name", () => {
    const back = formV2({ forms: [{ id: "f", name: "x", sections: [{ id: "s9", title: "Household", fields: [{ id: "kids", label: "Kids", type: "Number", req: 0 }] }] } as CrmForm] });
    expect(back[3].fields.find(x => x.id === "kids")).toMatchObject({ type: "Number", kind: "own" });
  });
});

describe("answers", () => {
  const c = { id: "c1", name: "Aisyah", phone: "60123456783", channel: "whatsapp", ad: "Akemi · Oct", status: "follow_up", assignedTo: "s1",
    createdAt: new Date(2026, 9, 5, 15, 0).toISOString(), messages: [], details: { type: "Condo", size: "", loc: "", req: "", budget: "8,200" }, extra: { pets: "Yes" } } as unknown as CrmCustomer;
  const data = { visits: [], rooms: [] } as unknown as CrmData;
  const nameOf = (id: string) => (id === "s1" ? "Kelvin Lee" : id);
  const f = (id: string) => defaultForm().flatMap(s => s.fields).find(x => x.id === id) ?? { id, label: id, type: "Short text" as const, opts: "", req: false, kind: "own" as const };
  it("reads each field where it lives", () => {
    expect(answerOf(data, c, f("name"), nameOf)).toBe("Aisyah");
    expect(answerOf(data, c, f("sp"), nameOf)).toBe("Kelvin Lee");
    expect(answerOf(data, c, f("type"), nameOf)).toBe("Condo");
    expect(answerOf(data, c, f("size"), nameOf)).toBe("—");
    expect(answerOf(data, c, f("budget"), nameOf)).toBe("RM 8,200");
    expect(answerOf(data, c, f("pets"), nameOf)).toBe("Yes");
    expect(answerOf(data, c, f("visit"), nameOf)).toBe("—");
    expect(answerOf(data, c, f("first"), nameOf)).toMatch(/^05\/10\/2026, /);
  });
  it("a budget as a number for Contacts", () => {
    expect(budgetOf(c)).toBe(8200);
    expect(budgetOf({ ...c, details: { ...c.details, budget: "" } })).toBeNull();
  });
});
