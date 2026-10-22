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

export interface ActivePerson { id: string; name: string; role: string; ini: string; active: boolean; toggle: () => void }
export interface ActiveGroup { name: string; color: string; count: string; people: ActivePerson[] }

export interface ActiveVM { groups: ActiveGroup[]; dirty: boolean; saveLabel: string; cancel: () => void; save: () => void }

/**
 * Assignment › Active members (the owner, 2026-10-22: "把这个 active member 的功能独立在" Ads to teams 后面; then "做个 save
 * button"): every team, the Revenue Director first, each person Active or Locked. A switch changes the draft
 * (`draft`: id → locked); Save writes what changed through crm_set_locked, Cancel drops it — as Member work type.
 */
export function activeVM(
  groups: { name: string; color: string; people: { id: string; name: string }[] }[],
  locked: Set<string>, roleOf: (p: { id: string; name: string }) => string,
  draft: Record<string, boolean> | null, setDraft: (d: Record<string, boolean> | null) => void,
  setLocked: (id: string, on: boolean) => Promise<boolean>, told: (msg: string) => void,
): ActiveVM {
  const ini = (n: string) => n.split(/s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const d = draft ?? {}, isLocked = (id: string) => d[id] ?? locked.has(id);
  const changed = Object.keys(d).filter(id => d[id] !== locked.has(id));
  return {
    groups: groups.filter(g => g.people.length).map(g => ({
      name: g.name, color: g.color,
      count: `${g.people.filter(p => !isLocked(p.id)).length} of ${g.people.length} active`,
      people: g.people.map(p => {
        const active = !isLocked(p.id);
        return { id: p.id, name: p.name, role: roleOf(p), ini: ini(p.name), active, toggle: () => setDraft({ ...d, [p.id]: active }) };
      }),
    })),
    dirty: changed.length > 0,
    saveLabel: changed.length === 1 ? "Save 1 change" : `Save ${changed.length} changes`,
    cancel: () => setDraft(null),
    save: () => { if (!changed.length) return; void Promise.all(changed.map(id => setLocked(id, d[id]))).then(rs => { if (rs.every(Boolean)) { setDraft(null); told("Saved · Active members"); } }); },
  };
}
