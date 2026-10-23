/**
 * Calendar's lists and Customer info (rev 1011 §5): the hero's Leads · Upcoming · Showed up open a list sheet like RS
 * Insight's (fixed height, ‹ back to the Calendar, End of list); a row, or a visit anywhere on the Calendar, opens
 * Customer info with ‹ back (to where it was opened); Open chat opens the chat here, as the Principal / Director (§1.1).
 * As the prototype's Calendar (`cl`, `ci`).
 */
import type { CrmCustomer } from "@/lib/member/crm-data";
import { infoRows, phoneLabel } from "../../sales/vm/customer";
import { lastReal, timeLabel } from "../../sales/vm/common";
import { ini, stop, type PanelCtx } from "./common";
import type { calendarVM } from "./calendar";

const p2 = (n: number) => String(n).padStart(2, "0");
const dOnly = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;

export function calendarListVM(ctx: PanelCtx, cal: Pick<ReturnType<typeof calendarVM>, "cLeadIds" | "cUpV" | "cCameV" | "cRangeBtn"> | undefined) {
  const { ui, patch, data, nameOf } = ctx;
  const k = ui.cLs || "", isV = k === "up" || k === "came";
  const byId = (id: string) => data.customers.find(c => c.id === id);
  const items: { c: CrmCustomer; at: string }[] = !cal ? [] : isV
    ? (k === "up" ? cal.cUpV : cal.cCameV).flatMap(v => { const c = byId(v.cid); return c ? [{ c, at: v.start }] : []; })
      .sort((x, y) => k === "up" ? x.at.localeCompare(y.at) : y.at.localeCompare(x.at))
    : cal.cLeadIds.flatMap(id => { const c = byId(id); return c ? [{ c, at: lastReal(c)?.at ?? c.createdAt }] : []; })
      .sort((x, y) => y.at.localeCompare(x.at));
  const unit = (n: number) => isV ? n + (n === 1 ? " visit" : " visits") : n + (n === 1 ? " lead" : " leads");
  return {
    open: !!k && !!cal, close: () => patch({ cLs: false }), stop,
    title: (k === "up" ? "Upcoming" : k === "came" ? "Showed up" : "Leads") + " · " + (cal?.cRangeBtn ?? ""),
    count: unit(items.length), empty: !items.length, hasRows: !!items.length,
    emptyText: k === "up" ? "No upcoming visits in this period." : k === "came" ? "Nobody showed up in this period yet." : "No leads in this period.",
    rows: items.map(({ c, at }, n) => ({
      name: c.name, ini: ini(c.name), phone: phoneLabel(c.phone) || "—", owner: c.assignedTo ? nameOf(c.assignedTo) : "Not sent yet",
      date: dOnly(new Date(at)), time: timeLabel(new Date(at)), rule: n ? "1px solid var(--crm-rule)" : "0", open: () => patch({ calInfo: c.id }),
    })),
  };
}

export function calendarInfoVM(ctx: PanelCtx) {
  const { ui, patch, data } = ctx;
  const c = ui.calInfo ? data.customers.find(x => x.id === ui.calInfo) : undefined;
  return {
    Open: !!c, hasBack: true, stop,
    // ‹ back closes the sheet and returns to where it was opened (the list, or the Calendar); the backdrop does the same.
    Back: () => patch({ calInfo: null }), Close: () => patch({ calInfo: null }),
    Name: c?.name ?? "", Ini: c ? ini(c.name) : "", Rows: c ? infoRows(c, data) : [],
    Chat: () => { if (c) patch({ calInfo: null, cLs: false, lead: c.id, pick: "", toast: "" }); },
    // Edit: the customer form, over that customer's chat (as the prototype).
    Edit: () => { if (c) patch({ calInfo: null, lead: c.id, pForm: { customerId: c.id, edit: true } }); },
  };
}
