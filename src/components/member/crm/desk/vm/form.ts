/**
 * The Customer form (CRM Desktop v2, README › 6): ONE model of the customer's fields that the form's page edits and
 * everything else reads — Inbox's Customer info column, Edit customer, Contacts' filters and columns — so a field added,
 * renamed, retyped, made required or removed there shows everywhere at once (the owner, 2026-10-15: "规则要连通").
 *
 * Four sections — Contact, Lead, Visit, Property. Each holds:
 *   - system fields, filled by the CRM and never edited here (First contact, Last chat, Platform, Ad, Salesperson, Visit,
 *     Showroom) — not stored, always shown;
 *   - core fields, required and not removable (Name, Phone, Status);
 *   - the built-in property questions (Property type, Unit size, Unit location, Requirement, Budget) — each a column of
 *     the customer (crm_contacts.details) the phone's form asks in its own controls, so their answer type stays theirs;
 *   - the form's own questions (stored answers in crm_contacts.extra), any answer type.
 * Stored as the CRM's first form (crm_forms, as rev 1's Forms editor saved it): sections Contact / Lead / Visit /
 * Property, the built-ins and own questions in their order. The phone reads the same row (sales/vm/customer.ts formOf):
 * a built-in left out is not asked, the own questions follow Budget under their section's name.
 */
import { sourceOf } from "@/lib/member/crm-source";
import type { CrmCustomer, CrmData, CrmForm, CrmFormField } from "@/lib/member/crm-data";
import { STATUS_LABEL, lastReal, timeLabel } from "../../sales/vm/common";
import { phoneLabel } from "../../sales/vm/customer";
import { adKindLabel } from "../../shared/AdLink";

/** v2's answer types, and how each is kept (crm_forms' field type). */
export const ANSWER_TYPES = ["Short text", "Number", "Long text", "Choice", "Range (from–to)", "Date"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];
const TO_DB: Record<AnswerType, CrmFormField["type"]> = { "Short text": "Text", Number: "Number", "Long text": "Long text", Choice: "Choice", "Range (from–to)": "Range", Date: "Date" };
const FROM_DB = (t: string): AnswerType => (t === "Number" ? "Number" : t === "Long text" ? "Long text" : t === "Choice" ? "Choice" : t === "Range" ? "Range (from–to)" : t === "Date" ? "Date" : "Short text");

export type FieldKind = "auto" | "core" | "builtin" | "own";
export interface FormFieldV2 { id: string; label: string; type: AnswerType; opts: string; req: boolean; kind: FieldKind }
/**
 * A section of the form. key: contact / lead / visit / property, or a section somebody added (custom). page: the page it is
 * on (0 = the first) and pageTitle that page's name — the paged form (the owner, 2026-10-16: "變成可以換 page，新增 page，
 * 並且每個都可以拖動").
 */
export interface FormSectionV2 { key: string; label: string; fields: FormFieldV2[]; page: number; pageTitle: string; custom?: boolean }
export type StdKey = "contact" | "lead" | "visit" | "property";
export const STD_KEYS: StdKey[] = ["contact", "lead", "visit", "property"];
export const pageName = (n: number) => `Page ${n + 1}`;

