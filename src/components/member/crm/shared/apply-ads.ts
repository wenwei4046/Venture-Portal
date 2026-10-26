/**
 * Save and apply to all's window (2026-10-24, the owner: "按 Save and Apply to All 的话，它会跳出来一个 floating window：1. 可以
 * 在里面勾选广告，决定哪一个要、哪一个不要 2. 选了之后，再选择是 standard 的 apply to all，还是全部总和起来算"): the ads, each
 * ticked or not, then Standard — the setting on each, each counting its own leads — or Count together — the setting on each,
 * and they are the together ads (crm_save_ads, mig 20261025134700). The ad being edited is always one of them. The desktop's
 * window (DeskApplyAds) and the phone's sheet (Phone4aApplySheet) draw the same thing.
 */
import type { CrmAdRule } from "@/lib/member/crm-data";

/** The window's draft: the ads ticked and which way. */
export interface ApplyPick { ads: string[]; together: boolean }
export interface ApplyAd { id: string; label: string; leads: number; status: { label: string; fg: string; bg: string } | null }
export interface ApplyDone { saved: number; dealt: number; left: number }

/** What the window opens on: an ad counted together opens on Count together with the other together ads ticked; any other
 *  ad on Standard with every ad of the list behind it ticked (what the button did before the window). */
export function applyOpening(openId: string, rules: CrmAdRule[], listed: string[]): ApplyPick {
  if (rules.some(r => r.adId === openId && r.together)) return { ads: [openId, ...rules.filter(r => r.together && r.adId !== openId).map(r => r.adId)], together: true };
  return { ads: [...new Set([openId, ...listed])], together: false };
}

export function applyWindowVM(o: { pick: ApplyPick; openId: string; ads: ApplyAd[]; rules: CrmAdRule[]; set: (p: ApplyPick | null) => void; run: (ads: ApplyAd[], together: boolean) => void | Promise<unknown> }) {
  const on = new Set([o.openId, ...o.pick.ads]), group = new Set(o.rules.filter(r => r.together).map(r => r.adId));
  const list = [...o.ads.filter(a => a.id === o.openId), ...o.ads.filter(a => a.id !== o.openId)];
  const picked = list.filter(a => on.has(a.id)), n = picked.length, allOn = list.every(a => on.has(a.id));
  // Counting together takes two ads at least (the database says so too).
  const ok = o.pick.together ? n >= 2 : n >= 1;
  return {
    modes: ([[false, "Standard"], [true, "Count together"]] as const).map(([v, label]) => ({ label, on: o.pick.together === v, pick: () => o.set({ ...o.pick, together: v }) })),
    count: `${n} of ${list.length}`,
    all: { label: allOn ? "Untick all" : "Tick all", toggle: () => o.set({ ...o.pick, ads: allOn ? [o.openId] : list.map(a => a.id) }) },
    rows: list.map(a => ({ id: a.id, name: a.label, leads: `${a.leads} lead${a.leads === 1 ? "" : "s"}`, status: a.status, on: on.has(a.id),
      // The ad being edited is always saved — it is the setting's own ad.
      fixed: a.id === o.openId, together: group.has(a.id),
      toggle: () => { if (a.id !== o.openId) o.set({ ...o.pick, ads: on.has(a.id) ? o.pick.ads.filter(x => x !== a.id) : [...o.pick.ads, a.id] }); } })),
    go: { label: o.pick.together ? `Count ${n} ads together` : `Apply to ${n} ad${n === 1 ? "" : "s"}`, ok, run: ok ? () => o.run(picked, o.pick.together) : undefined },
    close: () => o.set(null),
  };
}
export type ApplyWindowVM = ReturnType<typeof applyWindowVM>;

/** The toast once it is saved. */
export function applyToast(r: ApplyDone, together: boolean): string {
  const dealt = r.dealt ? ` · ${r.dealt} waiting lead${r.dealt === 1 ? "" : "s"} dealt` : "";
  const left = r.left ? ` · ${r.left === 1 ? "1 ad now counts on its own" : `${r.left} ads now count on their own`}` : "";
  return together ? `${r.saved} ads counted together${left}${dealt}` : `Applied to ${r.saved} ad${r.saved === 1 ? "" : "s"}${dealt}`;
}
