import { ARENA_WEEK_BRANDS, arenaMonthFridays, arenaWeekendLabel, type ArenaWeekBrand, type ArenaWeekPicks, type MemberArenaSnapshot } from "@/lib/member/arena";
import { dayRange, monthName, shortDay } from "../format";

/**
 * My brand weeks (2026-10-05): the brand the member worked each fair weekend of
 * a month — the one booth whose Fair result scores for them that week. The
 * prototype has a chip for it and no page; this is built from its row parts.
 * A week closes seven days after its fair (`weekLocks`); after that only the
 * back office changes it — the Principal viewing a member here, or HR on
 * People › Member services › Brand weeks.
 */

export interface BrandWeekVM {
  /** The week's Friday — the key a pick is saved under. */
  key: string;
  title: string;
  /** The booth's days for the brand chosen, else the weekend. */
  when: string;
  pick: ArenaWeekBrand | null;
  /** The member may not change it (closed); the back office always may. */
  locked: boolean;
  note: string;
  /** The note says the week is closed. */
  closed: boolean;
}

export interface BrandMonthVM {
  period: string;
  label: string;
  weeks: BrandWeekVM[];
  picked: number;
  /** Something here differs from what is saved. */
  dirty: boolean;
}

const NAME: Record<ArenaWeekBrand, string> = Object.fromEntries(ARENA_WEEK_BRANDS.map(b => [b.code, b.name])) as Record<ArenaWeekBrand, string>;
export const BRAND_CHOICES = ARENA_WEEK_BRANDS;

/** What the month's picks would be saved as: the saved ones with the edits laid over. */
export function picksToSave(snap: MemberArenaSnapshot, edits: ArenaWeekPicks | undefined): ArenaWeekPicks {
  const out: ArenaWeekPicks = { ...(snap.brandWeeks?.picks ?? {}) };
  for (const [week, brand] of Object.entries(edits ?? {})) {
    if (brand) out[week] = brand; else delete out[week];
  }
  return out;
}

export function brandMonthVM(snap: MemberArenaSnapshot, edits: ArenaWeekPicks | undefined, backOffice: boolean): BrandMonthVM {
  const saved = snap.brandWeeks?.picks ?? {};
  const picks = picksToSave(snap, edits);
  const me = snap.selfId;
  const events = snap.history?.events ?? [];
  const weeks = arenaMonthFridays(snap.period).map((friday, i): BrandWeekVM => {
    const pick = picks[friday] ?? null;
    const lock = snap.weekLocks?.find(l => l.week === friday) ?? null;
    // Where they score this week as things stand: the brand they picked, else where the Arena placed them.
    const scoring = events.find(e => e.week === friday && e.people.some(p => p.id === me && p.scoring !== false)) ?? null;
    const booth = events.find(e => e.week === friday && e.brand === (pick ?? scoring?.brand)) ?? null;
    const placed = !saved[friday] && scoring?.brand ? NAME[scoring.brand as ArenaWeekBrand] ?? scoring.brand : null;
    const state = lock?.locked
      ? `Closed ${shortDay(lock.closesOn)}${placed ? ` · auto-located: ${placed}` : ""}`
      : lock?.closesOn ? `Open until ${shortDay(lock.closesOn)}` : "Open";
    const where = booth ? [booth.venue, booth.organizer].filter(Boolean).join(" · ") : null;
    return {
      key: friday, title: `Week ${i + 1}`,
      when: booth ? dayRange(booth.start, booth.end) : arenaWeekendLabel(friday),
      pick, locked: !!lock?.locked && !backOffice,
      note: [state, where].filter(Boolean).join(" · "),
      closed: !!lock?.locked,
    };
  });
  const dirty = Object.entries(edits ?? {}).some(([week, brand]) => (brand ?? null) !== (saved[week] ?? null));
  return { period: snap.period, label: `${monthName(snap.period)} ${snap.period.slice(0, 4)}`, weeks, picked: weeks.filter(w => w.pick).length, dirty };
}
