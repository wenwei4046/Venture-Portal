/**
 * One's labels on a customer, and the Label sheet's view (CRM redesign v4, notes/15 — frames 11a / 11b): the Inbox's
 * swipe › More › Label, the chat's ⋮ › Label (Mine and Team on the phone) and the desktop chat's ⋮ › Label all draw
 * this one list — tick a label to put it on or take it off at once, the pencil edits it, New label adds one — and write
 * through the phone's own actions (`act.setLabel` → crm_set_label, `act.saveLabels` → crm_save_labels). The list starts
 * as the design's four (DEFAULT_LABELS) and is saved the first time one is used (`ensure`).
 */
import type { ChangeEvent, MouseEvent } from "react";
import { DEFAULT_LABELS, LABEL_SWATCHES, type CrmData, type CrmLabel } from "@/lib/member/crm-data";
import type { SalesActions } from "../sales/actions";

export type LabelView = "labels" | "labelEdit";
export interface LabelFormState { key: string | null; name: string; color: string }

/** The labels a customer carries, in the order they were put on. */
export const labelsOn = (data: Pick<CrmData, "labels" | "customerLabels">, customerId: string): CrmLabel[] =>
  (data.customerLabels?.[customerId] ?? []).map(id => data.labels.find(l => l.id === id)).filter((l): l is CrmLabel => !!l);

/** The ⋮ menu's second line for Label (11a): the names joined with " · ", or "Add a label". */
export const labelSub = (data: Pick<CrmData, "labels" | "customerLabels">, customerId: string) =>
  labelsOn(data, customerId).map(l => l.name).join(" · ") || "Add a label";

/** The tag icon of the Label item (11a) and the Inbox's More › Label. */
export const LABEL_ICON = "M3 12V4h8l10 10-8 8L3 12Zm5-4h.01";

export interface LabelSheetIn {
  data: Pick<CrmData, "labels" | "customerLabels">;
  act: Pick<SalesActions, "saveLabels" | "setLabel">;
  /** The customer the ticks are for (none: the list only). */
  customerId: string | null;
  form: LabelFormState | null;
  /** Moves the sheet between its list and its form, and keeps the form's words. */
  put: (p: { view?: LabelView; form?: LabelFormState | null }) => void;
}

export function labelSheetVM({ data, act, customerId, form, put }: LabelSheetIn) {
  const list: { id: string | null; name: string; color: string }[] = data.labels.length ? data.labels : DEFAULT_LABELS.map(l => ({ id: null, ...l }));
  const on = customerId ? labelsOn(data, customerId).map(l => l.name) : [];
  const keyOf = (l: { id: string | null; name: string }) => l.id ?? `name:${l.name}`;
  const fm = form ?? { key: null, name: "", color: LABEL_SWATCHES[0] };
  const okName = !!fm.name.trim() && !list.some(l => keyOf(l) !== fm.key && l.name.toLowerCase() === fm.name.trim().toLowerCase());
  /** Labels exist in the database before one goes on a customer. */
  const ensure = async () => (data.labels.length ? data.labels : await act.saveLabels(list.map(l => ({ name: l.name, color: l.color }))));
  return {
    /** The names on the customer (the Inbox's More › "Label · …"). */
    names: on,
    labelItems: list.map((l, k) => {
      const isOn = on.includes(l.name);
      return { label: l.name, dot: l.color, rule: k ? "1px solid var(--crm-rule)" : "0", on: isOn, ring: isOn ? "var(--crm-rust)" : "var(--crm-line)", fill: isOn ? "var(--crm-rust)" : "transparent",
        edit: (e: MouseEvent) => { e.stopPropagation(); put({ view: "labelEdit", form: { key: keyOf(l), name: l.name, color: l.color } }); },
        go: async () => {
          if (!customerId) return;
          const saved = await ensure();
          const lab = saved?.find(x => x.name.toLowerCase() === l.name.toLowerCase());
          if (lab) await act.setLabel(customerId, lab.id, !isOn);
        } };
    }),
    labelNew: () => put({ view: "labelEdit", form: { key: null, name: "", color: LABEL_SWATCHES[0] } }),
    labelFormBack: () => put({ view: "labels" }),
    labelFormTitle: fm.key == null ? "New label" : "Edit label",
    labelFormName: fm.name, labelCanDelete: fm.key != null,
    labelSetName: (e: ChangeEvent<HTMLInputElement>) => put({ form: { ...fm, name: e.target.value } }),
    labelSwatches: LABEL_SWATCHES.map(c => ({ c, ring: c === fm.color ? "#fff" : c, pick: () => put({ form: { ...fm, color: c } }) })),
    labelSaveBg: okName ? "var(--crm-rust)" : "var(--crm-line)", labelSaveCur: okName ? "pointer" : "default",
    labelSave: okName ? async () => {
      const nm = fm.name.trim();
      const next = fm.key == null ? [...list.map(l => ({ id: l.id, name: l.name, color: l.color })), { id: null, name: nm, color: fm.color }]
        : list.map(l => (keyOf(l) === fm.key ? { id: l.id, name: nm, color: fm.color } : { id: l.id, name: l.name, color: l.color }));
      if (await act.saveLabels(next)) put({ view: "labels", form: null });
    } : undefined,
    labelDelete: async () => {
      if (fm.key == null) return;
      if (await act.saveLabels(list.filter(l => keyOf(l) !== fm.key).map(l => ({ id: l.id, name: l.name, color: l.color })))) put({ view: "labels", form: null });
    },
  };
}
export type LabelSheetVM = ReturnType<typeof labelSheetVM>;

/** The chat's Label sheet (11b): the view it shows and its Done, over the shared list. */
export type ChatLabelSheet = LabelSheetVM & { list: boolean; editing: boolean; done: () => void };
