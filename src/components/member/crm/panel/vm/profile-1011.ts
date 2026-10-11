/**
 * Profile, rev 1011: Member work type (every team member, full time or part time — who appears in Full time lead
 * allocation) and Cold lead templates (per-template switch; only Approved can be on). Both CRM · Manage only. Ported from
 * the prototype (`fts`, `tp`).
 *
 * The full-time switch saves through crm_set_full_time, which also clears a part-timer's ticked days (proposal D,
 * mig 20261011130000). WAITING FOR THE DATABASE (proposal E): the templates need their own table and Meta's review;
 * until then every template write says so instead of pretending to save.
 */
import type { ChangeEvent, MouseEvent } from "react";
import { jobTitle } from "../../shared/people";
import { ini, stop, type PanelCtx } from "./common";

const NOT_YET = "Not connected yet — waiting for the database change";

export function memberWorkTypeVM(ctx: PanelCtx) {
  const { ui, patch, teams } = ctx;
  const all = teams.flatMap(t => t.people), on = all.filter(p => p.fullTime).length;
  return {
    open: !!ui.ftsOpen && ui.tab === "profile", openPage: () => patch({ ftsOpen: true }), close: () => patch({ ftsOpen: false }),
    sub: on + " of " + all.length + " members full time",
    groups: teams.map(t => ({
      name: t.name, c: t.c, count: t.people.filter(p => p.fullTime).length + " of " + t.people.length + " full time",
      people: t.people.map((p, k) => ({
        name: p.name, ini: ini(p.name), title: jobTitle(p), rule: k ? "1px solid #F3E9E1" : "0",
        swBg: p.fullTime ? "#387557" : "#D9C7BA", swX: p.fullTime ? "21px" : "3px",
        toggle: () => { const on = !p.fullTime; void ctx.act.setFullTime(p.id, on).then(ok => { if (ok) patch({ toast: p.name + (on ? " is now full time" : " is now part time") }); }); },
      })),
    })),
  };
}

type Tpl = { id: string; name: string; ch: "whatsapp" | "messenger"; st: "approved" | "review" | "rejected" | "draft"; body: string; on?: boolean };
const ST = { approved: ["Approved", "#E4F1E8", "#387557"], review: ["In review", "#FFF3D6", "#A46312"], rejected: ["Rejected", "#FBE4DE", "#A3371A"], draft: ["Draft", "#F2EDE9", "#806B60"] } as const;

export function templatesVM(ctx: PanelCtx) {
  const { ui, patch } = ctx;
  const tpls: Tpl[] = [];
  const ed = ui.tplEd, putE = (p: Partial<NonNullable<typeof ed>>) => { if (ed) patch({ tplEd: { ...ed, ...p } }); };
  const okE = !!ed && !!ed.name.trim() && !!ed.body.trim();
  const nApp = tpls.filter(t => t.st === "approved" && t.on !== false).length, tplOn = nApp > 0;
  return {
    open: !!ui.tplOpen && ui.tab === "profile", openPage: () => patch({ tplOpen: true }), close: () => patch({ tplOpen: false, tplEd: null }), stop,
    rowSub: tplOn ? "On · " + nApp + " approved" : "Off for salespeople", rowFg: tplOn ? "#387557" : "#806B60",
    toggle: () => patch({ toast: NOT_YET }),
    swBg: tplOn ? "#387557" : "#D9C7BA", swX: tplOn ? "21px" : "3px", swBd: tplOn ? "#B9D8C4" : "#EBDDD2",
    swSub: tplOn ? "On. Salespeople see the approved templates in a cold lead's chat." : "Off. Set up and approve templates now; turn this on when you're ready.",
    add: () => patch({ tplEd: { id: null, name: "", ch: "whatsapp", body: "" } }),
    list: tpls.map(t => {
      const app = t.st === "approved", on = app && t.on !== false;
      return { swBg: on ? "#387557" : "#D9C7BA", swX: on ? "19px" : "3px", swOp: app ? 1 : 0.45, swCur: app ? "pointer" : "not-allowed",
        swTitle: app ? (on ? "Turn off" : "Turn on") : "Can be turned on once approved",
        toggle: (e: MouseEvent<HTMLElement>) => { e.stopPropagation(); if (app) patch({ toast: NOT_YET }); },
        name: t.name, body: t.body, channel: t.ch === "messenger" ? "Messenger" : "WhatsApp", chFg: t.ch === "messenger" ? "#2F6FB5" : "#1F7A4D",
        status: ST[t.st][0], stBg: ST[t.st][1], stFg: ST[t.st][2], edit: () => patch({ tplEd: { id: t.id, name: t.name, ch: t.ch, body: t.body } }) };
    }),
    edOpen: !!ed, edClose: () => patch({ tplEd: null }), edTitle: ed?.id ? "Edit template" : "New template", edCanDel: !!ed?.id,
    edDel: () => patch({ toast: NOT_YET }),
    edName: ed?.name ?? "", edSetName: (e: ChangeEvent<HTMLInputElement>) => putE({ name: e.target.value }),
    edBody: ed?.body ?? "", edSetBody: (e: ChangeEvent<HTMLTextAreaElement>) => putE({ body: e.target.value }), edPh: "Hi {name}, …",
    edInsName: () => { const b = ed?.body ?? ""; putE({ body: b + (b && !/\s$/.test(b) ? " " : "") + "{name}" }); },
    edChs: ([["whatsapp", "WhatsApp"], ["messenger", "Messenger"]] as const).map(([k, label]) => ({ label, pick: () => putE({ ch: k }),
      bg: ed?.ch === k ? "#fff" : "transparent", fg: ed?.ch === k ? "#3F2B22" : "#806B60", w: ed?.ch === k ? 650 : 500, sh: ed?.ch === k ? "0 1px 3px rgba(63,43,34,.12)" : "none" })),
    edOkBg: okE ? "#BD4A19" : "#D9C7BA", edDraft: () => { if (okE) patch({ toast: NOT_YET }); }, edSubmit: () => { if (okE) patch({ toast: NOT_YET }); },
  };
}
