/**
 * The customer form (Book visit step 1 of 2, and Customer info › Edit) and the
 * customer info rows — shared by Chat and Contacts.
 */
import type { ChangeEvent } from "react";
import type { ChangeEvent as InputEvent } from "react";
import type { CrmCustomer, CrmData, CrmForm, CrmFormField } from "@/lib/member/crm-data";
import type { CustomerForm } from "../ui";
import { CHANNEL, STATUS_LABEL, day0, ini, lastReal, stop, timeLabel, type SalesCtx } from "./common";
import { adHref, adKindLabel } from "../../shared/AdLink";

/** A Malaysian number as people write it: 60123456789 → 012-345 6789. */
export function phoneLabel(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  const local = d.startsWith("60") ? "0" + d.slice(2) : d.startsWith("0") ? d : d;
  if (!/^0\d{8,10}$/.test(local)) return raw;
  return local.startsWith("011") ? `${local.slice(0, 3)}-${local.slice(3, 7)} ${local.slice(7)}` : `${local.slice(0, 3)}-${local.slice(3, 6)} ${local.slice(6)}`;
}
export const telHref = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return "tel:+" + (d.startsWith("60") ? d : d.startsWith("0") ? "6" + d : d);
};

const p2 = (n: number) => String(n).padStart(2, "0");

/** The built-in questions, by the id the Control panel's Forms gives them (CRM Desktop rev 1, B5). */
export const BUILT_IN = ["name", "phone", "type", "size", "loc", "req", "budget"] as const;
type BuiltIn = (typeof BUILT_IN)[number];
const isBuiltIn = (id: string): id is BuiltIn => (BUILT_IN as readonly string[]).includes(id);

/**
 * The form Customer info follows: the Control panel's first form (Settings › Forms), or none — then the design's own
 * questions, as before. `has` = which built-in questions it keeps; `extra` = its own questions, by section.
 */
export function formOf(data: Pick<CrmData, "forms">) {
  const form: CrmForm | undefined = data.forms?.[0];
  const ids = new Set(form?.sections.flatMap(s => s.fields.map(f => f.id)) ?? BUILT_IN);
  const has = Object.fromEntries(BUILT_IN.map(k => [k, k === "name" || ids.has(k)])) as Record<BuiltIn, boolean>;
  const extra = (form?.sections ?? []).map(s => ({ title: s.title, fields: s.fields.filter(f => !isBuiltIn(f.id) && !f.sys && f.id !== "status") })).filter(s => s.fields.length);
  // A form saved as pages (2026-10-16) is asked page by page, every question in its saved place (pagedQuestions).
  const paged = !!form && form.sections.some(s => typeof s.page === "number");
  return { has, extra, paged };
}

