/**
 * A cold chat's templates (the reply window shut): the shared action sheet lists the ones switched on, each with the words
 * it sends, and a tap sends it. Read afresh at every opening — this is where templates are switched on and off (Profile ›
 * Cold lead templates), so a list kept from earlier would go stale — and the sheet waiting on the read is replaced only
 * while it is still on screen (closed, it stays closed: a template is never offered over another chat). The Team chat's
 * since 2026-10-15 (panel/vm/lead.ts); the desktop chat's warning row and + menu use it too (CRM v4, notes/09 and 11).
 */
import type { CrmCustomer } from "@/lib/member/crm-data";
import type { SalesActions } from "../sales/actions";
import { actionsOnScreen, closeActions, openActions, type ActionSheet } from "./action-sheet";
import { oneAtATime } from "./once";

const NONE = () => {};
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export async function openColdTemplates(c: CrmCustomer, act: Pick<SalesActions, "loadTemplates" | "sendTemplate">) {
  const name = firstName(c.name), id = c.id;
  if (c.channel === "messenger") { openActions({ title: "Messenger has no templates", sub: "After 7 days Messenger allows no message from the Page. Call the customer instead.", actions: [{ label: "Close", run: NONE }] }); return; }
  const reading: ActionSheet = { title: "Send template message", sub: "Reading the templates you may send.", actions: [{ label: "Close", run: NONE }] };
  openActions(reading);
  const tpls = await act.loadTemplates();
  if (actionsOnScreen() !== reading) return;
  // The read failed: its toast says why.
  if (!tpls) { closeActions(); return; }
  if (!tpls.length) { openActions({ title: "No templates switched on", sub: "Switch approved templates on in Profile › Cold lead templates.", actions: [{ label: "Close", run: NONE }] }); return; }
  openActions({ title: "Send template message", sub: `Only template messages reach ${name} until they write again.`, actions: [
    ...tpls.map(t => {
      const params = Array.from({ length: t.params }, (_, i) => (i === 0 ? name : ""));
      return { label: t.label ?? t.name.replace(/_/g, " ").replace(/^\w/, x => x.toUpperCase()), detail: t.text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] || "…"),
        run: () => { void oneAtATime(`send:${id}:${t.name}`, () => act.sendTemplate(id, t, params)); } };
    }),
    { label: "Close", run: NONE },
  ] });
}
