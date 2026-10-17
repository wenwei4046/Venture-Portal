"use client";

/**
 * The salesperson CRM, assembled as design 3b nests it: banners; then either
 * the header + the open tab + the bottom bar, or a chat. The generated screens
 * (Sales*.tsx) draw; the view models (vm/*.ts) decide.
 */
import { useCallback } from "react";
import SalesShellBanners from "./SalesShellBanners";
import SalesHeader from "./SalesHeader";
import SalesInbox from "./SalesInbox";
import SalesContacts from "./SalesContacts";
import SalesCalendar from "./SalesCalendar";
import SalesInsight from "./SalesInsight";
import SalesProfile from "./SalesProfile";
import SalesChat from "./SalesChat";
import SalesNav from "./SalesNav";
import { headerVM, navVM, shellVM, teamMineVM, titleBellVM } from "./vm/header";
import { inboxVM } from "./vm/inbox";
import { contactsVM } from "./vm/contacts";
import { calendarVM } from "./vm/calendar";
import { insightVM } from "./vm/insight";
import { profileVM } from "./vm/profile";
import { chatVM } from "./vm/chat";
import type { SalesCtx } from "./vm/common";
import { useFollowNewest } from "../shared/stick";
import { useReadWhenSeen } from "../shared/seen";
import { useCloseOnOutside } from "./outside";
import { DOC_ACCEPT, PICKER_AT } from "../shared/attach-sheet";
import { typePx } from "../shared/type";
import { useBackCloses } from "../shared/back";

export default function SalesScreens({ ctx, onExit }: { ctx: SalesCtx; onExit: () => void }) {
  const { ui } = ctx;
  const chat = chatVM(ctx);
  const open = ctx.data.customers.find(c => c.id === ui.chat);
  useFollowNewest(ui.chat, open?.messages.length ?? 0);
  // Read once its newest message is on screen — one's own chat only (shared/seen.ts, 2026-10-17).
  useReadWhenSeen(ui.chat, open?.unread ?? 0, ctx.act.readChat);
  const { set } = ctx;
  useCloseOnOutside(!!ui.hm?.menu, useCallback(() => set(u => ({ ...u, hm: null })), [set]));
  // The phone's Back closes the chat, back to the Inbox (2026-10-15).
  useBackCloses(!!ui.chat, () => set(u => ({ ...u, chat: null, menu: null, book: null, tpl: false, qr: false, hm: null, reply: null, cmp: null, pick: null })), "crmChat");
  // The Inbox's title row — the first page's alone (2026-10-14): Team | Mine (whoever has a Team side), the house back to
  // the Revenue app, the bell.
  const x = { tb: titleBellVM(ctx), exitCrm: onExit, tm: teamMineVM(ctx) };
  return (<>
    <SalesShellBanners v={shellVM(ctx)} />
    {!chat && (<>
      <SalesHeader v={headerVM(ctx)} />
      {ui.tab === "inbox" && <SalesInbox v={{ ...inboxVM(ctx), ...x }} />}
      {ui.tab === "contacts" && <SalesContacts v={contactsVM(ctx)} />}
      {ui.tab === "calendar" && <SalesCalendar v={calendarVM(ctx)} />}
      {ui.tab === "insight" && <SalesInsight v={insightVM(ctx)} />}
      {ui.tab === "profile" && <SalesProfile v={profileVM(ctx)} />}
    </>)}
    {chat && (<>
      <SalesChat v={chat} />
      {/* The + sheet's Photos (several photos and videos at once) and Document, and the camera (a photo or a video), open these. */}
      <input id="crm-pick-photo" type="file" accept="image/*,video/*" multiple onChange={chat.pickVisual} style={PICKER_AT} tabIndex={-1} aria-hidden="true" />
      <input id="crm-pick-camera" type="file" accept="image/*,video/*" capture="environment" onChange={chat.pickVisual} style={{ display: "none" }} />
      <input id="crm-pick-file" type="file" accept={DOC_ACCEPT} multiple onChange={chat.pickMedia} style={PICKER_AT} tabIndex={-1} aria-hidden="true" />
    </>)}
    {!chat && <SalesNav v={navVM(ctx)} />}
    {/* What happened, wherever the person is (the Inbox and a chat show it in their own place). */}
    {!!ui.toast && ui.tab !== "inbox" && !chat && (
      <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", zIndex: 30, padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: typePx(14), fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{ui.toast}</div>
    )}
    {/* In a chat, where the composer's own toast stands (the composer handoff): 16px in, just above the bar. */}
    {!!ui.toast && chat && !ui.hm?.toast && (
      <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "calc(74px + var(--safe-bottom, 0px))", zIndex: 30, padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: typePx(14), fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{ui.toast}</div>
    )}
  </>);
}
