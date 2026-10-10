/**
 * The customer form (Book visit step 1 of 2, and Customer info › Edit) and the
 * customer info rows — shared by Chat and Contacts.
 */
import type { ChangeEvent } from "react";
import type { CrmCustomer } from "@/lib/member/crm-data";
import type { CrmData } from "@/lib/member/crm-data";
import type { CustomerForm } from "../ui";
import { CHANNEL, STATUS_LABEL, day0, lastReal, stop, timeLabel, type SalesCtx } from "./common";

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

export function infoRows(c: CrmCustomer) {
  // First contact and Last chat in one format, dd/mm/yyyy, h:mm am (rev 1010 §4); Last chat = the newest message either side, as Inbox.
  const dmy = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}, ${timeLabel(d)}`;
  const last = lastReal(c);
  return ([
    ["Phone", phoneLabel(c.phone) || "—"],
    ["First contact", dmy(new Date(c.createdAt))],
    ["Last chat", last ? dmy(new Date(last.at)) : "—"],
    ["Platform", CHANNEL[c.channel].name], ["Ad", c.ad], ["Status", STATUS_LABEL[c.status]],
    ["Property type", c.details.type || "—"], ["Unit size", c.details.size || "—"], ["Location", c.details.loc || "—"],
    ["Requirement", c.details.req || "—"], ["Budget", c.details.budget ? "RM " + c.details.budget : "—"],
  ] as [string, string][]).map(([k, v], n) => ({ k, v, rule: n ? "1px solid #EBDDD2" : "0", vFg: v === "—" ? "#B5A398" : "#3F2B22" }));
}

const SIZES = ["3R 2R", "2R 1R", "2R 2R", "3R 3R", "4R 2R", "4R 3R", "4R 4R"];

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
  const ok = !!v("name").trim();
  return {
    stop, cfOpen: true, cfClose: () => setForm(null),
    cfStep: f.edit ? "" : "Step 1 of 2",
    cfName: v("name"), cfSetName: (e: ChangeEvent<HTMLInputElement>) => put({ name: e.target.value }),
    cfPhone: v("phone"), cfSetPhone: (e: ChangeEvent<HTMLInputElement>) => put({ phone: e.target.value }),
    cfType: chip("type", ["Condo", "Landed"]), cfSize: chip("size", SIZES),
    cfLoc: v("loc"), cfSetLoc: (e: ChangeEvent<HTMLInputElement>) => put({ loc: e.target.value }),
    cfReq: v("req"), cfSetReq: (e: ChangeEvent<HTMLTextAreaElement>) => put({ req: e.target.value }), cfReqPh: "e.g. Full renovation + kitchen",
    cfBudget: v("budget"), cfSetBudget: (e: ChangeEvent<HTMLInputElement>) => put({ budget: e.target.value.replace(/[^\d,.\s–-]/g, "") }),
    cfSaveBg: ok ? "#BD4A19" : "#D9C7BA", cfSaveLabel: f.edit ? "Save" : "Save & choose a time",
    cfSave: ok ? async () => {
      const saved = await saveDetails(c.id, { name: v("name"), phone: v("phone"), type: v("type"), size: v("size"), loc: v("loc"), req: v("req"), budget: v("budget") });
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
    ctRows: ci ? infoRows(ci) : [],
    ctChat: () => { if (!ci) return; set(u => ({ ...u, tab: "inbox", chat: ci.id, cInfo: null, hist: [...u.hist, u.tab].slice(-20) })); act.openChat(ci.id); },
    ctEdit: () => { if (!ci) return; set(u => ({ ...u, cform: { customerId: ci.id, edit: true }, cInfo: null })); },
  };
}
interface Chip { label: string; pick: () => void; bg: string; fg: string; bd: string }
