/**
 * The desktop chat's ⋮ menu (CRM redesign v4, notes/24 §3 — frame D5a of docs/design_handoff_crm_redesign_v4/CRM Optimized
 * Desktop.dc.html): the phone's items (sales/vm/chat.ts › hm.items) — Assign to (if allowed) · Share · Move (if allowed) ·
 * Customer info · Appointment · Label (notes/15) — then a divider and Block NAME in oxblood, the Inbox's More › Block.
 * Each a 34px tile in its tint, the name 600 14px, a second line 12px muted where it has one.
 */
import type { DeskCtx } from "./ctx";
import { LABEL_ICON, labelSub } from "../../shared/label-sheet";

export interface DeskMenuItem {
  label: string; sub: string | null; d: string; bg: string; fg: string; run: () => void;
  /** A line above it (Block). */
  sep: boolean; danger: boolean;
  /** The icon's colour, as the v2 markup reads it. */
  c: string;
}

const ICON = {
  assign: "M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12m-8-4 4-4 4 4",
  info: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  appt: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14",
  block: "M5.6 5.6l12.8 12.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

export function deskChatMenu(ctx: DeskCtx, c: DeskCtx["data"]["customers"][number] | undefined,
  o: { assign: boolean; assignSub: string; move: boolean; moveSub: string }): DeskMenuItem[] {
  const { patch, act, data } = ctx;
  if (!c) return [];
  const it = (label: string, d: string, bg: string, fg: string, run: () => void, sub = "", extra: Partial<DeskMenuItem> = {}): DeskMenuItem =>
    ({ label, sub: sub || null, d, bg, fg, run, sep: false, danger: false, c: fg, ...extra });
  return [
    ...(o.assign ? [it("Assign to", ICON.assign, "var(--crm-tint-lost)", "var(--crm-ink-soft)", () => patch({ menu: false, kind: "assign" }), o.assignSub)] : []),
    it("Share", ICON.share, "var(--crm-tint-attention)", "var(--crm-rust)", () => patch({ menu: false, kind: "share" }), "Invite a teammate"),
    ...(o.move ? [it("Move", ICON.assign, "var(--crm-tint-cold)", "var(--crm-ink-soft)", () => patch({ menu: false, kind: "move" }), o.moveSub)] : []),
    it("Customer info", ICON.info, "var(--crm-tint-follow)", "var(--crm-brown)", () => patch({ menu: false, kind: "info", infoId: c.id, visit: null, infoFromChat: true, infoAudit: false })),
    it("Appointment", ICON.appt, "var(--crm-cream)", "var(--crm-ink-soft)", () => patch({ menu: false, kind: "book", book: null })),
    it("Label", LABEL_ICON, "var(--crm-tint-appt)", "var(--crm-text-appt)", () => patch({ menu: false, labPop: { view: "labels", form: null } }), labelSub(data, c.id)),
    // Block: off one's Inbox and Contacts — the customer stays in the CRM, WhatsApp / Messenger are not told (the Inbox's More).
    it(`Block ${c.name}`, ICON.block, "var(--crm-tint-attention)", "var(--crm-oxblood)", () => {
      const name = c.name;
      patch({ menu: false });
      void act.setPref(c.id, { blocked: true, hidden: true }).then(() => patch({ chat: null, toast: `${name} blocked · removed from your Inbox` }));
    }, "", { sep: true, danger: true }),
  ];
}
