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
import type { CrmCustomer, CrmData, CrmForm, CrmFormField } from "@/lib/member/crm-data";
import { CHANNEL, STATUS_LABEL, lastReal, timeLabel } from "../../sales/vm/common";
import { phoneLabel } from "../../sales/vm/customer";
import { adKindLabel } from "../../shared/AdLink";

/** v2's answer types, and how each is kept (crm_forms' field type). */
export const ANSWER_TYPES = ["Short text", "Number", "Long text", "Choice", "Range (from–to)", "Date"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];
const TO_DB: Record<AnswerType, CrmFormField["type"]> = { "Short text": "Text", Number: "Number", "Long text": "Long text", Choice: "Choice", "Range (from–to)": "Range", Date: "Date" };
const FROM_DB = (t: string): AnswerType => (t === "Number" ? "Number" : t === "Long text" ? "Long text" : t === "Choice" ? "Choice" : t === "Range" ? "Range (from–to)" : t === "Date" ? "Date" : "Short text");

export type FieldKind = "auto" | "core" | "builtin" | "own";
export interface FormFieldV2 { id: string; label: string; type: AnswerType; opts: string; req: boolean; kind: FieldKind }
export interface FormSectionV2 { key: "contact" | "lead" | "visit" | "property"; label: string; fields: FormFieldV2[] }

export const SECTION_DESC: Record<string, string> = {
  CONTACT: "Who the customer is and how to reach them", LEAD: "Where they came from and where the chat is now",
  VISIT: "Their showroom visit", PROPERTY: "Their home, so the right furniture can be recommended",
};
export const SIZES = ["3R 2R", "2R 1R", "2R 2R", "3R 3R", "4R 2R", "4R 3R", "4R 4R"];
const SECTIONS: [FormSectionV2["key"], string][] = [["contact", "CONTACT"], ["lead", "LEAD"], ["visit", "VISIT"], ["property", "PROPERTY"]];
/** The fields the CRM fills: never stored in the form, always in their section. */
const AUTO: Record<FormSectionV2["key"], FormFieldV2[]> = {
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
const sectionOf = (title: string): FormSectionV2["key"] => { const t = title.toLowerCase(); return t.includes("contact") ? "contact" : t.includes("lead") ? "lead" : t.includes("visit") ? "visit" : "property"; };

/** The default form: the design's (D0) — every built-in, no own question. */
export function defaultForm(): FormSectionV2[] {
  return SECTIONS.map(([key, label]) => ({ key, label, fields: [
    ...(key === "contact" ? [CORE.name, CORE.phone] : []), ...AUTO[key].filter(f => key !== "lead" || f.id !== "sp"),
    ...(key === "lead" ? [CORE.status, AUTO.lead[2]] : []),
    ...(key === "property" ? Object.values(BUILTIN) : []),
  ].map(f => ({ ...f })) }));
}

/** The saved form (crm_forms' first), read into v2's four sections; none saved — the default. */
export function formV2(data: Pick<CrmData, "forms">): FormSectionV2[] {
  const form: CrmForm | undefined = data.forms?.[0];
  if (!form) return defaultForm();
  const out = defaultForm().map(s => ({ ...s, fields: s.fields.filter(f => f.kind === "auto" || f.kind === "core") }));
  const sec = (k: FormSectionV2["key"]) => out.find(s => s.key === k)!;
  for (const s of form.sections) {
    for (const f of s.fields) {
      if (f.id === "name" || f.id === "phone" || f.id === "status") { const c = sec("contact").fields.find(x => x.id === f.id) ?? sec("lead").fields.find(x => x.id === f.id); if (c) c.label = f.label || c.label; continue; }
      const b = BUILTIN[f.id];
      const into: FormSectionV2["key"] = ["contact", "lead", "visit", "property"].includes(s.id) ? s.id as FormSectionV2["key"] : b ? "property" : sectionOf(s.title);
      sec(into).fields.push(b ? { ...b, label: f.label || b.label, req: !!f.req, opts: f.opts?.length ? f.opts.join(", ") : b.opts }
        : { id: f.id, label: f.label, type: FROM_DB(f.type), opts: (f.opts ?? []).join(", "), req: !!f.req, kind: "own" });
    }
  }
  return out;
}

/** v2's sections back into crm_forms' shape (system fields are not stored; Name and Phone are, locked). */
export function toCrmForm(secs: FormSectionV2[], id: string | null, name = "Customer info"): { id: string | null; name: string; sections: CrmForm["sections"] } {
  return { id, name, sections: secs.map(s => ({ id: s.key, title: s.label.charAt(0) + s.label.slice(1).toLowerCase(),
    // Status is the chat's own (crm_contacts.status), not a question: not stored, or the phone would ask it as one.
    fields: s.fields.filter(f => f.kind !== "auto" && f.id !== "status").map(f => ({ id: f.id, label: f.label, type: f.kind === "core" ? "Text" as const : TO_DB[f.type], req: f.req ? 1 as const : 0 as const,
      ...(f.kind === "core" ? { locked: 1 as const } : {}), ...(f.type === "Choice" && f.opts.trim() ? { opts: f.opts.split(",").map(x => x.trim()).filter(Boolean) } : {}),
      ...(f.type === "Range (from–to)" ? { ph: "From – to" } : {}) })) })) };
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
    case "plat": return CHANNEL[c.channel].name;
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
