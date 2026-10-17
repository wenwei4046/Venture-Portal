"use client";

/**
 * The Control panel (rev 1011): one generated screen, PanelApp.tsx — the prototype's markup verbatim — on one view
 * model, vm/app.ts, which groups the vm/*.ts of every screen. What the markup cannot hold lives here: the Undo bar's
 * countdown, the toast's 3 seconds, the chat following its newest message, and the file pickers the chat's composer opens
 * (its Attach panel's Photos and Document, its Camera — Mine's composer since 2026-10-15).
 */
import { useCallback, useEffect } from "react";
import PanelApp from "./PanelApp";
import { panelAppVM } from "./vm/app";
import type { PanelCtx } from "./vm/common";
import { useFollowNewest } from "../shared/stick";
import { useReadWhenSeen } from "../shared/seen";
import { useCloseOnOutside } from "../sales/outside";
import { DOC_ACCEPT, PICKER_AT } from "../shared/attach-sheet";
import { useBackCloses } from "../shared/back";
import { InAppCamera } from "../shared/in-app-camera";

export default function PanelScreens({ ctx }: { ctx: PanelCtx }) {
  const { ui, set } = ctx;
  // The phone's Back closes the chat, back to where it was opened from (2026-10-15).
  useBackCloses(!!ui.lead, () => set(u => ({ ...u, lead: null, toast: "", pMenu: false, reSheet: false, pick: "", pCmp: null, pPick: null })), "crmLead");
  // The Undo bar counts 30 seconds down, then the change stands.
  const undoOn = !!ui.undo;
  useEffect(() => {
    if (!undoOn) return;
    const t = setInterval(() => set(u => (!u.undo ? u : u.undo.left <= 1 ? { ...u, undo: null } : { ...u, undo: { ...u.undo, left: u.undo.left - 1 } })), 1000);
    return () => clearInterval(t);
  }, [undoOn, set]);
  // Every toast goes by itself 3 s after it appears; a new one starts the 3 s again (rev 1011 §7).
  const toast = ui.toast;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => set(u => (u.toast === toast ? { ...u, toast: "" } : u)), 3000);
    return () => clearTimeout(t);
  }, [toast, set]);
  const open = ctx.data.customers.find(c => c.id === ui.lead);
  useFollowNewest(ui.lead, open?.messages.length ?? 0);
  // One's own chat opened on the Team side is read too, once its newest message is on screen; anybody else's never
  // (shared/seen.ts, the owner 2026-10-17: "如果我在 Team 那边点进我自己的 chat，它要能变成已读").
  useReadWhenSeen(ui.lead, open?.unread ?? 0, ctx.act.readChat);
  // The chat's ⋮ menu closes on a tap outside it, as Mine's (2026-10-14).
  useCloseOnOutside(!!ui.lead && !!ui.pMenu, useCallback(() => set(u => ({ ...u, pMenu: false })), [set]));
  const v = panelAppVM(ctx);
  return (<>
    <PanelApp v={v} />
    {/* The composer's Photos (photos and videos, several at once), Camera and Document open these. */}
    {!!ui.lead && (<>
      <input id="crm-panel-photo" type="file" accept="image/*,video/*" multiple onChange={v.ld.lx.pickVisual} style={PICKER_AT} tabIndex={-1} aria-hidden="true" />
      <input id="crm-panel-camera" type="file" accept="image/*,video/*" capture="environment" onChange={v.ld.lx.pickVisual} style={{ display: "none" }} />
      <input id="crm-panel-file" type="file" accept={DOC_ACCEPT} multiple onChange={v.ld.lx.pickMedia} style={PICKER_AT} tabIndex={-1} aria-hidden="true" />
      {/* The camera inside the app, as WhatsApp's (2026-10-17): what it takes goes into the camera input above. */}
      <InAppCamera inputId="crm-panel-camera" galleryId="crm-panel-photo" warn={ctx.act.toast} />
    </>)}
  </>);
}
