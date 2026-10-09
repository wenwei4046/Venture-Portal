/** The bell at the top right of the Control panel: Notifications and their unread count. */
import { notifsVM } from "./notifs";
import type { PanelCtx } from "./common";

export function bellVM(ctx: PanelCtx) {
  const n = notifsVM(ctx);
  return { showBell: !ctx.ui.lead && !ctx.ui.nfOpen, notifUnread: n.notifUnread, openNotifs: n.openNotifs };
}
export type BellVM = ReturnType<typeof bellVM>;
