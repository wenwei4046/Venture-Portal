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
import type { DragEvent } from "react";
import { ANSWER_TYPES, SECTION_DESC, formV2, pageName, tidyPages, toCrmForm, type FormSectionV2 } from "./form";
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
  // ── Pages (the owner, 2026-10-16: "變成可以換 page，新增 page，並且每個都可以拖動"): the page open, its tabs, add / rename / delete.
  const pages = [...new Set(secs.map(x => x.page))].sort((a, b) => a - b);
  const pg = pages.includes(ui.cfPage) ? ui.cfPage : pages[0] ?? 0;
  const titleOf = (n: number) => secs.find(x => x.page === n)?.pageTitle || pageName(pages.indexOf(n));
  const openPage = (n: number) => set(u => ({ ...u, cfPage: n, cfPv: { ...(u.cfPv ?? {}), page: pages.indexOf(n) } }));
  const newSection = (page: number, title: string): FormSectionV2 => ({ key: `s${Date.now().toString(36)}`, label: "New section", custom: true, page, pageTitle: title, fields: [] });
  // ── Drag: a field (by its grip) onto a field, a section or a page's tab; a section (by its grip) onto a section or a tab.
  const drag = ui.cfDrag;
  const over = (key: string) => (e: DragEvent) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; if (ui.cfOver !== key) patch({ cfOver: key }); };
  const end = () => patch({ cfDrag: null, cfOver: null });
  const moveField = (fsi: number, ffi: number, tsi: number, tfi: number | null) => edit(S => {
    const [f] = S[fsi].fields.splice(ffi, 1); let at = tfi ?? S[tsi].fields.length;
    if (fsi === tsi && tfi != null && ffi < tfi) at--; S[tsi].fields.splice(at, 0, f); });
  const moveSection = (fsi: number, page: number, before: number | null) => edit(S => {
    const [x] = S.splice(fsi, 1); x.page = page;
    const b = before == null ? -1 : before - (fsi < before ? 1 : 0);
    const last = S.reduce((n, y, i) => (y.page === page ? i : n), -1);
    S.splice(b >= 0 ? b : last + 1, 0, x); });
  const dropOn = (target: { si?: number; fi?: number; page?: number }) => (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); const d = drag; end(); if (!d) return;
    if (d.k === "s") {
      if (target.si != null && target.si !== d.si) moveSection(d.si, secs[target.si].page, target.si);
      else if (target.page != null) moveSection(d.si, target.page, null);
      return; }
    if (target.si != null) moveField(d.si, d.fi!, target.si, target.fi ?? null);
    else if (target.page != null) { const last = secs.reduce((n, y, i) => (y.page === target.page ? i : n), -1); if (last >= 0) moveField(d.si, d.fi!, last, null); }
    else return;
    openPage(target.page ?? secs[target.si!].page); };
  const start = (d: NonNullable<typeof drag>) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", d.k);
    const card = (e.currentTarget as HTMLElement).closest(d.k === "f" ? "[data-cf-row]" : "section");
    if (card) e.dataTransfer.setDragImage(card, 16, 16);
    patch({ cfDrag: d, cfOver: null }); };
  const onPage = pages.filter(n => n === pg).length ? secs.map((x, i) => [x, i] as const).filter(([x]) => x.page === pg) : [];
  const allCustom = onPage.length > 0 && onPage.every(([x]) => x.custom && x.fields.every(f => f.kind !== "core" && f.kind !== "auto"));
  const cfPages = {
    tabs: pages.map((n, i) => ({ label: titleOf(n), num: i + 1, on: n === pg, pick: () => openPage(n), over: over(`p:${n}`), drop: dropOn({ page: n }),
      lit: ui.cfOver === `p:${n}` && !!drag, count: secs.filter(x => x.page === n).reduce((a, x) => a + x.fields.filter(f => f.kind !== "auto").length, 0) })),
    addPage: () => { const n = (pages[pages.length - 1] ?? -1) + 1; edit(S => { S.push(newSection(n, pageName(pages.length))); }); set(u => ({ ...u, cfPage: n, cfPv: { ...(u.cfPv ?? {}), page: pages.length } })); },
    title: titleOf(pg), setTitle: (e: { target: { value: string } }) => { const t = e.target.value; edit(S => { S.forEach(x => { if (x.page === pg) x.pageTitle = t; }); }); },
    addSection: () => edit(S => { const last = S.reduce((n, y, i) => (y.page === pg ? i : n), -1); S.splice(last + 1, 0, newSection(pg, titleOf(pg))); }),
    many: pages.length > 1, canDelete: pages.length > 1 && allCustom,
    deleteTip: pages.length < 2 ? "" : allCustom ? "Delete this page and its sections" : "Drag Contact, Lead, Visit or Property onto another page's tab first",
    remove: () => { if (!(pages.length > 1 && allCustom)) return; const i = pages.indexOf(pg);
      set(u => { const next = tidyPages((u.cfDraft ?? formV2(data)).filter(x => x.page !== pg));
        return { ...u, cfDraft: next, cfType: null, cfPage: Math.max(0, i - 1), cfPv: { ...(u.cfPv ?? {}), page: Math.max(0, i - 1) } }; }); },
    dragging: !!drag,
  };
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
    form: { ...pvBase, page: pages.indexOf(pg), ...(ui.cfPv ?? {}) },
    data: { ...data, forms: [{ id: "preview", name: "Customer info", sections: toCrmForm(secs, "preview").sections }], customers: [PREVIEW] } as CrmData,
    saveDetails: async () => { patch({ toast: "Preview only · nothing is saved" }); return null as never; },
    setForm: f => set(u => ({ ...u, cfPv: typeof f === "function" ? f({ ...pvBase, ...(u.cfPv ?? {}) }) : f ? f : {} })),
    onSaved: () => {},
  });
  return {
    cfRealOn: true, cfReal, cfRealScale: ((W >= 1440 ? 270 : 222) - 16) / 375,
    cfOn: ui.tab === "forms", cfFields: true, cfPhoneH: W >= 1440 ? 560 : 460, cfPhoneW: W >= 1440 ? 270 : 222,
    cfDesk: !phone, cfPhone: phone,
    cfDevs: ([["phone", "Phone"], ["desktop", "Desktop"]] as const).map(([k, label]) => ({ label, on: ui.cfDev === k, off: ui.cfDev !== k, pick: () => patch({ cfDev: k }) })),
    cfSummary: `${total} fields · ${reqN} required · ${autoN} filled by the system`,
    cfDirty: dirty, cfClean: !dirty, cfSaveBg: dirty ? "var(--crm-rust)" : "var(--crm-line)",
    cfSave: () => { if (!dirty || !ui.cfDraft) return;
      // Nameless questions are not kept.
      const clean = ui.cfDraft.map(s => ({ ...s, fields: s.fields.filter(f => f.label.trim()) }));
      void deskAct.saveForm(toCrmForm(clean, data.forms?.[0]?.id ?? null, data.forms?.[0]?.name ?? "Customer info")).then(id => {
        if (id) patch({ cfDraft: null, cfNew: {}, toast: "Customer form saved · salespeople see it in Customer info" }); }); },
    cfReset: () => patch({ cfDraft: null, cfNew: {}, cfType: null, cfPage: 0, cfPv: null }),
    cfPages, cfPagesOn: true, cfDragEnd: end,
    cfSecs: secs.map((sec, si) => [sec, si] as const).filter(([sec]) => sec.page === pg).map(([sec, si]) => ({ label: sec.label,
      title: sec.custom ? sec.label : sec.label.charAt(0) + sec.label.slice(1).toLowerCase(), anchor: `cf-sec-${si}`, count: sec.fields.length, desc: sec.custom ? "" : SECTION_DESC[sec.label] ?? "",
      custom: !!sec.custom, setTitle: (e: { target: { value: string } }) => { const t = e.target.value; edit(S => { S[si].label = t; }); },
      removable: !!sec.custom && sec.fields.every(f => f.kind !== "core" && f.kind !== "auto") && secs.length > 1,
      remove: () => edit(S => { S.splice(si, 1); }),
      // A section moves by its grip; a field dropped on it goes to its end.
      grip: start({ k: "s", si }), dragOver: over(`s:${si}`), drop: dropOn({ si }),
      bd: ui.cfOver === `s:${si}` && drag ? "1px solid var(--crm-rust)" : "1px solid var(--crm-rule)", ring: ui.cfOver === `s:${si}` && drag ? "0 0 0 3px var(--crm-tint-attention)" : "none",
      op: drag?.k === "s" && drag.si === si ? 0.45 : 1,
      emptyHint: !sec.fields.some(f => f.kind !== "auto"),
      autoList: sec.fields.filter(f => f.kind === "auto").map(f => ({ label: f.label })), hasAuto: sec.fields.some(f => f.kind === "auto"),
      hasEdit: sec.fields.some(f => f.kind !== "auto"), editN: `${sec.fields.filter(f => f.kind !== "auto").length} you can edit`,
      pvFields: sec.fields.map(pv),
      draft: ui.cfNew[si] ?? "", setDraft: (e: { target: { value: string } }) => { const v = e.target.value; set(u => ({ ...u, cfNew: { ...u.cfNew, [si]: v } })); },
      // + with nothing typed adds "New field" (the editor opens on it to be named) — it did nothing (the owner, 2026-10-18).
      add: (label?: string) => { const t = (label ?? ui.cfNew[si] ?? "").trim(); if (!t) return;
        edit(S => { S[si].fields.push({ id: `q${Date.now().toString(36)}`, label: t, type: "Short text", opts: "", req: false, kind: "own" }); });
        set(u => ({ ...u, cfNew: { ...u.cfNew, [si]: "" } })); },
      fields: sec.fields.map((f, fi) => [f, fi] as const).filter(([f]) => f.kind !== "auto").map(([f, fi], ei, EL) => {
        const prevI = ei ? EL[ei - 1][1] : -1, nextI = ei < EL.length - 1 ? EL[ei + 1][1] : -1, core = f.kind === "core", fixedType = core || f.kind === "builtin", typeOpen = ui.cfType === `${si}:${f.id}`;
        return { label: f.label, type: f.type, opts: f.opts, auto: false, editable: true, core, removable: !core,
          hasOpts: f.type === "Choice", noOpts: f.type !== "Choice", optsRo: "—",
          reqOn: f.req, reqLabel: f.req ? "Required" : "Optional", trk: f.req ? "var(--crm-rust)" : "var(--crm-rule)", knob: f.req ? "18px" : "2px", reqFg: "var(--crm-ink)",
          upFg: prevI >= 0 ? "var(--crm-muted)" : "var(--crm-rule)", dnFg: nextI >= 0 ? "var(--crm-muted)" : "var(--crm-rule)",
          bt: ui.cfOver === `f:${si}:${fi}` && drag ? "2px solid var(--crm-rust)" : ei ? "1px solid var(--crm-field)" : "0",
          grip: start({ k: "f", si, fi }), dragOver: over(drag?.k === "s" ? `s:${si}` : `f:${si}:${fi}`), drop: dropOn({ si, fi }), op: drag?.k === "f" && drag.si === si && drag.fi === fi ? 0.4 : 1,
          up: () => { if (prevI >= 0) edit(S => { const a = S[si].fields; [a[prevI], a[fi]] = [a[fi], a[prevI]]; }); },
          down: () => { if (nextI >= 0) edit(S => { const a = S[si].fields; [a[nextI], a[fi]] = [a[fi], a[nextI]]; }); },
          setLabel: (e: { target: { value: string } }) => upd(si, fi, { label: e.target.value }), setOpts: (e: { target: { value: string } }) => upd(si, fi, { opts: e.target.value }),
          toggleReq: () => { if (!core) upd(si, fi, { req: !f.req }); }, reqCur: core ? "default" : "pointer",
          remove: () => { if (!core) edit(S => { S[si].fields.splice(fi, 1); }); },
          typeOpen, typeToggle: () => patch({ cfType: typeOpen ? null : `${si}:${f.id}` }), typeClose: () => patch({ cfType: null }), typeBd: typeOpen ? "var(--crm-rust)" : "var(--crm-line)",
          types: ANSWER_TYPES.filter(t => !fixedType || t === f.type).map(t => ({ t, on: t === f.type, bg: t === f.type ? "var(--crm-sel)" : "transparent", fg: t === f.type ? "var(--crm-rust)" : "var(--crm-ink)", w: t === f.type ? 650 : 500, chk: t === f.type ? "var(--crm-rust)" : "transparent",
            pick: () => upd(si, fi, { type: t }) })),
          pv: pv(f) }; }) })),

  };
}
