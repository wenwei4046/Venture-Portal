"use client";

/**
 * The salesperson CRM, assembled as design 3b nests it: banners; then either
 * the header + the open tab + the bottom bar, or a chat. The generated screens
 * (Sales*.tsx) draw; the view models (vm/*.ts) decide.
 */
import SalesShellBanners from "./SalesShellBanners";
import SalesHeader from "./SalesHeader";
import SalesInbox from "./SalesInbox";
import SalesContacts from "./SalesContacts";
import SalesCalendar from "./SalesCalendar";
import SalesInsight from "./SalesInsight";
import SalesProfile from "./SalesProfile";
import SalesChat from "./SalesChat";
import SalesNav from "./SalesNav";
import { headerVM, navVM, shellVM } from "./vm/header";
import { inboxVM } from "./vm/inbox";
import { contactsVM } from "./vm/contacts";
import { calendarVM } from "./vm/calendar";
import { insightVM } from "./vm/insight";
import { profileVM } from "./vm/profile";
import { chatVM } from "./vm/chat";
import type { SalesCtx } from "./vm/common";

export default function SalesScreens({ ctx, onExit }: { ctx: SalesCtx; onExit: () => void }) {
  const { ui } = ctx;
  const chat = chatVM(ctx);
  return (<>
    <SalesShellBanners v={shellVM(ctx)} />
    {!chat && (<>
      <SalesHeader v={headerVM(ctx, onExit)} />
      {ui.tab === "inbox" && <SalesInbox v={inboxVM(ctx)} />}
      {ui.tab === "contacts" && <SalesContacts v={contactsVM(ctx)} />}
      {ui.tab === "calendar" && <SalesCalendar v={calendarVM(ctx)} />}
      {ui.tab === "insight" && <SalesInsight v={insightVM(ctx)} />}
      {ui.tab === "profile" && <SalesProfile v={profileVM(ctx)} />}
    </>)}
    {chat && (<>
      <SalesChat v={chat} />
      {/* The + sheet's Photos and Document open these. */}
      <input id="crm-pick-photo" type="file" accept="image/jpeg,image/png" onChange={chat.pickMedia} style={{ display: "none" }} />
      <input id="crm-pick-file" type="file" onChange={chat.pickMedia} style={{ display: "none" }} />
    </>)}
    {!chat && <SalesNav v={navVM(ctx)} />}
    {/* What happened, wherever the person is (the Inbox and a chat show it in their own place). */}
    {!!ui.toast && ui.tab !== "inbox" && !chat && (
      <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", zIndex: 30, padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: "14px", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{ui.toast}</div>
    )}
    {!!ui.toast && chat && !ui.hm?.toast && (
      <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "90px", zIndex: 30, padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: "14px", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{ui.toast}</div>
    )}
  </>);
}
