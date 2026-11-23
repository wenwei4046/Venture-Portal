/** The desktop's Ads Manager ranges as GET /member/crm-ad-figures reads them (2026-11-23): at most 8 ranges and 40 ads. */
export type AdFigNeed = { key: string; since: string; until: string; ids: string[] };
const DAY = /^\d{4}-\d{2}-\d{2}$/, AD = /^\d{5,32}$/;

export function needsFromParam(raw: string | null): AdFigNeed[] | null {
  try {
    const v: unknown = JSON.parse(raw ?? "");
    if (!Array.isArray(v)) return null;
    return v.slice(0, 8).map((n: Record<string, unknown>) => ({ key: String(n?.key ?? ""), since: String(n?.since ?? ""), until: String(n?.until ?? ""),
      ids: (Array.isArray(n?.ids) ? n.ids : []).map(String).filter((id: string) => AD.test(id)).slice(0, 40) }))
      .filter(n => n.key.length > 0 && DAY.test(n.since) && DAY.test(n.until) && n.ids.length > 0);
  } catch { return null; }
}

/** How long the server keeps a range's answer: one ended before today an hour, one still running 10 minutes. */
export const keepSeconds = (until: string, today: string) => (until < today ? 3600 : 600);
