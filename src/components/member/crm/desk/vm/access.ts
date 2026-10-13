/**
 * Settings › Permissions (the owner, 2026-10-13: "在 setting 做一個權限的控制台 … 勾選他就會有"): everybody in the CRM
 * with their CRM row — View (none · own · all), Edit (none · own · all), Manage (off · on) — as their title gives it and
 * as changed for them. A choice saves at once (crm_set_access, mig 20261014010000) into the same per-person cells as
 * People › Permissions, so their phone and desktop follow within the CRM's 5-second read. A choice equal to the
 * title's is stored as "follows the title". Oneself, the Boss and full-access accounts are locked (the database says why).
 */
import { crmWrite, type CrmAccessRow } from "@/app/(member)/member/crm-actions";
import type { DeskCtx } from "./ctx";
import { initials, teamNameOf } from "./data";

type Level = "none" | "own" | "all";
const ACTIONS = [["view", "View", ["none", "own", "all"]], ["edit", "Edit", ["none", "own", "all"]], ["manage", "Manage", ["none", "all"]]] as const;
const WORD: Record<string, string> = { none: "None", own: "Own", all: "All" };
const MANAGE_WORD: Record<string, string> = { none: "Off", all: "On" };

/** What a person holds for one action: their own cell over their title's; none when neither gives it. */
export const levelOf = (r: Pick<CrmAccessRow, "tpl" | "own">, action: string): Level =>
  ((r.own[action] ?? r.tpl[action] ?? "none") as Level);

/** The three values crm_set_access takes for a new choice: "title" wherever the choice is the title's own. */
export function accessArgs(r: Pick<CrmAccessRow, "tpl" | "own">, action: string, value: Level): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [a] of ACTIONS) {
    const want = a === action ? value : levelOf(r, a), title = (r.tpl[a] ?? "none") as Level;
    out[a] = want === title ? "title" : want;
  }
  return out;
}

export function accessVM(ctx: DeskCtx) {
  const { ui, patch, data, live } = ctx;
  const rows = ui.access ?? [];
  const reload = () => patch({ access: null });
  const save = async (r: CrmAccessRow, args: Record<string, string>, what: string) => {
    if (live) {
      const res = await crmWrite("crm_set_access", { p_staff: r.staffId, p_view: args.view, p_edit: args.edit, p_manage: args.manage });
      if (!res.ok) { patch({ toast: res.error }); return; }
    }
    patch({ toast: `Saved · ${r.name} · ${what}`, access: live ? null : rows.map(x => (x.staffId === r.staffId ? { ...x, own: Object.fromEntries(Object.entries(args).filter(([, v]) => v !== "title")) } : x)) });
  };
  return {
    loading: ui.access === null, empty: ui.access !== null && !rows.length, refresh: reload,
    rows: rows.map(r => {
      const p = data.people.find(x => x.id === r.staffId), changed = Object.keys(r.own).length > 0;
      return {
        name: r.name, ini: initials(r.name), sub: [p?.title || r.template || "", p ? teamNameOf(ctx, p.id) ?? "" : ""].filter(Boolean).join(" · "),
        locked: r.locked ?? "", isLocked: !!r.locked, changed, note: changed ? "Changed for this person" : `Follows the title${r.template ? ` · ${r.template}` : ""}`,
        reset: () => { if (!r.locked && changed) void save(r, { view: "title", edit: "title", manage: "title" }, "back to the title"); },
        groups: ACTIONS.map(([a, label, levels]) => {
          const cur = levelOf(r, a), title = (r.tpl[a] ?? "none") as Level;
          return {
            label,
            opts: levels.map(l => {
              const on = cur === l, words = a === "manage" ? MANAGE_WORD : WORD;
              return { label: words[l], on, mark: l === title, bg: on ? "#fff" : "transparent", fg: on ? "#3F2B22" : r.locked ? "#C9B8AC" : "#806B60",
                sh: on ? "0 1px 3px rgba(63,43,34,.14)" : "none", cur: r.locked ? "not-allowed" : "pointer",
                pick: () => { if (r.locked || on) return; void save(r, accessArgs(r, a, l), `${label} ${words[l]}`); } };
            }),
          };
        }),
      };
    }),
  };
}
