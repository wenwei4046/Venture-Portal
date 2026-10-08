/** Profile (design 1a): who you are, View as, Ads Performance, Showrooms and Notifications. */
import { notifsVM } from "./notifs";
import { ini, type PanelCtx } from "./common";

export function profileVM(ctx: PanelCtx) {
  const { ui, patch, me } = ctx;
  return {
    onProfile: ui.tab === "profile", isFull: true,
    meIni: ini(me.name), meName: me.name, meTitle: me.role === "boss" ? "Principal" : "Revenue Director", meAccess: "All teams",
    notifUnread: notifsVM(ctx).notifUnread, openNotifs: () => patch({ nfOpen: true }),
    openViewAs: () => patch({ viewAs: true }), openAdsPerf: () => patch({ tab: "ads", lead: null }), openRooms: () => patch({ roomsOpen: true }),
  };
}
export type ProfileVM = ReturnType<typeof profileVM>;
