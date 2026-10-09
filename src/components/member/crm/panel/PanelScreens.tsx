"use client";

/**
 * The Control panel, assembled as design 1a nests it: the bell, the back
 * link, the open screen (Insight · Inbox · a customer · Ads Performance ·
 * Assignment · Calendar · Profile · Showrooms), what opens over it, and the
 * bottom bar. The generated screens (Panel*.tsx) draw; vm/*.ts decide.
 */
import { useEffect } from "react";
import PanelBell from "./PanelBell";
import PanelHead from "./PanelHead";
import PanelOverview from "./PanelOverview";
import PanelInbox from "./PanelInbox";
import PanelLead from "./PanelLead";
import PanelAds from "./PanelAds";
import PanelAssign from "./PanelAssign";
import PanelCalendar from "./PanelCalendar";
import PanelProfile from "./PanelProfile";
import PanelRooms from "./PanelRooms";
import PanelOverlays from "./PanelOverlays";
import PanelNav from "./PanelNav";
import { bellVM } from "./vm/bell";
import { headVM } from "./vm/head";
import { overviewVM } from "./vm/overview";
import { inboxVM } from "./vm/inbox";
import { leadVM } from "./vm/lead";
import { adsVM } from "./vm/ads";
import { assignVM } from "./vm/assign";
import { calendarVM } from "./vm/calendar";
import { profileVM } from "./vm/profile";
import { roomsVM } from "./vm/rooms";
import { overlaysVM } from "./vm/overlays";
import { navVM } from "./vm/nav";
import type { PanelCtx } from "./vm/common";
import { useFollowNewest } from "../shared/stick";
import SalesCustomerForm from "../sales/SalesCustomerForm";
import { customerForm } from "../sales/vm/customer";
import { DAY, day0 } from "../sales/vm/common";

export default function PanelScreens({ ctx }: { ctx: PanelCtx }) {
  const { ui, set } = ctx;
  // The Undo bar counts 30 seconds down, then the change stands.
  const undoOn = !!ui.undo;
  useEffect(() => {
    if (!undoOn) return;
    const t = setInterval(() => set(u => (!u.undo ? u : u.undo.left <= 1 ? { ...u, undo: null } : { ...u, undo: { ...u.undo, left: u.undo.left - 1 } })), 1000);
    return () => clearInterval(t);
  }, [undoOn, set]);
  const tab = ui.tab;
  useFollowNewest(ui.lead, ctx.data.customers.find(c => c.id === ui.lead)?.messages.length ?? 0);
  // The salesperson's customer form: a first Book visit asks for the details, then goes on to the time.
  const form = customerForm({
    form: ui.pForm, data: ctx.data, saveDetails: ctx.act.saveDetails,
    setForm: f => set(u => ({ ...u, pForm: typeof f === "function" ? (u.pForm ? f(u.pForm) : null) : f })),
    onSaved: (c, edit) => set(u => ({ ...u, pForm: null, pBook: edit ? u.pBook : { customerId: c.id, room: 0, day: day0(ctx.now) + DAY, slot: null, view: "month" } })),
  });
  return (<>
    <PanelBell v={bellVM(ctx)} />
    <PanelHead v={headVM(ctx)} />
    {tab === "overview" && !ui.lead && <PanelOverview v={overviewVM(ctx)} />}
    {tab === "inbox" && !ui.lead && <PanelInbox v={inboxVM(ctx)} />}
    {!!ui.lead && (() => {
      const lead = leadVM(ctx);
      return (<>
        <PanelLead v={lead} />
        <SalesCustomerForm v={form} />
        {/* The chat's + (a document) and camera (a photo) open these. */}
        <input id="crm-panel-photo" type="file" accept="image/jpeg,image/png" onChange={lead.lx.pickMedia} style={{ display: "none" }} />
        <input id="crm-panel-file" type="file" onChange={lead.lx.pickMedia} style={{ display: "none" }} />
      </>);
    })()}
    {tab === "ads" && <PanelAds v={adsVM(ctx)} />}
    {tab === "assign" && !ui.lead && <PanelAssign v={assignVM(ctx)} />}
    {tab === "calendar" && !ui.lead && <PanelCalendar v={calendarVM(ctx)} />}
    {tab === "profile" && <PanelProfile v={profileVM(ctx)} />}
    <PanelRooms v={roomsVM(ctx)} />
    <PanelOverlays v={overlaysVM(ctx)} />
    <PanelNav v={navVM(ctx)} />
    {/* What happened (the design's dark toast), above the bar — or, in a chat, above the composer
        (a booking the customer was not told of must say so where it was made). */}
    {!!ui.toast && (
      <div style={{ position: "absolute", left: "20px", right: "20px", bottom: ui.lead ? "92px" : "78px", zIndex: 30, padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: "14px", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{ui.toast}</div>
    )}
  </>);
}
