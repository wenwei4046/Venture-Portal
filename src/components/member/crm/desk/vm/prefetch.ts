/**
 * The ranges Insight may ask Meta for next (2026-11-26, the owner: "insight 的算法速度还是有点慢，尤其我从进页面，换时间等"): Today,
 * This week and This month, the period before each and the calendar months the marketing fee is read on — so a click on
 * another period finds its spend already read instead of waiting for Meta. Keys are the screens' own ("from|to",
 * `isoOf`), so what is read fills `ui.apMeta` exactly where Overview and Ads Performance look.
 */
import type { AdFigNeed } from "@/lib/member/crm-ad-figures";
import { periodRange } from "../../panel/vm/common";
import { feeMonths, isoOf } from "./adsperf";
import { prevRange } from "./insight";

const META_ID = /^[0-9]{5,32}$/;

/** Every ad Meta can be asked about: the customers' and the ones added before their first lead. */
export function metaAdIds(customers: { adId?: string | null }[], adNames: Record<string, unknown> | undefined): string[] {
  const ids = new Set<string>();
  for (const c of customers) if (c.adId && META_ID.test(c.adId)) ids.add(c.adId);
  for (const id of Object.keys(adNames ?? {})) if (META_ID.test(id)) ids.add(id);
  return [...ids].sort();
}

/** The ranges to read ahead, each with the ads not yet read for it; at most 8 ranges and 40 ads a request (the route's limits). */
export function prefetchNeeds(now: Date, ids: string[], have: Record<string, Record<string, unknown> | undefined> = {}): AdFigNeed[][] {
  if (!ids.length) return [];
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ranges: [number, number][] = [];
  for (const per of ["day", "week", "month"] as const) {
    const r = periodRange(per, null, now), p = prevRange(r);
    ranges.push([r.a, r.b], [p.a, p.b], ...feeMonths(r.a, r.b, T), ...feeMonths(p.a, p.b, T));
  }
  const seen = new Set<string>(), needs: AdFigNeed[] = [];
  for (const [a, b] of ranges) {
    const key = `${isoOf(a)}|${isoOf(b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const want = ids.filter(id => !(id in (have[key] ?? {})));
    for (let i = 0; i < want.length; i += 40) needs.push({ key, since: isoOf(a), until: isoOf(b), ids: want.slice(i, i + 40) });
  }
  const out: AdFigNeed[][] = [];
  for (let i = 0; i < needs.length; i += 8) out.push(needs.slice(i, i + 8));
  return out;
}
