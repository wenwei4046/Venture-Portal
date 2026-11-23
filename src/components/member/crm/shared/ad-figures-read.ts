/**
 * Ads Manager's figures for any screen, through GET /member/crm-ad-figures (2026-11-23, the owner: "手机很慢，尤其 total
 * cost & per lead"). The phone's Overview and Ads performance asked fetchAdInsights — a Server Action — once per range and
 * once per month of the marketing fee, and the client runs Server Actions one at a time, behind the CRM's 5 s re-read; the
 * desktop had moved to this GET the same morning. A GET goes at once, side by side, and the server keeps Meta's answers.
 * The route takes 8 ranges and 40 ads a range a request, so a bigger ask is cut into parts and put back together here.
 * Answers per range key: { adId: figures | null }; a range whose read failed is left out (the caller keeps what it shows).
 */
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";

export type AdFigNeed = { key: string; since: string; until: string; ids: string[] };
type Figs = Record<string, Record<string, MetaFig | null>>;
const AD = /^\d{5,32}$/, RANGES = 8, ADS = 40;

/** The parts a request carries: each range cut into pieces of 40 ads (`key#n`), 8 pieces a request. */
export function adFigureParts(needs: AdFigNeed[]): { key: string; part: AdFigNeed[] }[][] {
  const pieces: { key: string; part: AdFigNeed }[] = [];
  for (const n of needs) {
    const ids = [...new Set(n.ids)].filter(id => AD.test(id));
    for (let i = 0; i < ids.length; i += ADS) pieces.push({ key: n.key, part: { key: `${n.key}#${i / ADS}`, since: n.since, until: n.until, ids: ids.slice(i, i + ADS) } });
  }
  const out: { key: string; part: AdFigNeed[] }[][] = [];
  for (let i = 0; i < pieces.length; i += RANGES) out.push(pieces.slice(i, i + RANGES).map(p => ({ key: p.key, part: [p.part] })));
  return out;
}

/** Reads every range; `onPart` hears each request's answer as it lands, so the first figures show before the last. */
export async function readAdFigures(needs: AdFigNeed[], onPart?: (figs: Figs) => void, fetchImpl: typeof fetch = fetch): Promise<Figs> {
  const all: Figs = {};
  await Promise.all(adFigureParts(needs).map(async group => {
    const parts = group.map(g => g.part[0]);
    try {
      const res = await fetchImpl(`/member/crm-ad-figures?n=${encodeURIComponent(JSON.stringify(parts))}`, { cache: "no-store" });
      if (!res.ok) return;
      const got = ((await res.json()) as { figs?: Figs }).figs ?? {};
      const figs: Figs = {};
      group.forEach(({ key, part: [p] }) => { if (got[p.key]) figs[key] = { ...(figs[key] ?? {}), ...got[p.key] }; });
      for (const [k, f] of Object.entries(figs)) all[k] = { ...(all[k] ?? {}), ...f };
      if (Object.keys(figs).length) onPart?.(figs);
    } catch { /* offline or refused: the caller keeps what it shows */ }
  }));
  return all;
}
