/**
 * Labels on the desktop (2026-11-02, the owner: "业务员可以自己标记（label）他们的 lead，并且可以做筛选" — the phone's Mine
 * has had them since the redesign; asked where, "1": the desktop too, each person's own as on the phone). One's own list
 * (crm_labels, `data.labels`) and which customers carry which (`data.customerLabels`), written through the phone's own
 * actions (`act.saveLabels` → crm_save_labels, `act.setLabel` → crm_set_label). The list starts as the phone's four
 * (DEFAULT_LABELS) and is saved the first time one is used, as the phone does.
 */
import { DEFAULT_LABELS, LABEL_SWATCHES, type CrmCustomer, type CrmData, type CrmLabel } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";

/** One's labels on a customer, in the list's order. */
export const labelsOn = (data: Pick<CrmData, "labels" | "customerLabels">, customerId: string): CrmLabel[] =>
  (data.labels ?? []).filter(l => (data.customerLabels?.[customerId] ?? []).includes(l.id));

/** The Customer info block: every label of one's own, ticked where the customer carries it; add one; delete one. */
export function deskLabelsVM(ctx: DeskCtx, c: CrmCustomer | undefined) {
  const { ui, set, patch, data, act } = ctx;
  const list: { id: string | null; name: string; color: string }[] = data.labels.length ? data.labels : DEFAULT_LABELS.map(l => ({ id: null, ...l }));
  const on = new Set(c ? data.customerLabels[c.id] ?? [] : []);
  /** The list kept in the database before a label goes on a customer (the first use saves the four). */
  const ensure = async () => (data.labels.length ? data.labels : await act.saveLabels(list.map(l => ({ name: l.name, color: l.color }))));
  const draft = ui.labNew ?? "";
  const taken = (n: string) => list.some(l => l.name.trim().toLowerCase() === n.trim().toLowerCase());
  return {
    editing: !!ui.labEdit,
    toggleEdit: () => set(u => ({ ...u, labEdit: !u.labEdit, labNew: "" })),
    items: list.map(l => ({
      key: l.id ?? `name:${l.name}`, name: l.name, color: l.color, on: !!l.id && on.has(l.id),
      toggle: async () => {
        if (!c) return;
        const saved = await ensure(); const real = saved?.find(x => x.name === l.name); if (!real) return;
        await act.setLabel(c.id, real.id, !on.has(real.id));
      },
      remove: async () => { await act.saveLabels(list.filter(x => x.name !== l.name).map(x => ({ id: x.id, name: x.name, color: x.color }))); },
    })),
    draft, setDraft: (e: { target: { value: string } }) => patch({ labNew: e.target.value.slice(0, 30) }),
    canAdd: !!draft.trim() && !taken(draft) && list.length < 30,
    /** A new label, in the next colour, put on this customer at once. */
    add: async () => {
      const name = draft.trim(); if (!name || taken(name) || list.length >= 30) return;
      const saved = await act.saveLabels([...list.map(l => ({ id: l.id, name: l.name, color: l.color })), { name, color: LABEL_SWATCHES[list.length % LABEL_SWATCHES.length] }]);
      const real = saved?.find(x => x.name === name);
      patch({ labNew: "" });
      if (real && c) await act.setLabel(c.id, real.id, true);
    },
  };
}
