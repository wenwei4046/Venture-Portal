/** Profile (design 1a): who you are, View as, Ads Performance, Showrooms and Notifications. */
import { notifsVM } from "./notifs";
import { jobTitle, teamName, teamOf } from "../../shared/people";
import { ini, type PanelCtx } from "./common";

export function profileVM(ctx: PanelCtx) {
  const { ui, patch, me } = ctx;
  return {
    onProfile: ui.tab === "profile", isFull: true,
    meIni: ini(me.name), meName: me.name, meTitle: me.role === "boss" ? "Principal" : jobTitle(me),
    // A leader on the Team side reaches their own team, not all (2026-10-11: View as Kelvin read "All teams").
    meAccess: ctx.data.can.viewAll ? "All teams" : teamName(teamOf(me.id, ctx.data.people)) || "My team",
    notifUnread: notifsVM(ctx).notifUnread, openNotifs: () => patch({ nfOpen: true }),
    openViewAs: () => patch({ viewAs: true }), openAdsPerf: () => patch({ tab: "ads", lead: null }), openRooms: () => patch({ roomsOpen: true }),
  };
}
export type ProfileVM = ReturnType<typeof profileVM>;
