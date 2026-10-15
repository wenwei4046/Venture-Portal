/**
 * The Customer form page (CRM Desktop v2, README › 6; moved out of Settings): one card per section with what the CRM
 * fills as chips, the editable rows (↑ ↓, name, answer type, choices, Required, ×; Name / Phone / Status are core),
 * "+ Add field" per section, Discard and Save form; beside it the live preview — Phone (the bottom sheet salespeople
 * fill) or Desktop (one column). Saved as the CRM's first form (deskAct.saveForm → crm_save_form, CRM · Manage), which
 * Inbox's Customer info, Edit customer, Contacts and every phone's Customer info read (vm/form.ts).
 * The built-in property questions keep their answer type (the phone asks each in its own control): their type list
 * offers only their own type.
 */
import type { DeskCtx } from "./ctx";
import type { CrmCustomer, CrmData } from "@/lib/member/crm-data";
import { ANSWER_TYPES, SECTION_DESC, formV2, toCrmForm, type FormSectionV2 } from "./form";
import { customerForm } from "../../sales/vm/customer";
import type { CustomerForm } from "../../sales/ui";

/** The phone preview's customer: nobody's, every answer empty. */
const PREVIEW: CrmCustomer = { id: "preview", name: "", phone: "", channel: "whatsapp", adId: null, ad: "", status: "new", wonAmount: null, assignedTo: null, teamId: null,
  lastCustomerAt: null, createdAt: new Date(0).toISOString(), unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, extra: {}, detailsSaved: false, messages: [] } as unknown as CrmCustomer;

