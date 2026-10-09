/**
 * Ads Performance (Profile › Ads Performance, design 1a): each ad's leads,
 * appointment rate and show-up over the period — from the customers and
 * visits themselves — with the Comparison against another period.
 */
import { comparisonVM, dateSheetVM, numbersOf, pct, periodRange, type PanelCtx } from "./common";

export function adsVM(ctx: PanelCtx) {
  const { ui, data, now } = ctx;
  const cur = periodRange(ui.period, ui.ovRange, now), c = ui.cmp;
  const ads = [...new Set(data.customers.map(x => x.ad))];
  const per = (ad: string, r: { a: number; b: number }) => numbersOf(data.customers.filter(x => x.ad === ad), data.visits, r, now);
  const total = ads.reduce((n, ad) => n + per(ad, cur).leads, 0);
  const dl = (a: number, b: number, rate: boolean) => { const d = rate ? Math.round((a - b) * 100) : b ? Math.round(((a - b) / b) * 100) : 0; const col = d === 0 ? "#806B60" : d > 0 ? "#2E6B4C" : "#A3371A"; return { d: `${d >= 0 ? "+" : "−"}${Math.abs(d)}%`, dc: col, dBg: col === "#2E6B4C" ? "#E4F1E8" : col === "#A3371A" ? "#FBE4DE" : "#F5EBE3" }; };
  const adPerf = ads.map(ad => {
    const A = per(ad, cur), B = c ? per(ad, c) : null, page = [...data.customers].filter(x => x.ad === ad).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.channel === "messenger" ? "Messenger" : "WhatsApp";
    const rA = A.leads ? A.booked / A.leads : 0, sA = A.due ? A.came / A.due : 0, rB = B && B.leads ? B.booked / B.leads : 0, sB = B && B.due ? B.came / B.due : 0;
    const mets = ([["Leads", String(A.leads), B ? String(B.leads) : "", B ? dl(A.leads, B.leads, false) : null], ["Appt", pct(A.booked, A.leads), B ? pct(B.booked, B.leads) : "", B ? dl(rA, rB, true) : null], ["Show-up", pct(A.came, A.due), B ? pct(B.came, B.due) : "", B ? dl(sA, sB, true) : null]] as const)
      .map(([label, v, b, d], k) => ({ label, v, b, d: d?.d ?? "", dc: d?.dc ?? "", dBg: d?.dBg ?? "", pl: k ? "10px" : "0", bl: k ? "1px solid #EBDDD2" : "0" }));
    return { name: ad, page, leads: A.leads, bLeads: B?.leads ?? 0, booked: A.booked, bBooked: B?.booked ?? 0, came: A.came, due: A.due, bCame: B?.came ?? 0, bDue: B?.due ?? 0, mets, hasCmp: !!B, share: `${total ? (A.leads / total) * 100 : 0}%` };
  }).filter(a => a.leads > 0 || a.bLeads > 0).sort((x, y) => y.leads - x.leads);
  const sum = (k: "leads" | "bLeads" | "booked" | "bBooked" | "came" | "due" | "bCame" | "bDue") => adPerf.reduce((n, a) => n + a[k], 0);
  const dlr = (a: number, b: number, rate: boolean) => { const x = dl(a, b, rate); return { delta: x.d, dFg: x.dc, dBg: x.dBg }; };
  const cmp = comparisonVM(ctx, () => []);
  const L = sum("leads"), LB = sum("bLeads");
  return {
    ...dateSheetVM(ctx), ...cmp,
    onAds: ui.tab === "ads",
    adPerf,
    adCmpRows: c ? [
      { label: "Leads", vA: String(L), vB: String(LB), ...dlr(L, LB, false) },
      { label: "Appointments", vA: String(sum("booked")), vB: String(sum("bBooked")), ...dlr(sum("booked"), sum("bBooked"), false) },
      { label: "Appt rate", vA: pct(sum("booked"), L), vB: pct(sum("bBooked"), LB), ...dlr(L ? sum("booked") / L : 0, LB ? sum("bBooked") / LB : 0, true) },
      { label: "Show-up", vA: pct(sum("came"), sum("due")), vB: pct(sum("bCame"), sum("bDue")), ...dlr(sum("due") ? sum("came") / sum("due") : 0, sum("bDue") ? sum("bCame") / sum("bDue") : 0, true) },
    ] : [],
  };
}
export type AdsVM = ReturnType<typeof adsVM>;
