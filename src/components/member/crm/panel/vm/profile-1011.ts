/**
 * Profile, rev 1011: Member work type (every team member, full time or part time — who appears in Full time lead
 * allocation) and Cold lead templates (per-template switch; only Approved can be on). Both CRM · Manage only. Ported from
 * the prototype (`fts`, `tp`).
 *
 * The full-time switch saves through crm_set_full_time, which also clears a part-timer's ticked days (proposal D,
 * mig 20261011130000). Templates live in crm_templates (proposal E, mig 20261011140000): a WhatsApp one goes to Meta's
 * review (submitCrmTemplate) and comes back Approved / Rejected (refreshCrmTemplates, on opening the page); Messenger
 * ones stay drafts — not connected.
 */
import type { ChangeEvent, MouseEvent } from "react";
import { jobTitle } from "../../shared/people";
import { ini, stop, type PanelCtx } from "./common";
import { CHANNEL_COLOUR, CHANNEL_TINT } from "../../shared/palette";


export function memberWorkTypeVM(ctx: PanelCtx) {
  const { ui, patch, teams } = ctx;
  // A switch changes the draft; Save writes what changed, Cancel drops it (the owner, 2026-10-18: "新加save按钮" — each
  // switch used to save itself the moment it was tapped).
  const draft = ui.ftsDraft ?? {}, cur = (p: { id: string; fullTime: boolean }) => draft[p.id] ?? p.fullTime;
  const all = teams.flatMap(t => t.people), on = all.filter(cur).length;
  const changed = all.filter(p => draft[p.id] != null && draft[p.id] !== p.fullTime);
  return {
    open: !!ui.ftsOpen && (ui.tab === "profile" || ui.tab === "assign"), openPage: () => patch({ ftsOpen: true, ftsDraft: null }), close: () => patch({ ftsOpen: false, ftsDraft: null }),
    sub: on + " of " + all.length + " members full time",
    dirty: changed.length > 0, saveLabel: changed.length === 1 ? "Save 1 change" : "Save " + changed.length + " changes",
    cancel: () => patch({ ftsDraft: null }),
    save: () => void Promise.all(changed.map(p => ctx.act.setFullTime(p.id, !!draft[p.id]))).then(rs => {
      if (rs.every(Boolean)) patch({ ftsDraft: null, toast: "Saved · Member work type" });
    }),
    groups: teams.map(t => ({
      name: t.name, c: t.c, count: t.people.filter(cur).length + " of " + t.people.length + " full time",
      people: t.people.map((p, k) => ({
        name: p.name, ini: ini(p.name), title: jobTitle(p), rule: k ? "1px solid var(--crm-rule-soft)" : "0",
        swBg: cur(p) ? "var(--crm-brown)" : "var(--crm-line)", swX: cur(p) ? "21px" : "3px",
        toggle: () => patch({ ftsDraft: { ...draft, [p.id]: !cur(p) } }),
      })),
    })),
  };
}

const ST = { approved: ["Approved", "var(--crm-tint-follow)", "var(--crm-brown)"], review: ["In review", "var(--crm-tint-appt)", "var(--crm-brown)"], rejected: ["Rejected", "var(--crm-tint-attention)", "var(--crm-oxblood)"], draft: ["Draft", "var(--crm-field)", "var(--crm-muted)"] } as const;

export function templatesVM(ctx: PanelCtx) {
  const { ui, patch, act } = ctx;
  const tpls = ctx.data.templates ?? [];
  const ed = ui.tplEd, putE = (p: Partial<NonNullable<typeof ed>>) => { if (ed) patch({ tplEd: { ...ed, ...p } }); };
  const okE = !!ed && !!ed.name.trim() && !!ed.body.trim();
  // Save draft / Submit for review: saved first; the toast once it is.
  const saveE = (submit: boolean) => {
    if (!ed || !okE) return;
    void act.saveTemplate({ id: ed.id, name: ed.name, ch: ed.ch, body: ed.body }, submit).then(t => {
      if (t) patch({ tplEd: null, toast: submit ? t.name + " sent for review" : t.name + " saved as draft" });
    });
  };
  return {
    // Opening the page brings in Meta's review of what was submitted (it arrives with the next read).
    open: !!ui.tplOpen && ui.tab === "profile", openPage: () => { patch({ tplOpen: true }); void act.refreshTemplates(); }, close: () => patch({ tplOpen: false, tplEd: null }), stop,
    add: () => patch({ tplEd: { id: null, name: "", ch: "whatsapp", body: "" } }),
    list: tpls.map(t => {
      const app = t.st === "approved", on = app && t.on;
      return { swBg: on ? "var(--crm-brown)" : "var(--crm-line)", swX: on ? "19px" : "3px", swOp: app ? 1 : 0.45, swCur: app ? "pointer" : "not-allowed",
        swTitle: app ? (on ? "Turn off" : "Turn on") : "Can be turned on once approved",
        toggle: (e: MouseEvent<HTMLElement>) => {
          e.stopPropagation();
          if (app) void act.templateOn(t.id, !on).then(ok => { if (ok) patch({ toast: t.name + (on ? " off" : " on") + " for salespeople" }); });
        },
        name: t.name, body: t.body, channel: t.ch === "messenger" ? "Messenger" : "WhatsApp", chFg: t.ch === "messenger" ? CHANNEL_COLOUR.messenger : CHANNEL_COLOUR.whatsapp,
        status: ST[t.st][0], stBg: ST[t.st][1], stFg: ST[t.st][2], edit: () => patch({ tplEd: { id: t.id, name: t.name, ch: t.ch, body: t.body } }) };
    }),
    edOpen: !!ed, edClose: () => patch({ tplEd: null }), edTitle: ed?.id ? "Edit template" : "New template", edCanDel: !!ed?.id,
    edDel: () => { if (ed?.id) void act.deleteTemplate(ed.id).then(ok => { if (ok) patch({ tplEd: null }); }); },
    edName: ed?.name ?? "", edSetName: (e: ChangeEvent<HTMLInputElement>) => putE({ name: e.target.value }),
    edBody: ed?.body ?? "", edSetBody: (e: ChangeEvent<HTMLTextAreaElement>) => putE({ body: e.target.value }), edPh: "Hi {name}, …",
    edInsName: () => { const b = ed?.body ?? ""; putE({ body: b + (b && !/\s$/.test(b) ? " " : "") + "{name}" }); },
    edChs: ([["whatsapp", "WhatsApp"], ["messenger", "Messenger"]] as const).map(([k, label]) => ({ label, pick: () => putE({ ch: k }),
      bg: ed?.ch === k ? "#fff" : "transparent", fg: ed?.ch === k ? "var(--crm-ink)" : "var(--crm-muted)", w: ed?.ch === k ? 650 : 500, sh: ed?.ch === k ? "0 1px 3px rgba(42,22,12,.12)" : "none" })),
    edOkBg: okE ? "var(--crm-rust)" : "var(--crm-line)", edDraft: () => saveE(false), edSubmit: () => saveE(true),
  };
}
