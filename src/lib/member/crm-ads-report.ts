/**
 * Ads Performance's PDF (CRM Desktop rev 1, F1): the table on screen travels to the PDF route as one URL parameter —
 * base64url of { title, head, rows } — and is checked on the way in: words only, at most 200 rows × 20 columns, each
 * cell 120 characters. Pure, so both ends (vm/adsperf.ts and the route) and the tests share it.
 */
export interface AdsReport { title: string; head: string[]; rows: string[][] }

const MAX_ROWS = 200, MAX_COLS = 20, MAX_CELL = 120, MAX_PARAM = 60_000;
const cut = (s: unknown) => String(s ?? "").slice(0, MAX_CELL);

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};

export function adsReportParam(r: AdsReport): string {
  return toB64(JSON.stringify({ title: cut(r.title), head: r.head.slice(0, MAX_COLS).map(cut), rows: r.rows.slice(0, MAX_ROWS).map(x => x.slice(0, MAX_COLS).map(cut)) }));
}

export function adsReportFromParam(d: string | null): AdsReport | null {
  if (!d || d.length > MAX_PARAM || !/^[A-Za-z0-9_-]+$/.test(d)) return null;
  try {
    const v = JSON.parse(fromB64(d)) as unknown;
    if (!v || typeof v !== "object") return null;
    const { title, head, rows } = v as Record<string, unknown>;
    if (typeof title !== "string" || !Array.isArray(head) || !Array.isArray(rows) || !head.length) return null;
    if (head.length > MAX_COLS || rows.length > MAX_ROWS || head.some(h => typeof h !== "string")) return null;
    if (rows.some(r => !Array.isArray(r) || r.length !== head.length || r.some(c => typeof c !== "string"))) return null;
    return { title: cut(title), head: head.map(cut), rows: (rows as string[][]).map(r => r.map(cut)) };
  } catch {
    return null;
  }
}
