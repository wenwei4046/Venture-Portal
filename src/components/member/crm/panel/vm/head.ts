/**
 * The back link above a sub-page (design 1a): a customer's chat goes back to
 * where it was opened; Ads Performance back to Profile; Assignment, Calendar
 * and Profile back to the Revenue app. Insight and Inbox have none.
 */
import type { PanelCtx } from "./common";

export const inLead = (ctx: PanelCtx) => !!ctx.ui.lead && ["overview", "calendar", "assign", "inbox"].includes(ctx.ui.tab);

export function headVM(ctx: PanelCtx) {
  const { ui, patch } = ctx, lead = inLead(ctx);
  return {
    showHead: lead || !(ui.tab === "overview" || ui.tab === "inbox"),
    backLabel: lead ? "Back" : ui.tab === "ads" ? "Profile" : "Back to Revenue app",
    back: lead ? () => patch({ lead: null, toast: "", pMenu: false, reSheet: false, pick: "" }) : ui.tab === "ads" ? () => patch({ tab: "profile" }) : ctx.exitApp,
  };
}
export type HeadVM = ReturnType<typeof headVM>;
