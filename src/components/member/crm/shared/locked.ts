/**
 * Members locked out of the dealing for now (2026-10-22, mig 20261022130000; the owner: "如果 lock 了他，他暂时不会出现在
 * assignment 的名单里", their share "自动分给同队其他人"). Assignment's lists — an ad's split, Full time — leave them out; the
 * dealer (crm_deal_handlers) never picks them. A By % split is a ratio, so what the others really get is their saved %
 * scaled to 100 — `sharedOut` shows it; the locked person's own % is kept for when they come back.
 */
export const lockedOf = (d: { lockedStaff?: string[] }) => new Set(d.lockedStaff ?? []);

export function sharedOut(values: Record<string, number>, live: string[], lockedHere: boolean): Record<string, number> | null {
  if (!lockedHere || !live.length) return null;
  const sum = live.reduce((s, id) => s + (values[id] ?? 0), 0);
  if (!sum || sum === 100) return null;
  const out: Record<string, number> = {};
  let left = 100;
  live.forEach((id, i) => { const v = i === live.length - 1 ? Math.max(0, left) : Math.round(((values[id] ?? 0) * 100) / sum); out[id] = v; left -= v; });
  return out;
}
