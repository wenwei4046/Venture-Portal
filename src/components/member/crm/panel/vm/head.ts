/**
 * The back link above a sub-page (design 1a): a customer's chat goes back to
 * where it was opened; Ads Performance back to Profile. Since round 2 (rev 1011
 * §8) no page shows "‹ Back to Revenue app": the house left of the bell is the way back (2026-10-14; Profile's card
 * is gone).
 */
import type { PanelCtx } from "./common";

export const inLead = (ctx: PanelCtx) => !!ctx.ui.lead && ["overview", "calendar", "assign", "inbox"].includes(ctx.ui.tab);

export function headVM(ctx: PanelCtx) {
  const { ui, patch } = ctx, lead = inLead(ctx);
  return {
    // A customer's chat has its own back arrow (the design's full mode); sub-pages show the link.
    showHead: !lead && ui.tab === "ads",
    backLabel: lead ? "Back" : ui.tab === "ads" ? "Profile" : "Back to Revenue app",
    back: lead ? () => patch({ lead: null, toast: "", pMenu: false, reSheet: false, pick: "", pEmoji: null, pPick: null }) : ui.tab === "ads" ? () => patch({ tab: "profile" }) : ctx.exitApp,
  };
}
export type HeadVM = ReturnType<typeof headVM>;
