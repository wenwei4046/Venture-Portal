/**
 * Settings (CRM Desktop rev 1, H1–H4), CRM · Manage: Member work type (Save), Cold lead templates (status filter,
 * on / off only when Approved, delete with an inline confirm, the editor with Insert variable), Forms (the Customer
 * info form: sections and fields — what every salesperson's Customer info shows, user 2026-10-13), and the
 * Notifications page (Unread | Read, categories, Select, Delete with a 30 s Undo). The read state is the phone's
 * (crm_read_notifs); what the Principal or Director sets here is what everybody's CRM uses.
 */
import { formFromRow, infoLabel } from "@/lib/crm-partner/model";
import type { CrmLeave, CrmReplyItem, CrmTemplate } from "@/lib/member/crm-data";
import { panelNotifs } from "../../panel/vm/notifs";
import { urgencyOf } from "../../sales/vm/common";
import { DEFAULT_CRM_SETTINGS, type CrmSettings } from "@/lib/member/crm-data";
import { jobTitle } from "../../shared/people";
import type { DeskCtx, FormField, FormSection } from "./ctx";
import { panelLike } from "./frame";
import { initials } from "./data";
import { DIRECTOR_C, DIRECTOR_TEAM, teamColours } from "./tokens";
import { CHANNEL_COLOUR, CHANNEL_TINT } from "../../shared/palette";
import { activeVM, lockedOf } from "../../shared/locked";

/** The Customer info form as the phone draws it today (sales/vm/customer.ts): the base every edit starts from. */
export const BASE_FORM: FormSection[] = [
  { id: "s1", title: "Customer", fields: [{ id: "name", label: "Name", type: "Text", req: 1, locked: 1, ph: "" }, { id: "phone", label: "Phone", type: "Phone", req: 0, locked: 1, ph: "" }] },
  { id: "s2", title: "Property", fields: [
    { id: "type", label: "Property type", type: "Choice", req: 0, opts: ["Condo", "Landed"] },
    { id: "size", label: "Unit size", type: "Choice", req: 0, opts: ["3R 2R", "2R 1R", "2R 2R", "3R 3R", "4R 2R", "4R 3R", "4R 4R"] },
    { id: "loc", label: "Unit location", type: "Text", req: 0, ph: "e.g. Mont Kiara / Cheras" },
    { id: "req", label: "Requirement", type: "Long text", req: 0, ph: "e.g. Full renovation + kitchen" },
    { id: "budget", label: "Budget", type: "Number", req: 0, ph: "RM" }] },
];
const TYPES: FormField["type"][] = ["Text", "Long text", "Choice", "Number", "Phone", "Date"];

/** A row of Settings › General: `key` = a stored setting (editable with CRM · Manage), none = fixed. */
export interface Set4Row { t: string; s: string; v: string; key?: keyof CrmSettings }
export interface Set4Group { title: string; sub: string; rows: Set4Row[] }

