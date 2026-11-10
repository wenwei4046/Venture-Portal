import type { SalesUi } from "../sales/ui";
import type { PanelUi } from "../panel/ui";
import type { NavFrame } from "./nav-history";

/**
 * What one screen of the phone CRM is, for the phone's Back (shared/nav-history.ts, 2026-10-20): which side (Mine,
 * Team, somebody's CRM), its tab, and each layer open over it — a chat, a sub-page, a sheet. A dropdown (the chat's ⋮,
 * a message's menu) is no screen: Back still closes the screen under it, and a screen put back opens with it shut.
 */
// notes/10 §1 (2026-11-10): every layer that opens a sheet, a page or a dialog is here — the photo preview (pick / pPick),
// the time pickers, the celebration, Adjust split, Save and apply to all, the full-time editor, the showroom's delete and
// time picker, Insight's Ads / Up next / Activity switch (a switch is a page step), and v4's own (the inbox search, the
// Team inbox's People / Status sheet and search, the chat's Label sheet). A new `ui` / `panelUi` field that opens one goes
// in here in the same change: nav-frame.test.ts fails on a field named *Open / *Sheet / *Ed / *Edit / *Ask in neither list.
export const SALES_NAV = ["tab", "chat", "profSub", "cInfo", "insList", "insInfo", "moreLead", "moreView", "adSheet", "cform", "book",
  "cancelAsk", "qr", "qrPage", "tpl", "hm", "insSheet", "teamOpen", "swOpen", "outcomeAsk", "rebookFor", "labelForm", "rename",
  "pick", "tp", "celebrate", "qOpen"] as const;
export const PANEL_NAV = ["tab", "lead", "pInfo", "pForm", "pBook", "calInfo", "cLs", "asSec", "hlOpen", "ftsOpen", "tplOpen", "tplEd",
  "adEd", "ftEd", "att", "ovSheet", "sendFor", "mvFor", "viewAs", "pcOpen", "nfOpen", "roomsOpen", "rmEdit", "cpSheet", "crSheet", "reSheet",
  "pPick", "bpSheet", "applyPick", "ftx", "rmDel", "rmTP", "ovAds", "ovUp", "ovAct", "inbSheet", "inbSearch", "pLabel"] as const;
/** Fields named like a layer that are not one (nav-frame.test.ts reads this), each with why Back does not step over it. */
export const NOT_LAYERS: Record<string, string> = {
  cTeamsOpen: "the Team calendar's summary card folded or open — a fold on the page, not a layer over it",
  rmLeave: "the showroom's leave sheet (4a·3) is held by Back itself (CrmApp's beforeBack): opened by a Back, closed by one",
};

export interface NavSnap {
  hodMode: "panel" | "crm" | null;
  viewing: string | null;
  teamAs: string | null;
  sales: Partial<SalesUi>;
  panel: Partial<PanelUi>;
}

/** Left behind when Back closes a chat (as its ‹ does). */
export const CHAT_LEFT: Partial<SalesUi> = { menu: null, reply: null, cmp: null, pick: null };
export const LEAD_LEFT: Partial<PanelUi> = { toast: "", pMenu: false, pick: "", pCmp: null, pPick: null };

const open = (v: unknown): string | number | boolean | null =>
  v === null || v === undefined || v === false || v === "" ? null : typeof v === "string" || typeof v === "number" ? v : true;
/** The chat's sheets (Share, Move, Assign, Customer info, Appointment) are screens; its ⋮ dropdown is not. */
/** The Label sheet (notes/15) is one screen a view: its list, then its form (`label:labels` / `label:labelEdit`). */
const hmSheet = (hm: SalesUi["hm"]) => (hm ? (["share", "move", "assign", "info", "appt", "label"] as const).find(k => hm[k]) ?? null : null);

export function navFrameOf(ui: SalesUi, panelUi: PanelUi, hodMode: NavSnap["hodMode"], viewing: string | null, teamAs: string | null): NavFrame<NavSnap> {
  const sales = Object.fromEntries(SALES_NAV.map(k => [k, ui[k]])) as Partial<SalesUi>;
  if (sales.hm) sales.hm = hmSheet(sales.hm) ? { ...sales.hm, menu: false } : null;
  const panel = Object.fromEntries(PANEL_NAV.map(k => [k, panelUi[k]])) as Partial<PanelUi>;
  const shape: NavFrame<NavSnap>["shape"] = { side: `${hodMode ?? ""}|${viewing ?? ""}|${teamAs ?? ""}`, tab: ui.tab, ptab: panelUi.tab };
  for (const k of SALES_NAV) if (k !== "tab") shape[`s.${k}`] = k === "hm" ? (hmSheet(ui.hm) === "label" ? `label:${ui.hm?.label}` : hmSheet(ui.hm)) : k === "insList" ? ui.insList?.kind ?? null : open(ui[k]);
  // A showroom edited in place (4a, `quick`) is the Showrooms page itself, no step of its own: Back from it asks Save draft /
  // Discard changes / Keep editing (CrmApp's beforeBack, notes/10 §4). The full editor (Add closure) is a page over it.
  for (const k of PANEL_NAV) if (k !== "tab") shape[`p.${k}`] = k === "rmEdit" ? (panelUi.rmEdit && !panelUi.rmEdit.quick ? true : null)
    // The Label sheet's list and its form are two steps (Back from the form is the list), as the chat's hm.label below.
    : k === "pLabel" ? panelUi.pLabel?.view ?? null : open(panelUi[k]);
  return { shape, snap: { hodMode, viewing, teamAs, sales, panel } };
}
