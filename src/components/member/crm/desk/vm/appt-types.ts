/**
 * Showrooms › Appointment types (the owner, 2026-10-24: "在電腦端有個控制面板，可以放在showroom 那邊 … 做成類似customer form
 * 一樣的，我可以加任何需要的東西，就不用一直跑程式"): the types beside Showroom that every Book visit offers — each online
 * or at a place, on or off, with its own questions — edited as a draft and saved whole (crm_save_appt_types, CRM · Manage).
 * Date and time are always asked; they are not questions here.
 */
import { DEFAULT_APPT_TYPES, type ApptField, type ApptFieldKind, type ApptType } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";

/** An id for something new: a short slug of its name and a few letters, so two of the same name never meet. */
export const newId = (label: string) => `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "x"}-${Math.random().toString(36).slice(2, 6)}`;

/** Why the draft cannot be saved yet, as crm_save_appt_types() would refuse it; "" when it can. */
export function typesProblem(types: ApptType[]): string {
  if (types.length > 12) return "Up to 12 appointment types.";
  for (const t of types) {
    if (!t.label.trim()) return "Name each appointment type.";
    if (t.fields.length > 20) return `"${t.label}": up to 20 questions.`;
    if (t.fields.some(f => !f.label.trim())) return `"${t.label}": name each question.`;
    if (t.fields.some(f => f.kind === "choice" && !(f.options ?? []).some(o => o.trim()))) return `"${t.label}": give each choice question its choices.`;
    if (t.base === "place" && !t.fields.some(f => f.kind === "place")) return `"${t.label}" is at a place: give it a Place question.`;
  }
  return "";
}

export function apptTypesVM(ctx: DeskCtx) {
  const { ui, patch, data } = ctx;
  const saved = data.apptTypes ?? DEFAULT_APPT_TYPES, types = ui.atDraft ?? saved;
  const dirty = !!ui.atDraft && JSON.stringify(ui.atDraft) !== JSON.stringify(saved);
  const canEdit = data.can.manage, problem = typesProblem(types);
  const put = (next: ApptType[]) => patch({ atDraft: next });
  const setT = (i: number, p: Partial<ApptType>) => put(types.map((t, k) => (k === i ? { ...t, ...p } : t)));
  const setF = (i: number, j: number, p: Partial<ApptField>) => setT(i, { fields: types[i].fields.map((f, k) => (k === j ? { ...f, ...p } : f)) });
  const move = <T,>(list: T[], j: number, d: number) => { const k = j + d; if (k < 0 || k >= list.length) return list; const n = [...list]; [n[j], n[k]] = [n[k], n[j]]; return n; };
  return {
    canEdit, dirty, problem,
    types: types.map((t, i) => ({
      ...t,
      setLabel: (v: string) => setT(i, { label: v }),
      toggle: () => setT(i, { on: !t.on }),
      setBase: (b: "online" | "place") => setT(i, { base: b }),
      up: i > 0 ? () => put(move(types, i, -1)) : undefined,
      down: i < types.length - 1 ? () => put(move(types, i, 1)) : undefined,
      remove: () => put(types.filter((_, k) => k !== i)),
      addField: () => setT(i, { fields: [...t.fields, { id: newId("question"), label: "", kind: "text" }] }),
      fields: t.fields.map((f, j) => ({
        ...f,
        setLabel: (v: string) => setF(i, j, { label: v }),
        setKind: (k: ApptFieldKind) => setF(i, j, { kind: k, ...(k === "choice" && !f.options ? { options: [] } : {}) }),
        toggleRequired: () => setF(i, j, { required: !f.required }),
        // Choices are typed one a line or comma-separated; empty ones dropped on save.
        optionsText: (f.options ?? []).join(", "),
        setOptions: (v: string) => setF(i, j, { options: v.split(",").map(x => x.trimStart()) }),
        up: j > 0 ? () => setT(i, { fields: move(t.fields, j, -1) }) : undefined,
        down: j < t.fields.length - 1 ? () => setT(i, { fields: move(t.fields, j, 1) }) : undefined,
        remove: () => setT(i, { fields: t.fields.filter((_, k) => k !== j) }),
      })),
    })),
    addType: () => put([...types, { id: newId("type"), label: "", on: true, base: "place", fields: [{ id: "place", label: "Place", kind: "place", required: true }, { id: "remarks", label: "Remarks", kind: "long" }] }]),
    reset: () => patch({ atDraft: null }),
    save: () => {
      if (!canEdit || !dirty || problem) { if (problem && dirty) patch({ toast: problem }); return; }
      const clean = types.map(t => ({ ...t, label: t.label.trim(), fields: t.fields.map(f => ({ ...f, label: f.label.trim(), ...(f.kind === "choice" ? { options: (f.options ?? []).map(o => o.trim()).filter(Boolean) } : { options: undefined }) })) }));
      void ctx.act.saveApptTypes(clean).then(ok => { if (ok) patch({ atDraft: null, toast: "Appointment types saved" }); });
    },
  };
}