export const SECTION_DESC: Record<string, string> = {
  CONTACT: "Who the customer is and how to reach them", LEAD: "Where they came from and where the chat is now",
  VISIT: "Their showroom visit", PROPERTY: "Their home, so the right furniture can be recommended",
};
export const SIZES = ["3R 2R", "2R 1R", "2R 2R", "3R 3R", "4R 2R", "4R 3R", "4R 4R"];
const SECTIONS: [StdKey, string][] = [["contact", "CONTACT"], ["lead", "LEAD"], ["visit", "VISIT"], ["property", "PROPERTY"]];
/** The fields the CRM fills: never stored in the form, always in their section. */
const AUTO: Record<StdKey, FormFieldV2[]> = {
  contact: [{ id: "first", label: "First contact", type: "Date", opts: "", req: false, kind: "auto" }, { id: "last", label: "Last chat", type: "Date", opts: "", req: false, kind: "auto" }],
  lead: [{ id: "plat", label: "Platform", type: "Choice", opts: "WhatsApp, Messenger", req: false, kind: "auto" }, { id: "ad", label: "Ad", type: "Short text", opts: "", req: false, kind: "auto" },
    { id: "sp", label: "Salesperson", type: "Short text", opts: "", req: false, kind: "auto" }],
  visit: [{ id: "visit", label: "Visit", type: "Date", opts: "", req: false, kind: "auto" }, { id: "showroom", label: "Showroom", type: "Choice", opts: "", req: false, kind: "auto" }],
  property: [],
};
const CORE: Record<string, FormFieldV2> = {
  name: { id: "name", label: "Name", type: "Short text", opts: "", req: true, kind: "core" },
  phone: { id: "phone", label: "Phone", type: "Short text", opts: "", req: true, kind: "core" },
  status: { id: "status", label: "Status", type: "Choice", opts: "New, Follow up, Appointment, Won, Lost", req: true, kind: "core" },
};
const BUILTIN: Record<string, FormFieldV2> = {
  type: { id: "type", label: "Property type", type: "Choice", opts: "Condo, Landed", req: false, kind: "builtin" },
  size: { id: "size", label: "Unit size", type: "Choice", opts: SIZES.join(", "), req: false, kind: "builtin" },
  loc: { id: "loc", label: "Unit location", type: "Short text", opts: "", req: false, kind: "builtin" },
  req: { id: "req", label: "Requirement", type: "Long text", opts: "", req: false, kind: "builtin" },
  budget: { id: "budget", label: "Budget (RM)", type: "Number", opts: "", req: false, kind: "builtin" },
};
/** Where an own question of an older form (rev 1's free sections) goes: its section by name, else Property. */
const sectionOf = (title: string): StdKey => { const t = title.toLowerCase(); return t.includes("contact") ? "contact" : t.includes("lead") ? "lead" : t.includes("visit") ? "visit" : "property"; };

/** The default form: the design's (D0) — every built-in, no own question. */
export function defaultForm(): FormSectionV2[] {
  return SECTIONS.map(([key, label]) => ({ key, label, page: 0, pageTitle: pageName(0), fields: [
    ...(key === "contact" ? [CORE.name, CORE.phone] : []), ...AUTO[key].filter(f => key !== "lead" || f.id !== "sp"),
    ...(key === "lead" ? [CORE.status, AUTO.lead[2]] : []),
    ...(key === "property" ? Object.values(BUILTIN) : []),
  ].map(f => ({ ...f })) }));
}

/** The saved form (crm_forms' first), read into v2's four sections; none saved — the default. */
export function formV2(data: Pick<CrmData, "forms">): FormSectionV2[] {
  const form: CrmForm | undefined = data.forms?.[0];
  if (!form) return defaultForm();
  if (form.sections.some(s => typeof s.page === "number")) return pagedForm(form);
  const out = defaultForm().map(s => ({ ...s, fields: s.fields.filter(f => f.kind === "auto" || f.kind === "core") }));
  const sec = (k: StdKey) => out.find(s => s.key === k)!;
  for (const s of form.sections) {
    for (const f of s.fields) {
      if (f.id === "name" || f.id === "phone" || f.id === "status") { const c = sec("contact").fields.find(x => x.id === f.id) ?? sec("lead").fields.find(x => x.id === f.id); if (c) c.label = f.label || c.label; continue; }
      const b = BUILTIN[f.id];
      const into: StdKey = (STD_KEYS as string[]).includes(s.id) ? s.id as StdKey : b ? "property" : sectionOf(s.title);
      sec(into).fields.push(b ? { ...b, label: f.label || b.label, req: !!f.req, opts: f.opts?.length ? f.opts.join(", ") : b.opts }
        : { id: f.id, label: f.label, type: FROM_DB(f.type), opts: (f.opts ?? []).join(", "), req: !!f.req, kind: "own" });
    }
  }
  return out;
}

/** A paged form as saved (2026-10-16): its sections, pages and every field in its place; anything the CRM needs but the
 *  saved form lacks (a system field, Name, Phone, Status) goes back to its own section, else the first. */
