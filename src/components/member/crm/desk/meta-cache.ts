/**
 * Ads Manager's figures kept on this computer (2026-11-23, the owner: Insight waiting on "Reading spend from Ads Manager…" —
 * "计算方式要加快"). A range's figures are shown at once from what the last read answered, then read again behind them —
 * unless they are fresh: a range that ended before today changes little (6 hours), one still running 10 minutes. Only the
 * figures the screen already shows are kept (spend, impressions …; never the token); a broken store reads as empty.
 */
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";

const STORE = "crm-meta-figs-v1";
const PAST_MS = 6 * 3_600_000, LIVE_MS = 10 * 60_000, KEEP_MS = 7 * 86_400_000;
type Entry = { f: MetaFig | null; at: number };

function readAll(): Record<string, Entry> {
  try { const v = JSON.parse(localStorage.getItem(STORE) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

/** What the last read answered for each ad of a range, and whether it is fresh enough not to ask again. */
export function cachedFigs(key: string, until: string, ids: string[], now = Date.now(), today = isoDay(now)): { figs: Record<string, MetaFig | null>; stale: string[] } {
  const all = readAll(), figs: Record<string, MetaFig | null> = {}, stale: string[] = [];
  const maxAge = until < today ? PAST_MS : LIVE_MS;
  for (const id of ids) {
    const e = all[`${key}|${id}`];
    if (e) figs[id] = e.f;
    if (!e || now - e.at > maxAge) stale.push(id);
  }
  return { figs, stale };
}

/** Keeps a range's answer (a week at most). */
export function keepFigs(key: string, figs: Record<string, MetaFig | null>, now = Date.now()) {
  try {
    const all = readAll();
    for (const [id, f] of Object.entries(figs)) all[`${key}|${id}`] = { f, at: now };
    for (const [k, e] of Object.entries(all)) if (now - e.at > KEEP_MS) delete all[k];
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch { /* storage full or blocked: the next read asks again */ }
}

const isoDay = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
