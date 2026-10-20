import type { SalesUi } from "../sales/ui";
import type { PanelUi } from "../panel/ui";
import type { NavFrame } from "./nav-history";

/**
 * What one screen of the phone CRM is, for the phone's Back (shared/nav-history.ts, 2026-10-20): which side (Mine,
 * Team, somebody's CRM), its tab, and each layer open over it — a chat, a sub-page, a sheet. A dropdown (the chat's ⋮,
 * a message's menu) is no screen: Back still closes the screen under it, and a screen put back opens with it shut.
 */
const SALES_NAV = ["tab", "chat", "profSub", "cInfo", "insList", "insInfo", "moreLead", "moreView", "adSheet", "cform", "book",
  "cancelAsk", "qr", "qrPage", "tpl", "hm", "insSheet", "teamOpen", "swOpen", "outcomeAsk", "rebookFor", "labelForm", "rename"] as const;
const PANEL_NAV = ["tab", "lead", "pInfo", "pForm", "pBook", "calInfo", "cLs", "asSec", "hlOpen", "ftsOpen", "tplOpen", "tplEd",
  "adEd", "ftEd", "att", "ovSheet", "sendFor", "mvFor", "viewAs", "pcOpen", "nfOpen", "roomsOpen", "rmEdit", "cpSheet", "crSheet", "reSheet"] as const;

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
const hmSheet = (hm: SalesUi["hm"]) => (hm ? (["share", "move", "assign", "info", "appt"] as const).find(k => hm[k]) ?? null : null);

export function navFrameOf(ui: SalesUi, panelUi: PanelUi, hodMode: NavSnap["hodMode"], viewing: string | null, teamAs: string | null): NavFrame<NavSnap> {
  const sales = Object.fromEntries(SALES_NAV.map(k => [k, ui[k]])) as Partial<SalesUi>;
  if (sales.hm) sales.hm = hmSheet(sales.hm) ? { ...sales.hm, menu: false } : null;
  const panel = Object.fromEntries(PANEL_NAV.map(k => [k, panelUi[k]])) as Partial<PanelUi>;
  const shape: NavFrame<NavSnap>["shape"] = { side: `${hodMode ?? ""}|${viewing ?? ""}|${teamAs ?? ""}`, tab: ui.tab, ptab: panelUi.tab };
  for (const k of SALES_NAV) if (k !== "tab") shape[`s.${k}`] = k === "hm" ? hmSheet(ui.hm) : k === "insList" ? ui.insList?.kind ?? null : open(ui[k]);
  for (const k of PANEL_NAV) if (k !== "tab") shape[`p.${k}`] = open(panelUi[k]);
  return { shape, snap: { hodMode, viewing, teamAs, sales, panel } };
}