function pagedForm(form: CrmForm): FormSectionV2[] {
  const autoOf = Object.fromEntries(STD_KEYS.flatMap(k => AUTO[k].map(f => [f.id, f])));
  const out: FormSectionV2[] = form.sections.map(s => {
    const std = (STD_KEYS as string[]).includes(s.id);
    return { key: s.id, label: std ? s.title.toUpperCase() : s.title, page: s.page ?? 0, pageTitle: s.pageTitle || pageName(s.page ?? 0), ...(std ? {} : { custom: true }),
      fields: s.fields.map(f => autoOf[f.id] ? { ...autoOf[f.id] } : CORE[f.id] ? { ...CORE[f.id], label: f.label || CORE[f.id].label }
        : BUILTIN[f.id] ? { ...BUILTIN[f.id], label: f.label || BUILTIN[f.id].label, req: !!f.req, opts: f.opts?.length ? f.opts.join(", ") : BUILTIN[f.id].opts }
        : { id: f.id, label: f.label, type: FROM_DB(f.type), opts: (f.opts ?? []).join(", "), req: !!f.req, kind: "own" as const }) };
  });
  const has = new Set(out.flatMap(s => s.fields.map(f => f.id)));
  const home = (k: StdKey) => out.find(s => s.key === k) ?? out[0];
  for (const k of STD_KEYS) for (const f of [...AUTO[k], ...(k === "contact" ? [CORE.name, CORE.phone] : k === "lead" ? [CORE.status] : [])])
    if (!has.has(f.id) && home(k)) home(k).fields.push({ ...f });
  return out;
}

/** Pages numbered 0, 1, 2 … in the order the sections show them (a page left empty goes). */
export function tidyPages(secs: FormSectionV2[]): FormSectionV2[] {
  const order = [...new Set(secs.map(s => s.page))].sort((a, b) => a - b);
  const sorted = order.flatMap(p => secs.filter(s => s.page === p));
  return sorted.map(s => ({ ...s, page: order.indexOf(s.page) }));
}

/** v2's sections back into crm_forms' shape: each section with its page; system fields and Status kept for their place
 *  only (sys — never asked); Name and Phone locked. */
export function toCrmForm(secs: FormSectionV2[], id: string | null, name = "Customer info"): { id: string | null; name: string; sections: CrmForm["sections"] } {
  return { id, name, sections: tidyPages(secs).map(s => ({ id: s.key, title: s.custom ? s.label : s.label.charAt(0) + s.label.slice(1).toLowerCase(),
    page: s.page, pageTitle: s.pageTitle || pageName(s.page),
    fields: s.fields.map(f => { const sys = f.kind === "auto" || f.id === "status";
      return { id: f.id, label: f.label, type: sys ? (f.type === "Date" ? "Date" as const : "Text" as const) : f.kind === "core" ? "Text" as const : TO_DB[f.type], req: !sys && f.req ? 1 as const : 0 as const,
        ...(sys ? { sys: 1 as const } : {}), ...(f.kind === "core" && !sys ? { locked: 1 as const } : {}),
        ...(!sys && f.type === "Choice" && f.opts.trim() ? { opts: f.opts.split(",").map(x => x.trim()).filter(Boolean) } : {}),
        ...(f.type === "Range (from–to)" ? { ph: "From – to" } : {}) }; }) })) };
}

const p2 = (n: number) => String(n).padStart(2, "0");
const dmy = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}, ${timeLabel(d)}`;
/** A customer's answer to one field, as Customer info shows it ("—" when not answered). */
export function answerOf(data: CrmData, c: CrmCustomer, f: FormFieldV2, nameOf: (id: string) => string): string {
  const visit = data.visits.filter(v => v.customerId === c.id && v.state !== "cancelled").sort((a, b) => b.start.localeCompare(a.start))[0];
  switch (f.id) {
    case "name": return c.name || "—";
    case "phone": return phoneLabel(c.phone) || "—";
    case "status": return STATUS_LABEL[c.status] ?? "—";
    case "first": return dmy(new Date(c.createdAt));
    case "last": { const l = lastReal(c); return l ? dmy(new Date(l.at)) : "—"; }
    case "plat": return sourceOf(c).label;
    case "ad": return c.adId ? `${adKindLabel(c)} · ${c.ad}` : c.ad || "—";
    case "sp": return c.assignedTo ? nameOf(c.assignedTo) : "—";
    case "visit": return visit ? `${new Date(visit.start).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}, ${timeLabel(new Date(visit.start))}` : "—";
    case "showroom": return visit ? data.rooms.find(r => r.id === visit.showroomId)?.name ?? "—" : "—";
    case "type": case "size": case "loc": case "req": return (c.details as unknown as Record<string, string>)[f.id] || "—";
    case "budget": { const n = Number(String(c.details.budget || "").replace(/[^\d.]/g, "")); return n ? `RM ${n.toLocaleString("en-MY")}` : c.details.budget ? `RM ${c.details.budget}` : "—"; }
    default: return c.extra?.[f.id] || "—";
  }
}
/** The budget as a number (Contacts' median and buckets), or null. */
export const budgetOf = (c: CrmCustomer) => { const n = Number(String(c.details.budget || "").replace(/[^\d.]/g, "")); return n > 0 ? n : null; };