export function settingsVM(ctx: DeskCtx, opItem: string) {
  const { ui, set, patch, data, teams, act } = ctx;
  const sheetOpen = ui.stage !== "menu";

  // ── Member work type (H1): toggles change nothing until Save.
  const lk = lockedOf(data);
  const saved: Record<string, boolean> = Object.fromEntries(teams.flatMap(t => t.people).map(p => [p.id, p.fullTime]));
  const on = ui.mwt ?? saved;
  const dirty = !!ui.mwt && Object.keys(on).some(id => !!on[id] !== !!saved[id]);
  // A team folds to its head (2026-10-23, the owner: "这些名单做可收缩及展开的功能").
  const mwtTeams = teams.map((t, k) => ({ name: t.name, shut: !ui.teamShut[t.name], // folded at first (the owner, 2026-10-24); teamShut keeps the opened
      fold: () => set(u => ({ ...u, teamShut: { ...u.teamShut, [t.name]: !u.teamShut[t.name] } })), color: teamColours(k)[0], count: `${t.people.filter(p => on[p.id]).length} of ${t.people.length} full time`,
    people: t.people.map(p => ({ name: p.name, role: jobTitle(p), wt: on[p.id] ? "Full time" : "Part time", wtBg: on[p.id] ? "var(--crm-tint-follow)" : "var(--crm-field)", wtFg: on[p.id] ? "var(--crm-brown)" : "var(--crm-muted)",
      ini: initials(p.name), track: on[p.id] ? "var(--crm-brown)" : "var(--crm-line)", knob: on[p.id] ? 19 : 3,
      toggle: () => set(u => ({ ...u, mwt: { ...(u.mwt ?? saved), [p.id]: !(u.mwt ?? saved)[p.id] }, mwtSaved: false })) })) }));
  // ── Active members (2026-10-22, the owner: its own section after Ads to teams): Active or Locked, saved by Save.
  // v2 (06c): each person's leads this month beside the switch (who holds them now).
  const m0 = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), 1).getTime(), actLeads: Record<string, number> = {};
  data.customers.forEach(c => { if (c.assignedTo && new Date(c.createdAt).getTime() >= m0) actLeads[c.assignedTo] = (actLeads[c.assignedTo] ?? 0) + 1; });
  const actBase = activeVM([
    ...(ctx.directors.length ? [{ name: DIRECTOR_TEAM, color: DIRECTOR_C[0], people: ctx.directors }] : []),
    ...teams.map((t, k) => ({ name: t.name, color: teamColours(k)[0], people: t.people })),
  ], lk, p => jobTitle(p as (typeof teams)[number]["people"][number]), ui.actDraft, d => patch({ actDraft: d }), act.setLocked, msg => patch({ toast: msg }));
  // Members' leave (2026-10-29, the owner: "可以设定 member 的休假，不要派名单给他"): the office's today, each member's leaves
  // not ended yet, and the writes (CRM · Manage).
  const today = new Date(ctx.now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const leaveOf: Record<string, CrmLeave[]> = {};
  (data.leaves ?? []).filter(l => l.to >= today).forEach(l => { (leaveOf[l.staffId] ??= []).push(l); });
  const actVM = { ...actBase, leads: actLeads, leave: { can: !!data.can.manage, today, of: leaveOf,
    save: (l: { id: string | null; staffId: string; from: string; to: string; note: string }) => act.saveLeave(l).then(okd => { if (okd) patch({ toast: "Saved · Leave" }); return okd; }),
    remove: (id: string) => act.deleteLeave(id).then(okd => { if (okd) patch({ toast: "Leave removed" }); return okd; }) } };
  const mwtSave = () => { if (!dirty) return; const changed = Object.keys(on).filter(id => !!on[id] !== !!saved[id]);
    void Promise.all(changed.map(id => act.setFullTime(id, !!on[id]))).then(rs => { if (rs.every(Boolean)) patch({ mwt: null, mwtSaved: true, toast: "Saved · Member work type" }); }); };

  // ── Cold lead templates (H2).
  const SC: Record<string, [string, string]> = { Approved: ["var(--crm-tint-follow)", "var(--crm-brown)"], "In review": ["var(--crm-tint-appt)", "var(--crm-brown)"], Draft: ["var(--crm-rule-soft)", "var(--crm-muted)"], Rejected: ["var(--crm-tint-attention)", "var(--crm-oxblood)"] };
  const DOT: Record<string, string> = { all: "var(--crm-muted)", Approved: "var(--crm-brown)", "In review": "var(--crm-brown)", Draft: "var(--crm-faint)", Rejected: "var(--crm-oxblood)" };
  const stName = (s: CrmTemplate["st"]) => (s === "approved" ? "Approved" : s === "review" ? "In review" : s === "rejected" ? "Rejected" : "Draft");
  const tpls = (data.templates ?? []).map(t => ({ t, status: stName(t.st), ch: t.ch === "messenger" ? "Messenger" : "WhatsApp" }));
  const f = ui.cltF, ed = ui.cltEdit;
  const segs = (s: string) => s.split(/(\{[a-z_]+\})/).filter(Boolean).map(x => ({ t: x, tag: /^\{[a-z_]+\}$/.test(x), txt: !/^\{[a-z_]+\}$/.test(x) }));
  const card = (x: (typeof tpls)[number]) => { const ok = x.status === "Approved", o = ok && x.t.on, editing = ed === x.t.id, draft = editing ? ui.cltDraft ?? x.t.body : x.t.body;
    const ch = editing ? ui.cltDC ?? x.ch : x.ch;
    return { name: x.t.name, status: x.status, channel: x.ch, stBg: SC[x.status][0], stFg: SC[x.status][1], chFg: x.ch === "WhatsApp" ? CHANNEL_COLOUR.whatsapp : CHANNEL_COLOUR.messenger, chBg: x.ch === "WhatsApp" ? CHANNEL_TINT.whatsapp : CHANNEL_TINT.messenger,
      bd: editing ? "var(--crm-rust)" : "var(--crm-rule)", onLabel: o ? "On" : "Off", onFg: !ok ? "var(--crm-faint)" : o ? "var(--crm-brown)" : "var(--crm-muted)", segs: segs(x.t.body), view: true, editing, draft, dsegs: segs(String(draft)),
      edit: () => patch({ cltEdit: x.t.id, cltDraft: x.t.body, cltDN: x.t.name, cltDC: x.ch as "WhatsApp" | "Messenger", cltIsNew: false, frmOpen: false }),
      cancel: () => patch({ cltEdit: null, cltDraft: null, cltIsNew: false }),
      empty: !String(draft).trim(), subBg: String(draft).trim() ? "var(--crm-rust)" : "var(--crm-line)", subCur: String(draft).trim() ? "pointer" : "not-allowed",
      mode: ui.cltIsNew && editing ? "New template" : "", hasMode: ui.cltIsNew && editing, dname: x.t.name, dn: editing ? ui.cltDN ?? x.t.name : x.t.name,
      setDN: (e: { target: { value: string } }) => patch({ cltDN: e.target.value }),
      chOpts: (["WhatsApp", "Messenger"] as const).map(c => { const sel = ch === c; return { label: c, bg: sel ? "#fff" : "transparent", sh: sel ? "0 1px 3px rgba(42,22,12,.14)" : "none", fw: sel ? 700 : 600, fg: sel ? "var(--crm-ink)" : "var(--crm-muted)", pick: () => patch({ cltDC: c }) }; }),
      subHint: "", askDel: ui.cltAsk === x.t.id, noAsk: ui.cltAsk !== x.t.id,
      ask: (e: { stopPropagation(): void }) => { e.stopPropagation(); patch({ cltAsk: x.t.id }); }, askNo: () => patch({ cltAsk: null }),
      delNow: () => void act.deleteTemplate(x.t.id).then(okd => { if (okd) patch({ cltAsk: null, cltEdit: ed === x.t.id ? null : ed, toast: `Deleted · ${x.t.name}` }); }),
      del: () => void act.deleteTemplate(x.t.id).then(okd => { if (okd) patch({ cltEdit: null, cltDraft: null }); }),
      saveDraft: () => saveT(x.t.id, false), submit: () => saveT(x.t.id, true),
      setDraft: (e: { target: { value: string } }) => patch({ cltDraft: e.target.value }),
      vars: ["{name}", "{showroom}", "{salesperson}", ...ui.cltVars].map(v => ({ label: v, add: () => insertVar(v, x.t.body) })),
      moreOpen: ui.cltMore, toggleMore: () => set(u => ({ ...u, cltMore: !u.cltMore })),
      moreOpts: ([["{visit_date}", "Visit date"], ["{visit_time}", "Visit time"], ["{ad}", "Ad they came from"], ["{phone}", "Customer phone"]] as const).filter(([v]) => !ui.cltVars.includes(v))
        .map(([v, d]) => ({ v, d, pick: () => set(u => ({ ...u, cltVars: [...u.cltVars, v], cltMore: false })) })),
      moreNone: ["{visit_date}", "{visit_time}", "{ad}", "{phone}"].every(v => ui.cltVars.includes(v)),
      saveHint: x.ch === "WhatsApp" ? "WhatsApp templates go back to In review after a change" : "Saved straight away",
      track: o ? "var(--crm-brown)" : ok ? "var(--crm-line)" : "var(--crm-rule-soft)", knob: o ? 19 : 3, locked: !ok, cur: ok ? "pointer" : "not-allowed", tip: ok ? "" : "Only approved templates can be switched on",
      toggle: () => { if (ok) void act.templateOn(x.t.id, !o).then(okt => { if (okt) patch({ toast: `${x.t.name} ${o ? "off" : "on"} for salespeople` }); }); } }; };
  const insertVar = (v: string, body: string) => {
    const el = typeof document !== "undefined" ? document.activeElement as HTMLTextAreaElement | null : null, curB = ui.cltDraft ?? body;
    const p0 = el?.tagName === "TEXTAREA" ? el.selectionStart : curB.length, p1 = el?.tagName === "TEXTAREA" ? el.selectionEnd : curB.length;
    const pre = curB.slice(0, p0), post = curB.slice(p1), ins = (pre && !/\s$/.test(pre) ? " " : "") + v + (post && !/^[\s,.!?]/.test(post) ? " " : "");
    patch({ cltDraft: pre + ins + post });
  };
  const saveT = (id: string | null, submit: boolean) => {
    const t = tpls.find(x => x.t.id === id)?.t, name = (ui.cltDN ?? t?.name ?? "").trim() || "Untitled template", body = ui.cltDraft ?? t?.body ?? "";
    const ch = (ui.cltDC ?? (t?.ch === "messenger" ? "Messenger" : "WhatsApp")) === "Messenger" ? "messenger" : "whatsapp";
    if (!body.trim()) return;
    void act.saveTemplate({ id: ui.cltIsNew ? null : id, name, ch, body }, submit).then(r => { if (r) patch({ cltEdit: null, cltDraft: null, cltIsNew: false, toast: submit ? `Sent to Meta for ${ch === "whatsapp" ? "WhatsApp" : "Messenger"} review` : `Saved · ${name}` }); });
  };
  const all = tpls.map(card);
  const newCard = ui.cltIsNew && ui.cltEdit === "new" ? card({ t: { id: "new", name: "", ch: "whatsapp", st: "draft", body: "", on: false, metaName: null, language: "en", reason: null }, status: "Draft", ch: ui.cltDC ?? "WhatsApp" }) : null;
  const cards = [...(newCard ? [newCard] : []), ...all.filter(c => f === "all" || c.status === f)];
  const cE = cards.find(c => c.editing);

  // ── Forms (H3): the Customer info form; saved, it is what every salesperson's Customer info shows.
  const forms = data.forms?.length ? data.forms : [{ id: "ci", name: "Customer info", sections: BASE_FORM, base: true }];
  const curF = forms.find(x => x.id === ui.frmCur) ?? forms[0];
  const fs = ui.frmDraft ?? (ui.frmIsNew ? [] : curF.sections);
  const fOn = ui.frmOpen && opItem === "Forms";
  const sumOf = (ss: FormSection[]) => { const a = ss.reduce((n, x) => n + x.fields.length, 0), r = ss.reduce((n, x) => n + x.fields.filter(fl => fl.req).length, 0);
    return `${a}${a === 1 ? " field · " : " fields · "}${r} required · ${ss.length}${ss.length === 1 ? " section" : " sections"}`; };
  const upd = (fn: (d: FormSection[]) => void) => set(u => { const d: FormSection[] = JSON.parse(JSON.stringify(u.frmDraft ?? curF.sections)); fn(d); return { ...u, frmDraft: d }; });
  const isBase = !ui.frmIsNew && !!curF.base, fName = ui.frmName ?? curF.name, oi = ui.frmOptIn, exp = ui.frmExp;
  const frm = {
    frmOpen: fOn, frmCards: forms.map(x => ({ name: x.name, sum: sumOf(x.sections), isBase: !!x.base, notBase: !x.base,
      open: () => patch({ stage: "op", frmOpen: true, frmCur: x.id, frmIsNew: false, frmName: null, cltEdit: null, cltDraft: null, frmDraft: null, frmExp: null, frmOptIn: {} }) })),
    frmNew: () => patch({ stage: "op", frmOpen: true, frmCur: null, frmIsNew: true, frmName: "New form", cltEdit: null, cltDraft: null, frmDraft: [{ id: `s${Date.now()}`, title: "Section 1", fields: [] }], frmExp: null, frmOptIn: {} }),
    frmTitle: fName, frmIsBase: isBase, frmNotBase: !isBase, frmCanRm: !isBase && !ui.frmIsNew,
    setFrmName: (e: { target: { value: string } }) => patch({ frmName: e.target.value }),
    frmSub: isBase ? "" : ui.frmIsNew ? "New form · type a name above" : "Custom form on the sales app",
    frmClose: () => patch({ frmOpen: false, frmDraft: null, frmExp: null, frmIsNew: false, frmName: null }),
    frmRm: () => { if (curF.base) return; void ctx.deskAct.deleteForm(curF.id).then(okd => { if (okd) patch({ frmOpen: false, frmDraft: null, frmName: null, toast: `Form "${curF.name}" deleted` }); }); },
    frmSave: () => { const nm = (fName || "").trim() || "Untitled form";
      void ctx.deskAct.saveForm({ id: ui.frmIsNew || (curF.base && !data.forms?.length) ? null : curF.id, name: curF.base ? curF.name : nm, sections: fs }).then(okd => {
        if (okd) patch({ frmDraft: null, frmExp: null, frmOpen: false, frmIsNew: false, frmName: null, toast: `${ui.frmIsNew ? `Form "${nm}" added to` : `Form "${curF.base ? curF.name : nm}" updated in`} the sales app` }); }); },
    frmAddSec: () => upd(d => { d.push({ id: `s${Date.now()}`, title: "New section", fields: [] }); }),
    frmSecs: fs.map((sec, si) => ({ title: sec.title, n: `${sec.fields.length}${sec.fields.length === 1 ? " field" : " fields"}`, canDel: !sec.fields.some(x => x.locked), noDel: sec.fields.some(x => x.locked),
      setTitle: (e: { target: { value: string } }) => { const v = e.target.value; upd(d => { d[si].title = v; }); }, del: () => upd(d => { d.splice(si, 1); }), empty: !sec.fields.length,
      addField: () => { const id = `f${Date.now()}`; upd(d => { d[si].fields.push({ id, label: "", type: "Text", req: 0, ph: "", isNew: 1 }); }); patch({ frmExp: id }); },
      fields: sec.fields.map((fl, fi) => { const open = exp === fl.id, isC = fl.type === "Choice", last = fi === sec.fields.length - 1;
        const addOpt = () => { const v = (oi[fl.id] ?? "").trim(); if (!v || (fl.opts ?? []).includes(v)) return; upd(d => { const x = d[si].fields[fi]; x.opts = [...(x.opts ?? []), v]; }); set(u => ({ ...u, frmOptIn: { ...u.frmOptIn, [fl.id]: "" } })); };
        return { label: fl.label || "Untitled field", star: fl.req ? " *" : "", summary: fl.type + (isC ? ` · ${(fl.opts ?? []).length} options` : "") + (fl.locked ? " · Always on" : ""), isNew: !!fl.isNew, open, closed: !open,
          bt: fi ? "1px solid var(--crm-field)" : "0", bg: open ? "var(--crm-page)" : "#fff", chev: open ? "rotate(180deg)" : "none", toggle: () => patch({ frmExp: open ? null : fl.id }),
          up: () => upd(d => { const L = d[si].fields; if (fi > 0) [L[fi - 1], L[fi]] = [L[fi], L[fi - 1]]; else if (si > 0) d[si - 1].fields.push(L.splice(fi, 1)[0]); }),
          down: () => upd(d => { const L = d[si].fields; if (!last) [L[fi + 1], L[fi]] = [L[fi], L[fi + 1]]; else if (si < d.length - 1) d[si + 1].fields.unshift(L.splice(fi, 1)[0]); }),
          upFg: fi === 0 && si === 0 ? "var(--crm-rule)" : "var(--crm-muted)", dnFg: last && si === fs.length - 1 ? "var(--crm-rule)" : "var(--crm-muted)",
          lab: fl.label, setLabel: (e: { target: { value: string } }) => { const v = e.target.value; upd(d => { d[si].fields[fi].label = v; }); },
          ph: fl.ph ?? "", setPh: (e: { target: { value: string } }) => { const v = e.target.value; upd(d => { d[si].fields[fi].ph = v; }); }, notC: !isC,
          types: TYPES.map(t => { const o = fl.type === t; return { label: t, bg: o ? "var(--crm-ink)" : "#fff", fg: o ? "#fff" : "var(--crm-ink)", bd: o ? "var(--crm-ink)" : "var(--crm-line)", pick: () => upd(d => { const x = d[si].fields[fi]; x.type = t; if (t === "Choice" && !x.opts) x.opts = []; }) }; }),
          typeLocked: !!fl.locked, typeFree: !fl.locked, isC,
          opts: (fl.opts ?? []).map((t, k) => ({ t, rm: () => upd(d => { d[si].fields[fi].opts?.splice(k, 1); }) })),
          optIn: oi[fl.id] ?? "", setOptIn: (e: { target: { value: string } }) => { const v = e.target.value; set(u => ({ ...u, frmOptIn: { ...u.frmOptIn, [fl.id]: v } })); }, addOpt,
          optKey: (e: { key: string; preventDefault(): void }) => { if (e.key === "Enter") { e.preventDefault(); addOpt(); } },
          track: fl.req ? "var(--crm-brown)" : "var(--crm-line)", knob: fl.req ? 19 : 3, toggleReq: () => upd(d => { const x = d[si].fields[fi]; x.req = x.req ? 0 : 1; }),
          reqLocked: !!fl.locked && fl.id === "name", reqFree: !(fl.locked && fl.id === "name"),
          del: () => upd(d => { d[si].fields.splice(fi, 1); }), canDel: !fl.locked, noDel: !!fl.locked }; }) })),
  };

  // ── Notifications (H4): the phone's events (same read state), plus To assign; Select → read / delete (30 s Undo).
  const base = panelNotifs(panelLike(ctx));
  const TY: Record<string, [string, string, string]> = {
    "To assign": ["var(--crm-rust)", "var(--crm-tint-attention)", "M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3M15 9l6-6"], Overdue: ["var(--crm-oxblood)", "var(--crm-tint-attention)", "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"],
    Move: ["var(--crm-ink-soft)", "var(--crm-tint-cold)", "M5 12h14M13 6l6 6-6 6"], Assign: ["var(--crm-muted)", "var(--crm-tint-cold)", "M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M16 11h6"],
    Share: ["var(--crm-ink-soft)", "var(--crm-tint-new)", "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"], Appointment: ["var(--crm-brown)", "var(--crm-tint-appt)", "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"],
    Won: ["var(--crm-brown)", "var(--crm-tint-follow)", "M20 6 9 17l-5-5"], Lost: ["var(--crm-muted)", "var(--crm-rule-soft)", "M18 6 6 18M6 6l12 12"], General: ["var(--crm-ink)", "var(--crm-field)", "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"],
  };
  const typeOf: Record<string, string> = { move: "Move", share: "Share", won: "Won", lost: "Lost", overdue: "Overdue" };
  type N = { key: string; at: string; type: string; who: string; rest: string; sub: string; cust: string | null; adId?: string };
  // An Assign alert (2026-10-23: a customer CRM · Manage handed on at once) is the `assigned` event listed below — once.
  const list0: N[] = base.filter(n => n.kind !== "assign" && n.kind !== "adsetup").map(n => ({ key: n.key, at: n.at, type: typeOf[n.kind], who: n.kind === "overdue" ? n.who : n.lead, rest: n.kind === "overdue" ? `${n.text} a reply` : `was ${n.kind === "move" ? "moved" : n.kind === "share" ? "shared" : `marked as ${n.kind}`}`,
    sub: [n.who, n.extra].filter(Boolean).join(" · "), cust: data.customers.find(c => c.name === (n.kind === "overdue" ? n.who : n.lead))?.id ?? null }));
  for (const e of data.events) {
    const k = e.kind as string, c = data.customers.find(x => x.id === e.customerId);
    if (k === "assigned") list0.push({ key: `e${e.id}`, at: e.at, type: "Assign", who: e.actor ? ctx.nameOf(e.actor) : "System", rest: `assigned ${c?.name ?? "a customer"} to ${ctx.nameOf(String(e.data.to ?? e.owner ?? ""))}`, sub: c?.ad ?? "", cust: e.customerId });
    if (k === "appt_booked") list0.push({ key: `e${e.id}`, at: e.at, type: "Appointment", who: c?.name ?? "A customer", rest: "booked a showroom visit", sub: String(e.data.room ?? ""), cust: e.customerId });
  }
  // To assign: a new organic lead, and a new ad with no split yet (worked out, never stored).
  for (const c of data.customers.filter(x => !x.assignedTo && !x.teamId && !x.held)) list0.push({ key: `a${c.id}`, at: c.createdAt, type: "To assign", who: c.name, rest: "is a new organic lead waiting to be assigned", sub: `${c.ad} · ${c.channel === "whatsapp" ? "WhatsApp" : "Messenger"}`, cust: c.id });
  const adIds = [...new Set(data.customers.map(c => c.adId).filter((x): x is string => !!x))].filter(a => !data.adRules.some(r => r.adId === a));
  for (const a of adIds) { const cs = data.customers.filter(c => c.adId === a).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    list0.push({ key: `ad${a}`, at: cs[0].createdAt, type: "To assign", who: cs[0].ad, rest: "is a new ad with no team split yet", sub: `${cs.length} leads so far · they go to the Revenue Director`, cust: null, adId: a }); }
  const deleted = new Set(data.notifDeleted ?? []);
  const NL = list0.filter(n => !deleted.has(n.key) && !(ui.undo?.kind === "delete" && ui.undo.ids?.includes(n.key))).sort((a, b) => b.at.localeCompare(a.at));
  const isRead = (n: N) => data.notifRead.includes(n.key) || (!!data.notifsSeenAt && n.at <= data.notifsSeenAt);
  // All · Unread · Read, on All (the owner, 2026-10-16: "Notification 要有一個 all，看過的要能看回去").
  const tabK = ui.ntfTab ?? "all", inTab = NL.filter(n => tabK === "all" || (tabK === "unread" ? !isRead(n) : isRead(n)));
  const CAT: [string, string, string[] | null][] = [["all", "All", null], ["toassign", "To assign", ["To assign"]], ["overdue", "Overdue", ["Overdue"]], ["move", "Move", ["Move"]], ["assign", "Assign", ["Assign"]],
    ["share", "Share", ["Share"]], ["appts", "Appointments", ["Appointment"]], ["results", "Results", ["Won", "Lost"]], ["general", "General", ["General"]]];
  const inCat = (n: N, c: string) => { const x = CAT.find(q => q[0] === c); return !x?.[2] || x[2].includes(n.type); };
  const cat = ui.ntfCat, shown = inTab.filter(n => inCat(n, cat)), unreadN = NL.filter(n => !isRead(n)).length;
  const T = new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate()).getTime();
  const pickd = ui.ntfPick, selMode = ui.ntfSel;
  const groups = [["Today", (n: N) => new Date(n.at).getTime() >= T], ["Earlier", (n: N) => new Date(n.at).getTime() < T]] as const;
  const ntfGroups = groups.map(([g, f2]) => ({ label: g.toUpperCase(), items: shown.filter(f2).map(n => { const u = !isRead(n), pk = !!pickd[n.key], ty = TY[n.type];
    const openChat = () => { if (u) act.readNotifs([n.key]); if (n.cust) patch({ tab: "inbox", pane: "docked", kind: "chat", chat: n.cust, whoSel: [] }); };
    return { cols: selMode ? "20px 10px 46px minmax(0, 1fr) auto" : "10px 46px minmax(0, 1fr) auto",
      click: selMode ? () => set(s => ({ ...s, ntfPick: { ...s.ntfPick, [n.key]: !s.ntfPick[n.key] } })) : openChat,
      who: n.who, rest: n.rest, sub: n.sub, time: new Date(n.at).getTime() >= T ? new Date(n.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }) : new Date(n.at).toLocaleDateString("en-MY", { weekday: "short" }),
      type: n.type, unread: u, bg: selMode && pk ? "var(--crm-cream-nav)" : "#fff", dotC: u ? "var(--crm-rust)" : "transparent", sel: selMode, nosel: !selMode, pk, cbBg: pk ? "var(--crm-rust)" : "#fff", cbBd: pk ? "var(--crm-rust)" : "var(--crm-faint-2)",
      pickT: (e: { stopPropagation(): void }) => { e.stopPropagation(); set(s => ({ ...s, ntfPick: { ...s.ntfPick, [n.key]: !s.ntfPick[n.key] } })); },
      icFg: ty[0], icBg: ty[1], ic: ty[2], tip: n.cust ? "Open chat" : u ? "Mark as read" : "Mark as unread",
      goAs: n.type === "To assign", goAsLabel: "Assign now",
      openAs: (e: { stopPropagation(): void }) => { e.stopPropagation(); if (u) act.readNotifs([n.key]);
        patch(n.adId ? { tab: "assignment", pane: "wideEmpty", pick: 1, stage: "op", ad: n.adId, adSt: "all", sendFor: null, awChat: null } : { tab: "assignment", pane: "wideEmpty", pick: 0, stage: "op", sendFor: n.cust, awChat: null }); },
      goCp: ["Move", "Assign", "Share"].includes(n.type), cust: n.who,
      open: (e: { stopPropagation(): void }) => { if (!["Move", "Assign", "Share"].includes(n.type)) return; e.stopPropagation(); if (u) act.readNotifs([n.key]);
        patch({ tab: "assignment", pane: "wideEmpty", pick: 4, stage: "op", cpSel: n.cust, awChat: null, sendFor: null, cpF: "All", cpP: null, cpMine: false, cpT: "This month" }); },
      toggle: () => { if (u) act.readNotifs([n.key]); } }; }) })).filter(g => g.items.length);
  const ids = shown.map(n => n.key), nP = ids.filter(x => pickd[x]).length, allP = ids.length > 0 && nP === ids.length;
  // ── General (frame 10): the rules the CRM runs on. Reply soon · Urgent · Overdue, Suggest a template and Auto-assign
  // are stored (mig 20261018100000, the owner: "可以，照这三项做") and editable with CRM · Manage; the rest stay locked
  // (set by Meta or by each phone). The draft lives in DeskSettings4a; Save sends the five together (crm_save_settings).
  const cur = data.settings ?? DEFAULT_CRM_SETTINGS;
  const h = (n: number) => `${n} h`;
  const set4: Set4Group[] = [
    { title: "Reply targets", sub: "How long a customer waits before the urgency line changes", rows: [
      { t: "Reply soon", s: "Shown in the list and on the phone", v: h(cur.replySoonH), key: "replySoonH" },
      { t: "Urgent", s: "The row turns oxblood", v: h(cur.replyUrgentH), key: "replyUrgentH" },
      { t: "Overdue", s: "The person's own phone is told", v: `${h(cur.replyOverdueH)}+`, key: "replyOverdueH" }] },
    { title: "Cold leads", sub: "Meta allows free replies for 24 hours after the customer's last message", rows: [
      { t: "Reply window", s: "Set by WhatsApp and Messenger", v: "24 h" },
      { t: "Move to Cold leads", s: "When the reply window shuts · only a template can reopen the chat", v: "24 h" },
      { t: "Suggest a template", s: "Shows the template button on a cold chat", v: cur.suggestTemplate ? "On" : "Off", key: "suggestTemplate" }] },
    { title: "Notifications", sub: "Only a person's own customers ever notify", rows: [
      { t: "Push for new messages", s: cur.pushMessages ? "Each phone turns its own on · Revenue app › Settings" : "Off · no phone is told of a customer's message", v: cur.pushMessages ? "On" : "Off", key: "pushMessages" },
      { t: "Reminders", s: `Visits tomorrow and today, chats waiting ${cur.replySoonH} · ${cur.replyUrgentH} · ${cur.replyOverdueH} h, windows closing`, v: cur.reminders ? "On" : "Off", key: "reminders" },
      { t: "Team inbox alerts", s: cur.teamAlerts ? "Managers get alerts for their own people's chats" : "Off · each person hears of their own customers only", v: cur.teamAlerts ? "On" : "Off", key: "teamAlerts" }] },
    { title: "New leads", sub: "What happens when a lead arrives", rows: [
      { t: "Auto-assign by the ad's split", s: cur.autoAssign ? "Uses Assignment › Ads to teams · an ad with no split goes to the Revenue Director" : "Off · new leads wait in the Team inbox to be sent by hand", v: cur.autoAssign ? "On" : "Off", key: "autoAssign" },
      { t: "Send auto-reply", s: cur.sendAutoReply ? "The person's own auto-reply, if set in their Profile" : "Off · no auto-reply for anyone", v: cur.sendAutoReply ? "On" : "Off", key: "sendAutoReply" }] },
  ];
  const settings4 = {
    can: !!data.can.manage, cur,
    save: (st: CrmSettings) => act.saveSettings(st).then(okd => { if (okd) patch({ toast: "Saved · Settings" }); return okd; }),
  };
  // Settings › Reply library (2026-10-29): the company's good replies, kept by CRM · Manage, read by everybody.
  const replyLib = {
    can: !!data.can.manage, items: data.replyLibrary ?? [],
    save: (items: CrmReplyItem[]) => act.saveReplyLibrary(items).then(okd => { if (okd) patch({ toast: "Saved · Reply library" }); return okd; }),
  };
  // A partner's booking link (mig 20261029190000): the link, and the booking open in the pane.
  const pb = (data.partnerBookings ?? []).find(b => b.id === ui.partner);
  const partnerPane = pb ? {
    b: pb, room: data.rooms.find(r => r.id === pb.showroomId)?.name ?? "Showroom",
    partnerName: (data.partnerLinks ?? []).find(l => l.id === pb.partner)?.name ?? (pb.partner === "the_conts" ? "The Conts" : "Partner"),
    can: !!data.can.manage,
    // Its answers under the booking form's own words (the one in use; 2026-10-29), else the old six's.
    infoRows: Object.entries(pb.info ?? {}).filter(([, val]) => val).map(([k, val]) => ({ label: infoLabel(formFromRow(data.bookingForms?.[0]?.sections), k), value: val })),
    cancel: () => act.cancelPartnerBooking(pb.id).then(okd => { if (okd) patch({ toast: `Cancelled · ${pb.customer}` }); return okd; }),
  } : null;
  const partnerLink = {
    can: !!data.can.manage, links: data.partnerLinks ?? [],
    upcoming: (data.partnerBookings ?? []).filter(b => b.state === "booked" && new Date(b.start) >= new Date(ctx.now.getTime() - 3_600_000)),
    roomName: (id: string) => data.rooms.find(r => r.id === id)?.name ?? "Showroom",
    set: (id: string, on: boolean | null, fresh: boolean) => act.setPartnerLink(id, on, fresh).then(okd => { if (okd) patch({ toast: fresh ? "New link made · the old one stops opening" : on ? "Booking link on" : "Booking link off" }); return okd; }),
    open: (id: string) => patch({ pane: "docked", kind: "partner", partner: id, visit: null, infoId: null }),
    toast: (msg: string) => patch({ toast: msg }),
  };
  return {
    set4, settings4, replyLib, partnerPane, partnerLink,
    actVM, mwtTeams, mwtDirty: dirty, mwtClean: !dirty, mwtBtnBg: dirty ? "var(--crm-rust)" : "var(--crm-line)", mwtBtnCur: dirty ? "pointer" : "default", mwtSavedMsg: !dirty && ui.mwtSaved, mwtSave,
    cltOpen: !ui.frmOpen && !!cE && opItem === "Cold lead templates" && sheetOpen, cltE: cE ?? card({ t: { id: "", name: "", ch: "whatsapp", st: "draft", body: "", on: false, metaName: null, language: "en", reason: null }, status: "Draft", ch: "WhatsApp" }),
    cltTaRef: { current: null },
    cltNewT: () => patch({ frmOpen: false, frmDraft: null, cltF: "all", cltEdit: "new", cltDraft: "", cltDN: "", cltDC: "WhatsApp", cltIsNew: true }),
    cltCards: cards, cltEmpty: !cards.length, cltFOpen: ui.cltFOpen, cltToggleF: () => set(u => ({ ...u, cltFOpen: !u.cltFOpen })),
    cltFLabel: f === "all" ? "All statuses" : f, cltFDot: DOT[f] ?? "var(--crm-muted)",
    cltFOpts: [["all", "All statuses"], ["Approved", "Approved"], ["In review", "In review"], ["Draft", "Draft"], ["Rejected", "Rejected"]].map(([k, label]) => ({ label, dot: DOT[k], n: String(tpls.filter(t => k === "all" || t.status === k).length),
      bg: k === f ? "var(--crm-tint-attention)" : "transparent", fg: k === f ? "var(--crm-rust)" : "var(--crm-ink)", pick: () => patch({ cltF: k, cltFOpen: false }) })),
    ...frm,
    ntfCats: CAT.map(([k, label]) => { const o = cat === k, n = inTab.filter(x => inCat(x, k)).length;
      return { label, n: String(n), hasN: true, bg: o ? "#fff" : "transparent", sh: o ? "0 1px 3px rgba(42,22,12,.14)" : "none", fg: o ? "var(--crm-ink)" : "var(--crm-muted)", fw: o ? 700 : 600,
        nbg: o ? "var(--crm-rust)" : n ? "var(--crm-rule)" : "transparent", nfg: o ? "#fff" : n ? "var(--crm-ink-soft)" : "var(--crm-faint)", pick: () => patch({ ntfCat: k }) }; }),
    ntfHead: unreadN ? `${unreadN} unread · ${NL.filter(n => new Date(n.at).getTime() >= T - 6 * 86_400_000).length} this week` : "All caught up",
    ntfSelMode: selMode, ntfNoSel: !selMode, ntfSelOn: () => patch({ ntfSel: true, ntfPick: {} }), ntfSelOff: () => patch({ ntfSel: false, ntfPick: {} }),
    ntfSelN: nP ? `${nP} selected` : "Select messages", ntfAllLabel: allP ? "Clear all" : "Select all", ntfHasPick: nP > 0,
    ntfActBd: nP ? "var(--crm-line)" : "var(--crm-rule-soft)", ntfActFg: nP ? "var(--crm-ink)" : "var(--crm-faint-2)", ntfDelFg: nP ? "var(--crm-oxblood)" : "var(--crm-st-won)", ntfDelBd: nP ? "var(--crm-tint-attention)" : "var(--crm-tint-attention)", ntfActCur: nP ? "pointer" : "default", ntfActOp: nP ? 1 : 0.45,
    ntfSelAll: () => patch({ ntfPick: allP ? {} : Object.fromEntries(ids.map(x => [x, true])) }),
    ntfReadSel: () => { if (!nP) return; act.readNotifs(ids.filter(x => pickd[x])); patch({ ntfPick: {}, ntfSel: false }); },
    ntfDelSel: () => { if (!nP) return; const keys = ids.filter(x => pickd[x]);
      void ctx.deskAct.deleteNotifs(keys).then(okd => { if (okd) patch({ ntfPick: {}, ntfSel: false, toast: `Deleted ${keys.length} ${keys.length === 1 ? "notification" : "notifications"}`, undo: { kind: "delete", ids: keys, until: Date.now() + 30_000 } }); }); },
    ntfGroups, ntfEmpty: !shown.length, ntfEmptyMsg: tabK === "unread" ? "No unread notifications" : tabK === "read" ? "No read notifications" : "No notifications yet",
    ntfNoUnread: !unreadN, ntfMarkFg: unreadN ? "var(--crm-rust)" : "var(--crm-faint-2)", ntfMarkCur: unreadN ? "pointer" : "default",
    ntfMarkAll: () => { const k = NL.filter(n => !isRead(n)).map(n => n.key); if (k.length) act.readNotifs(k, true); },
    ntfTabs: ([["all", "All", 0], ["unread", "Unread", unreadN], ["read", "Read", 0]] as const).map(([k, label, n]) => { const o = tabK === k;
      return { label, n: String(n), hasN: n > 0, bg: o ? "#fff" : "transparent", sh: o ? "0 1px 3px rgba(42,22,12,.14)" : "none", fw: o ? 700 : 600, fg: o ? "var(--crm-ink)" : "var(--crm-muted)", pick: () => patch({ ntfTab: k }) }; }),
    urgency: (id: string) => { const c = data.customers.find(x => x.id === id); return c ? urgencyOf(c, ctx.now) : null; },
  };
}
