"use client";

/**
 * The Control panel (rev 1011): one generated screen, PanelApp.tsx — the prototype's markup verbatim — on one view
 * model, vm/app.ts, which groups the vm/*.ts of every screen. What the markup cannot hold lives here: the Undo bar's
 * countdown, the toast's 3 seconds, the chat following its newest message, and the file pickers the chat's + and camera
 * open.
 */
import { useEffect } from "react";
import PanelApp from "./PanelApp";
import { panelAppVM } from "./vm/app";
import type { PanelCtx } from "./vm/common";
import { useFollowNewest } from "../shared/stick";

export default function PanelScreens({ ctx }: { ctx: PanelCtx }) {
  const { ui, set } = ctx;
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
  useFollowNewest(ui.lead, ctx.data.customers.find(c => c.id === ui.lead)?.messages.length ?? 0);
  const v = panelAppVM(ctx);
  return (<>
    <PanelApp v={v} />
    {/* The chat's + (a document) and camera (a photo) open these. */}
    {!!ui.lead && (<>
      <input id="crm-panel-photo" type="file" accept="image/jpeg,image/png" onChange={v.ld.lx.pickMedia} style={{ display: "none" }} />
      <input id="crm-panel-file" type="file" onChange={v.ld.lx.pickMedia} style={{ display: "none" }} />
    </>)}
  </>);
}