export function formPageVM(ctx: DeskCtx) {
  const { ui, set, patch, data, W, deskAct } = ctx;
  const saved = formV2(data);
  const secs: FormSectionV2[] = ui.cfDraft ?? saved;
  const dirty = !!ui.cfDraft && JSON.stringify(ui.cfDraft) !== JSON.stringify(saved);
  const edit = (fn: (s: FormSectionV2[]) => void) => set(u => { const next = JSON.parse(JSON.stringify(u.cfDraft ?? formV2(data))) as FormSectionV2[]; fn(next); return { ...u, cfDraft: next, cfType: null }; });
  const upd = (si: number, fi: number, p: Partial<FormSectionV2["fields"][number]>) => edit(S => { Object.assign(S[si].fields[fi], p); });
  const total = secs.reduce((n, x) => n + x.fields.length, 0), reqN = secs.reduce((n, x) => n + x.fields.filter(f => f.req).length, 0), autoN = secs.reduce((n, x) => n + x.fields.filter(f => f.kind === "auto").length, 0);
  const phone = ui.cfDev === "phone";
  const pv = (f: FormSectionV2["fields"][number]) => { const auto = f.kind === "auto";
    return { label: f.label, star: f.req && !auto, span: f.type === "Long text" ? "1 / -1" : "auto", isAuto: auto, isText: !auto && (f.type === "Short text" || f.type === "Number" || f.type === "Date"),
      isLong: !auto && f.type === "Long text", isChoice: !auto && f.type === "Choice", isRange: !auto && f.type === "Range (from–to)",
      ph: f.type === "Number" ? (/budget|rm/i.test(f.label) ? "RM" : "0") : f.type === "Date" ? "dd/mm/yyyy" : "", choices: f.opts }; };
  // The phone preview is the phone's OWN form (sales/SalesCustomerForm, the sheet every salesperson fills) drawn from this
  // draft — the owner, 2026-10-15, asked whether the preview was 1:1 and said yes to this: the design drew its own sheet.
  // A 375px phone, scaled into the frame; it can be typed into, and Save saves nothing.
  const pvBase: CustomerForm = { customerId: PREVIEW.id, edit: true };
  const cfReal = customerForm({
    form: { ...pvBase, ...(ui.cfPv ?? {}) },
    data: { ...data, forms: [{ id: "preview", name: "Customer info", sections: toCrmForm(secs, "preview").sections }], customers: [PREVIEW] } as CrmData,
    saveDetails: async () => { patch({ toast: "Preview only · nothing is saved" }); return null as never; },
    setForm: f => set(u => ({ ...u, cfPv: typeof f === "function" ? f({ ...pvBase, ...(u.cfPv ?? {}) }) : f ? f : {} })),
    onSaved: () => {},
  });
  return {
    cfRealOn: true, cfReal, cfRealScale: ((W >= 1440 ? 270 : 222) - 20) / 375,
    cfOn: ui.tab === "forms", cfFields: true, cfPhoneH: W >= 1440 ? 560 : 460, cfPhoneW: W >= 1440 ? 270 : 222,
    cfDesk: !phone, cfPhone: phone,
    cfDevs: ([["phone", "Phone"], ["desktop", "Desktop"]] as const).map(([k, label]) => ({ label, on: ui.cfDev === k, off: ui.cfDev !== k, pick: () => patch({ cfDev: k }) })),
    cfSummary: `${total} fields · ${reqN} required · ${autoN} filled by the system`,
    cfDirty: dirty, cfClean: !dirty, cfSaveBg: dirty ? "#BD4A19" : "#E2CFC1",
    cfSave: () => { if (!dirty || !ui.cfDraft) return;
      // Nameless questions are not kept.
      const clean = ui.cfDraft.map(s => ({ ...s, fields: s.fields.filter(f => f.label.trim()) }));
      void deskAct.saveForm(toCrmForm(clean, data.forms?.[0]?.id ?? null, data.forms?.[0]?.name ?? "Customer info")).then(id => {
        if (id) patch({ cfDraft: null, cfNew: {}, toast: "Customer form saved · salespeople see it in Customer info" }); }); },
    cfReset: () => patch({ cfDraft: null, cfNew: {}, cfType: null }),
    cfSecs: secs.map((sec, si) => ({ label: sec.label, title: sec.label.charAt(0) + sec.label.slice(1).toLowerCase(), anchor: `cf-sec-${si}`, count: sec.fields.length, desc: SECTION_DESC[sec.label] ?? "",
      autoList: sec.fields.filter(f => f.kind === "auto").map(f => ({ label: f.label })), hasAuto: sec.fields.some(f => f.kind === "auto"),
      hasEdit: sec.fields.some(f => f.kind !== "auto"), editN: `${sec.fields.filter(f => f.kind !== "auto").length} you can edit`,
      pvFields: sec.fields.map(pv),
      draft: ui.cfNew[si] ?? "", setDraft: (e: { target: { value: string } }) => { const v = e.target.value; set(u => ({ ...u, cfNew: { ...u.cfNew, [si]: v } })); },
      add: () => { const t = (ui.cfNew[si] ?? "").trim(); if (!t) return;
        edit(S => { S[si].fields.push({ id: `q${Date.now().toString(36)}`, label: t, type: "Short text", opts: "", req: false, kind: "own" }); });
        set(u => ({ ...u, cfNew: { ...u.cfNew, [si]: "" } })); },
      fields: sec.fields.map((f, fi) => [f, fi] as const).filter(([f]) => f.kind !== "auto").map(([f, fi], ei, EL) => {
        const prevI = ei ? EL[ei - 1][1] : -1, nextI = ei < EL.length - 1 ? EL[ei + 1][1] : -1, core = f.kind === "core", fixedType = core || f.kind === "builtin", typeOpen = ui.cfType === `${si}:${f.id}`;
        return { label: f.label, type: f.type, opts: f.opts, auto: false, editable: true, core, removable: !core,
          hasOpts: f.type === "Choice", noOpts: f.type !== "Choice", optsRo: "—",
          reqOn: f.req, reqLabel: f.req ? "Required" : "Optional", trk: f.req ? "#BD4A19" : "#E2D6CC", knob: f.req ? "18px" : "2px", reqFg: "#3F2B22",
          upFg: prevI >= 0 ? "#806B60" : "#E2D6CC", dnFg: nextI >= 0 ? "#806B60" : "#E2D6CC", bt: ei ? "1px solid #F5EEE8" : "0",
          up: () => { if (prevI >= 0) edit(S => { const a = S[si].fields; [a[prevI], a[fi]] = [a[fi], a[prevI]]; }); },
          down: () => { if (nextI >= 0) edit(S => { const a = S[si].fields; [a[nextI], a[fi]] = [a[fi], a[nextI]]; }); },
          setLabel: (e: { target: { value: string } }) => upd(si, fi, { label: e.target.value }), setOpts: (e: { target: { value: string } }) => upd(si, fi, { opts: e.target.value }),
          toggleReq: () => { if (!core) upd(si, fi, { req: !f.req }); }, reqCur: core ? "default" : "pointer",
          remove: () => { if (!core) edit(S => { S[si].fields.splice(fi, 1); }); },
          typeOpen, typeToggle: () => patch({ cfType: typeOpen ? null : `${si}:${f.id}` }), typeClose: () => patch({ cfType: null }), typeBd: typeOpen ? "#BD4A19" : "#E2CFC1",
          types: ANSWER_TYPES.filter(t => !fixedType || t === f.type).map(t => ({ t, on: t === f.type, bg: t === f.type ? "#FFF5EC" : "transparent", fg: t === f.type ? "#BD4A19" : "#3F2B22", w: t === f.type ? 650 : 500, chk: t === f.type ? "#BD4A19" : "transparent",
            pick: () => upd(si, fi, { type: t }) })),
          pv: pv(f) }; }) })),

  };
}
