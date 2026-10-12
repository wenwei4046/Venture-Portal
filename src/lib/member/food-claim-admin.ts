/**
 * People › Member services › Food claim (2026-10-13 — the user: "Food claim 本身只需要 set 它的
 * amount 就可以了（per day 是多少钱）… 顺便要 set 什么 title 的人可以 entitle 这个 food claim
 * （这是 for revenue team 的人的）"; then "this food claim is only for fair sub-department").
 *
 * HR sets two things: the rate a day, and which titles may claim it. A member whose seat in Fair
 * holds a ticked title sees *Submit food claim* on Requests and claims the days of their brand week's
 * fair they worked; the amount is worked out in the database (`member_claim_food_detail`) from the
 * rate as it stands when they send it. The rules here mirror `member_admin_save_food_claim`, which
 * checks them again.
 */

export interface FoodClaimTitle {
  id: string;
  name: string;
  /** The title's level (People › Hierarchy › Levels), for the list's order and its second column. */
  level: string | null;
  /** How many hold it in Fair now. */
  people: number;
  active: boolean;
}

export interface FoodClaimAdmin {
  /** The sub-department a food claim is for — Fair. */
  subDepartmentId: string | null;
  subName: string | null;
  perDay: number | null;
  titleIds: string[];
  /** Every Revenue title, the highest level first. */
  titles: FoodClaimTitle[];
  updatedAt: string | null;
  updatedBy: string | null;
}

/** The form as typed: the rate a string until it is saved. */
export interface FoodClaimDraft {
  perDay: string;
  titleIds: string[];
}

export interface FoodClaimToSave {
  perDay: number | null;
  titleIds: string[];
}

const MAX_RATE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function readFoodClaimAdmin(raw: unknown): FoodClaimAdmin | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.titles)) return null;
  const titles = (r.titles as unknown[]).flatMap(t => {
    const x = t && typeof t === "object" ? (t as Record<string, unknown>) : null;
    return x && typeof x.id === "string" && typeof x.name === "string"
      ? [{ id: x.id, name: x.name, level: text(x.level), people: Math.max(0, Math.trunc(Number(x.people) || 0)), active: x.active !== false }]
      : [];
  });
  return {
    subDepartmentId: text(r.subDepartmentId),
    subName: text(r.subName),
    perDay: num(r.perDay),
    titleIds: Array.isArray(r.titleIds) ? (r.titleIds as unknown[]).filter((id): id is string => typeof id === "string") : [],
    titles,
    updatedAt: text(r.updatedAt),
    updatedBy: text(r.updatedBy),
  };
}

/** The form as it opens: the rate as stored, the titles ticked in the list's order. */
export function foodClaimDraft(s: FoodClaimAdmin): FoodClaimDraft {
  const ticked = new Set(s.titleIds);
  return { perDay: s.perDay === null ? "" : String(s.perDay), titleIds: s.titles.filter(t => ticked.has(t.id)).map(t => t.id) };
}

function rate(typed: string): { value: number | null; problem: string | null } {
  const t = typed.trim();
  if (!t) return { value: null, problem: null };
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t) || Number(t) > MAX_RATE) return { value: null, problem: "The rate a day must be an amount from RM 0 to RM 100,000, to the sen." };
  return { value: Number(t), problem: null };
}

/** What stops the form being saved, first problem first; nothing = it may be saved. */
export function foodClaimProblems(d: FoodClaimDraft): string[] {
  const out: string[] = [];
  const r = rate(d.perDay);
  if (r.problem) out.push(r.problem);
  else if (d.titleIds.length > 0 && !(r.value && r.value > 0)) out.push("Set the rate a day before ticking who may claim it.");
  if (d.titleIds.length > 60) out.push("Keep it to 60 titles.");
  return out;
}

export function foodClaimToSave(d: FoodClaimDraft): FoodClaimToSave {
  return { perDay: rate(d.perDay).value, titleIds: [...new Set(d.titleIds)].sort() };
}

/** Anything changed from what is stored. */
export function foodClaimChanged(s: FoodClaimAdmin, d: FoodClaimDraft): boolean {
  return JSON.stringify(foodClaimToSave(foodClaimDraft(s))) !== JSON.stringify(foodClaimToSave(d));
}

/** Tick or untick a title, keeping the list's order. */
export function toggleFoodTitle(s: FoodClaimAdmin, d: FoodClaimDraft, id: string): FoodClaimDraft {
  const ticked = new Set(d.titleIds);
  if (ticked.has(id)) ticked.delete(id);
  else ticked.add(id);
  return { ...d, titleIds: s.titles.filter(t => ticked.has(t.id)).map(t => t.id) };
}

/** The server's own check of what arrives — the same rules as the form. */
export function validFoodClaimToSave(v: unknown): v is FoodClaimToSave {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (r.perDay !== null && (typeof r.perDay !== "number" || !Number.isFinite(r.perDay) || r.perDay < 0 || r.perDay > MAX_RATE
    || Math.abs(Math.round(r.perDay * 100) - r.perDay * 100) > 1e-6)) return false;
  if (!Array.isArray(r.titleIds) || r.titleIds.length > 60 || r.titleIds.some(id => typeof id !== "string" || !UUID.test(id))) return false;
  return r.titleIds.length === 0 || (typeof r.perDay === "number" && r.perDay > 0);
}