export function infoRows(c: CrmCustomer, data?: Pick<CrmData, "forms">) {
  const f = data ? formOf(data) : null;
  const dropped: Record<string, BuiltIn> = { "Property type": "type", "Unit size": "size", Location: "loc", Requirement: "req", Budget: "budget" };
  // First contact and Last chat in one format, dd/mm/yyyy, h:mm am (rev 1010 §4); Last chat = the newest message either side, as Inbox.
  const dmy = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}, ${timeLabel(d)}`;
  const last = lastReal(c);
  return ([
    ["Phone", phoneLabel(c.phone) || "—"],
    ["First contact", dmy(new Date(c.createdAt))],
    ["Last chat", last ? dmy(new Date(last.at)) : "—"],
    ["Platform", CHANNEL[c.channel].name], ["Ad", c.adId ? `${adKindLabel(c)} · ${c.ad}` : c.ad], ["Status", STATUS_LABEL[c.status]],
    ["Property type", c.details.type || "—"], ["Unit size", c.details.size || "—"], ["Location", c.details.loc || "—"],
    ["Requirement", c.details.req || "—"], ["Budget", c.details.budget ? "RM " + c.details.budget : "—"],
    // The form's own questions, after the built-in ones (CRM Desktop rev 1, B5).
    ...(f?.extra ?? []).flatMap(s => s.fields.map(q => [q.label, c.extra?.[q.id] || "—"])),
  ] as [string, string][]).filter(([k]) => !f || !dropped[k] || f.has[dropped[k]])
    .map(([k, v], n) => ({ k, v, rule: n ? "1px solid #EBDDD2" : "0", vFg: v === "—" ? "#B5A398" : "#3F2B22",
      // The Ad opens the ad itself, so the salesperson sees what the customer saw (the owner, 2026-10-15).
      href: k === "Ad" ? adHref(c.adUrl) : null }));
}

const SIZES = ["3R 2R", "2R 1R", "2R 2R", "3R 3R", "4R 2R", "4R 3R", "4R 4R"];

/** The built-ins asked as any question on a paged form: their own controls' words and choices. */
const BUILT_IN_Q: Record<BuiltIn, Omit<CrmFormField, "id" | "label" | "req">> = {
  name: { type: "Text", ph: "e.g. Mr. Lim" }, phone: { type: "Phone", ph: "e.g. 012-345 6789" },
  type: { type: "Choice", opts: ["Condo", "Landed"] }, size: { type: "Choice", opts: SIZES },
  loc: { type: "Text", ph: "e.g. Mont Kiara / Cheras" }, req: { type: "Long text", ph: "e.g. Full renovation + kitchen" }, budget: { type: "Number", ph: "RM" },
};
/** A paged form's questions (2026-10-16): the pages that ask something, the one being filled (`at`), its sections, every question. */
export function pagedQuestions(form: CrmForm, page: number) {
  const q = (x: CrmFormField): CrmFormField => (isBuiltIn(x.id) ? { ...BUILT_IN_Q[x.id], ...(x.opts?.length ? { opts: x.opts } : {}), id: x.id, label: x.label, req: x.id === "name" ? 1 : x.req } : x);
  const secs = form.sections.map(s => ({ title: s.title, page: s.page ?? 0, fields: s.fields.filter(x => !x.sys && x.id !== "status").map(q) })).filter(s => s.fields.length);
  const pages = [...new Set(secs.map(s => s.page))].sort((a, b) => a - b);
  const at = Math.max(0, Math.min(page, pages.length - 1));
  return { n: pages.length, at, here: secs.filter(s => s.page === pages[at]), all: secs.flatMap(s => s.fields) };
}

/** The customer form's fields and Save (the first booking goes on to choose a time). */
export function customerFormVM(ctx: SalesCtx) {
  const { set } = ctx;
  return customerForm({
    form: ctx.ui.cform, data: ctx.data, saveDetails: ctx.act.saveDetails,
    setForm: f => set(u => ({ ...u, cform: typeof f === "function" ? (u.cform ? f(u.cform) : null) : f })),
    // A first booking goes on to the time (step 2 of 2).
    onSaved: (c, edit) => set(u => ({ ...u, cform: null, book: edit ? u.book : { customerId: c.id, room: 0, day: day0(new Date()), slot: null } })),
  });
}

/** The form itself, for whichever screen holds it (the salesperson's chat and Contacts, the Control panel's chat). */
export function customerForm({ form: f, data, saveDetails, setForm, onSaved }: {
  form: CustomerForm | null; data: CrmData;
  saveDetails: SalesCtx["act"]["saveDetails"];
  setForm: (f: CustomerForm | null | ((f: CustomerForm) => CustomerForm)) => void;
  onSaved: (c: CrmCustomer, edit: boolean) => void;
}) {
  const c = f ? data.customers.find(x => x.id === f.customerId) : undefined;
  if (!f || !c) return {
    stop, cfOpen: false, cfClose: () => {}, cfStep: "", cfName: "", cfSetName: (_: ChangeEvent<HTMLInputElement>) => {}, cfPhone: "", cfSetPhone: (_: ChangeEvent<HTMLInputElement>) => {},
    cfType: [] as Chip[], cfSize: [] as Chip[], cfLoc: "", cfSetLoc: (_: ChangeEvent<HTMLInputElement>) => {}, cfReq: "", cfSetReq: (_: ChangeEvent<HTMLTextAreaElement>) => {},
    cfReqPh: "", cfBudget: "", cfSetBudget: (_: ChangeEvent<HTMLInputElement>) => {}, cfSave: undefined as undefined | (() => void), cfSaveBg: "#D9C7BA", cfSaveLabel: "",
    cfHas: formOf({}).has, cfExtra: [] as ExtraSection[], cfPaged: false, cfBack: undefined as undefined | (() => void),
  };
  const v = (k: "name" | "phone" | "type" | "size" | "loc" | "req" | "budget") => {
    if (f[k] !== undefined) return f[k] as string;
    if (k === "name") return c.name;
    if (k === "phone") return phoneLabel(c.phone);
    return c.details[k];
  };
  const put = (p: Partial<CustomerForm>) => setForm(x => ({ ...x, ...p }));
  const chip = (k: "type" | "size", opts: string[]): Chip[] => opts.map(o => {
    const on = v(k) === o;
    return { label: o, pick: () => put({ [k]: on ? "" : o }), bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#EBDDD2" };
  });
  // The form's own questions (CRM Desktop rev 1, B5): typed into the form, else what the customer already has.
  const { has, extra, paged } = formOf(data);
  const ans = (id: string) => f.extra?.[id] ?? c.extra?.[id] ?? "";
  const putX = (id: string, val: string) => setForm(x => ({ ...x, extra: { ...(x.extra ?? {}), [id]: val } }));
  // Paged (2026-10-16): every question — the built-ins too — in the saved order, the page being filled only.
  const pg = paged ? pagedQuestions(data.forms![0], f.page ?? 0) : null;
  const valOf = (id: string) => (isBuiltIn(id) ? v(id) : ans(id));
  const putOf = (id: string) => (val: string) => (isBuiltIn(id) ? put({ [id]: id === "budget" ? val.replace(/[^d,.s–-]/g, "") : val }) : putX(id, val));
  const cfExtra: ExtraSection[] = pg ? pg.here.map(s => ({ title: s.title, fields: s.fields.map(q => extraField(q, valOf(q.id), putOf(q.id))) }))
    : extra.map(s => ({ title: s.title, fields: s.fields.map(q => extraField(q, ans(q.id), val => putX(q.id, val))) }));
  const missing = pg ? pg.all.some(q => q.req && !valOf(q.id).trim()) : extra.some(s => s.fields.some(q => q.req && !ans(q.id).trim()));
  const ok = !!v("name").trim() && !missing;
  const pageOk = !pg || pg.here.every(s => s.fields.every(q => !q.req || !!valOf(q.id).trim()));
  const more = !!pg && pg.at < pg.n - 1;
  return {
    cfHas: pg ? (Object.fromEntries(BUILT_IN.map(k => [k, false])) as typeof has) : has, cfExtra, cfPaged: !!pg,
    cfBack: pg && pg.at > 0 ? () => put({ page: pg.at - 1 }) : undefined,
    stop, cfOpen: true, cfClose: () => setForm(null),
    cfStep: pg && pg.n > 1 ? `${f.edit ? "" : "Step 1 of 2 · "}Page ${pg.at + 1} of ${pg.n}` : f.edit ? "" : "Step 1 of 2",
    cfName: v("name"), cfSetName: (e: ChangeEvent<HTMLInputElement>) => put({ name: e.target.value }),
    cfPhone: v("phone"), cfSetPhone: (e: ChangeEvent<HTMLInputElement>) => put({ phone: e.target.value }),
    cfType: chip("type", ["Condo", "Landed"]), cfSize: chip("size", SIZES),
    cfLoc: v("loc"), cfSetLoc: (e: ChangeEvent<HTMLInputElement>) => put({ loc: e.target.value }),
    cfReq: v("req"), cfSetReq: (e: ChangeEvent<HTMLTextAreaElement>) => put({ req: e.target.value }), cfReqPh: "e.g. Full renovation + kitchen",
    cfBudget: v("budget"), cfSetBudget: (e: ChangeEvent<HTMLInputElement>) => put({ budget: e.target.value.replace(/[^\d,.\s–-]/g, "") }),
    cfSaveBg: (more ? pageOk : ok) ? "#BD4A19" : "#D9C7BA", cfSaveLabel: more ? "Next" : f.edit ? "Save" : "Save & choose a time",
    cfSave: more ? (pageOk ? () => put({ page: pg!.at + 1 }) : undefined) : ok ? async () => {
      const answers = f.extra ? Object.fromEntries(Object.entries(f.extra).map(([k, x]) => [k, x.trim() || null])) : undefined;
      const saved = await saveDetails(c.id, { name: v("name"), phone: v("phone"), type: v("type"), size: v("size"), loc: v("loc"), req: v("req"), budget: v("budget"), ...(answers ? { extra: answers } : {}) });
      if (saved) onSaved(c, f.edit);
    } : undefined,
  };
}
export type CustomerFormVM = ReturnType<typeof customerForm>;

/** The Customer info sheet (Contacts, and the Calendar since rev 1010 §3): the rows, Edit, and Open chat. */
export function contactInfoVM(ctx: SalesCtx) {
  const { ui, set, patch, data, act } = ctx;
  const ci = ui.cInfo ? data.customers.find(c => c.id === ui.cInfo) : undefined;
  return {
    ctOpen: !!ci, ctClose: () => patch({ cInfo: null }), ctName: ci?.name ?? "", ctIni: ci ? ini(ci.name) : "",
    ctRows: ci ? infoRows(ci, data) : [],
    ctChat: () => { if (!ci) return; set(u => ({ ...u, tab: "inbox", chat: ci.id, cInfo: null, hist: [...u.hist, u.tab].slice(-20) })); act.openChat(ci.id); },
    ctEdit: () => { if (!ci) return; set(u => ({ ...u, cform: { customerId: ci.id, edit: true }, cInfo: null })); },
  };
}
interface Chip { label: string; pick: () => void; bg: string; fg: string; bd: string }

/** One of the form's own questions, in the design's controls: a field, a box (Long text) or pills (Choice). */
export interface ExtraField {
  label: string; req: boolean; value: string; ph: string; isInput: boolean; isLong: boolean; isChoice: boolean;
  inputType: "text" | "date"; mode: "text" | "numeric" | "tel"; chips: Chip[];
  set: (e: InputEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}
export interface ExtraSection { title: string; fields: ExtraField[] }
export function extraField(q: CrmFormField, value: string, put: (v: string) => void): ExtraField {
  const choice = q.type === "Choice", long = q.type === "Long text";
  return {
    label: q.label, req: !!q.req, value, ph: q.ph ?? "", isInput: !choice && !long, isLong: long, isChoice: choice,
    inputType: q.type === "Date" ? "date" : "text", mode: q.type === "Number" ? "numeric" : q.type === "Phone" ? "tel" : "text",
    chips: choice ? (q.opts ?? []).map(o => { const on = value === o;
      return { label: o, pick: () => put(on ? "" : o), bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#EBDDD2" }; }) : [],
    set: e => put(e.target.value),
  };
}
