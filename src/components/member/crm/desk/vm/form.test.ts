/**
 * The Customer form (CRM Desktop v2, README › 6): ONE model that the form's page edits and Inbox's Customer info, Edit
 * customer and Contacts read — so a field added, renamed or removed there shows everywhere (the owner: "规则要连通").
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmData, CrmForm } from "@/lib/member/crm-data";
import { answerOf, budgetOf, defaultForm, formV2, toCrmForm, type FormSectionV2 } from "./form";
import { formOf, pagedQuestions } from "../../sales/vm/customer";

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
  it("keeps the own questions, their type, choices and required; system fields and Status only for their place (sys, never asked)", () => {
    const f = defaultForm();
    f[3].fields.push({ id: "pets", label: "Pets", type: "Choice", opts: "Yes, No", req: true, kind: "own" });
    f[2].fields.push({ id: "move", label: "Move-in", type: "Range (from–to)", opts: "", req: false, kind: "own" });
    f[3].fields = f[3].fields.filter(x => x.id !== "loc");
    const saved = toCrmForm(f, "f1");
    const asked = saved.sections.flatMap(s => s.fields.filter(x => !x.sys).map(x => x.id));
    expect(asked).not.toContain("first");
    expect(asked).not.toContain("status");
    expect(asked).not.toContain("loc");
    expect(saved.sections.flatMap(s => s.fields).filter(x => x.id === "first" || x.id === "status").every(x => x.sys === 1)).toBe(true);
    expect(saved.sections[0].fields.filter(x => !x.sys).every(x => x.locked === 1)).toBe(true);
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

describe("pages (the owner, 2026-10-16: 可以換 page，新增 page，每個都可以拖動)", () => {
  const twoPages = () => {
    const f: FormSectionV2[] = defaultForm();
    f[3].page = 1; f[3].pageTitle = "Their home";
    f.push({ key: "sx", label: "Move-in plans", custom: true, page: 1, pageTitle: "Their home", fields: [{ id: "move", label: "Move-in date", type: "Date", opts: "", req: true, kind: "own" }] });
    // Budget dragged to the top of Contact, Name after Phone.
    const bi = f[3].fields.findIndex(x => x.id === "budget"); const [b] = f[3].fields.splice(bi, 1); f[0].fields.unshift(b);
    const [n] = f[0].fields.splice(1, 1); f[0].fields.splice(2, 0, n);
    return f;
  };
  it("a saved form keeps its pages, its sections and every field in its place", () => {
    const saved = toCrmForm(twoPages(), "f1");
    const back = formV2({ forms: [{ id: "f1", name: saved.name, sections: saved.sections } as CrmForm] });
    expect(back.map(s => `${s.page}:${s.key}`)).toEqual(["0:contact", "0:lead", "0:visit", "1:property", "1:sx"]);
    expect(back[0].fields.map(x => x.id)).toEqual(["budget", "phone", "name", "first", "last"]);
    expect(back[4]).toMatchObject({ label: "Move-in plans", custom: true, pageTitle: "Their home" });
    expect(back[3].pageTitle).toBe("Their home");
  });
  it("pages are numbered again when one is emptied", () => {
    const f = twoPages().map(s => (s.page === 1 ? { ...s, page: 4 } : s));
    expect([...new Set(toCrmForm(f, "f1").sections.map(s => s.page))]).toEqual([0, 1]);
  });
  it("the phone asks page by page, every question in its place, nothing the CRM fills", () => {
    const form = { id: "f1", ...toCrmForm(twoPages(), "f1") } as CrmForm;
    const one = pagedQuestions(form, 0), two = pagedQuestions(form, 1);
    expect(one.n).toBe(2);
    expect(one.here.flatMap(s => s.fields.map(x => x.id))).toEqual(["budget", "phone", "name"]);
    expect(two.here.flatMap(s => s.fields.map(x => x.id))).toEqual(["type", "size", "loc", "req", "move"]);
    // Name is always asked; the built-ins carry their own controls' words.
    expect(one.here[0].fields.find(x => x.id === "name")).toMatchObject({ req: 1, type: "Text", ph: "e.g. Mr. Lim" });
    expect(two.here[0].fields.find(x => x.id === "size")?.opts?.length).toBe(7);
    expect(pagedQuestions(form, 9).at).toBe(1);
    expect(formOf({ forms: [form] })).toMatchObject({ paged: true });
    expect(formOf({ forms: [form] }).extra.flatMap(s => s.fields.map(x => x.id))).toEqual(["move"]);
  });
  it("a form saved before pages is one page, as before", () => {
    const old = { id: "f0", name: "Customer info", sections: [{ id: "contact", title: "Contact", fields: [{ id: "name", label: "Name", type: "Text", req: 1 }] }] } as CrmForm;
    expect(formOf({ forms: [old] }).paged).toBe(false);
    expect(formV2({ forms: [old] }).every(s => s.page === 0)).toBe(true);
  });
});
