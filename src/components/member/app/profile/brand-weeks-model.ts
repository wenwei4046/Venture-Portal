import { ARENA_WEEK_BRANDS, arenaMonthFridays, arenaWeekFriday, arenaWeekendLabel, type MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaBrandWeek } from "@/lib/member/arena-history";
import { dayRange, monthName } from "../format";
import { brandWeekTone } from "./profile-model";

/**
 * My brand weeks — read only since 2026-10-12. The user: the Houzs ERP now
 * lists the sales attending every project fair, "so our sales is no more
 * needed to select brand week … this collum when press, can view they have
 * been allocate to which place work". Each fair weekend shows the booth the
 * ERP's Sales Attending lists the member at; a weekend it lists them nowhere,
 * the booth they wrote the most bills at ("if fail, then go with auto detect,
 * same engine with previous one"). That booth alone earns their Fair result
 * points that week, and it is the fair a claim is for. Nothing is picked
 * here; HR changes the attendance in the ERP.
 *
 * Redrawn the same day (the user: "直接显示出它是什么 brand，然后在什么地方，
 * 是什么 venue 跟什么 organization 就好", the months folded, "they only view
 * their current and previous assign, but not future"): month by month, this
 * month open; per weekend only the brand, the venue and the organizer; and
 * no weekend after this week's.
 */

/** erp — the ERP's Sales Attending; auto — auto-located by the bills; none — no booth that weekend. */
export type BrandWeekSource = "erp" | "auto" | "none";

export interface BrandWeekVM {
  /** The week's Friday. */
  key: string;
  /** "W1" — the week of its month. */
  n: string;
  /** The booth's days, else the weekend. */
  when: string;
  source: BrandWeekSource;
  /** The brand's code, and its name to show. */
  brand: string | null;
  brandName: string | null;
  venue: string | null;
  organizer: string | null;
  /** Said instead of a booth: "Not assigned yet" this week, "No fair" for a weekend gone by. */
  empty: string | null;
  /** This week's weekend — the last one shown. */
  current: boolean;
  /** The badge's two colours: the brand's, else the quiet pair. */
  color: string;
  tint: string;
}

export interface BrandMonthVM {
  period: string;
  /** "October 2026" */
  label: string;
  /** Its weekends up to this week's, in order. */
  weeks: BrandWeekVM[];
  /** The month folded: "2 fairs", "1 fair", "No fair". */
  summary: string;
}

const NAME = new Map<string, string>(ARENA_WEEK_BRANDS.map(b => [b.code, b.name]));
const nameOf = (code: string | null) => (code ? NAME.get(code) ?? code : null);

/** `2026-08` two months before `2026-10`. */
function monthBefore(period: string, back: number): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 7);
}

/**
 * The person's brand weeks, newest month first: this month and the two before
 * it — what the read carries (`member_arena_booth_history`'s `weeks`) — each
 * cut at this week's weekend (Mon–Sun, `arenaWeekFriday`), so a later one never
 * shows; a month with no weekend yet (a Sunday the 1st) is left out. `history.weeks`
 * carries only the person read (the member, or whom the Principal views);
 * `staffId` narrows it again when known. `today` is the office's `YYYY-MM-DD`.
 */
export function brandWeeksVM(snap: MemberArenaSnapshot, today: string, staffId?: string | null): BrandMonthVM[] {
  const thisFriday = arenaWeekFriday(today);
  const mine = new Map<string, ArenaBrandWeek>(
    (snap.history?.weeks ?? []).filter(w => !staffId || w.staffId === staffId).map(w => [w.week, w]),
  );
  const current = today.slice(0, 7);
  return [0, 1, 2].map(back => monthBefore(current, back)).flatMap((period): BrandMonthVM[] => {
    const weeks = arenaMonthFridays(period).map((friday, i): BrandWeekVM | null => {
      if (friday > thisFriday) return null;
      const found = mine.get(friday);
      const [color, tint] = brandWeekTone(found?.brand ?? null);
      const base = { key: friday, n: `W${i + 1}`, current: friday === thisFriday, color, tint };
      if (!found) {
        return { ...base, when: arenaWeekendLabel(friday), source: "none", brand: null, brandName: null, venue: null, organizer: null,
          empty: friday === thisFriday ? "Not assigned yet" : "No fair" };
      }
      return {
        ...base,
        when: found.start && found.end ? dayRange(found.start, found.end) : arenaWeekendLabel(friday),
        source: found.source, brand: found.brand, brandName: nameOf(found.brand) ?? "No brand",
        venue: found.venue, organizer: found.organizer, empty: null,
      };
    }).filter((w): w is BrandWeekVM => w !== null);
    if (!weeks.length) return [];
    const fairs = weeks.filter(w => w.source !== "none").length;
    return [{
      period,
      label: `${monthName(period)} ${period.slice(0, 4)}`,
      weeks,
      summary: fairs === 0 ? "No fair" : `${fairs} fair${fairs === 1 ? "" : "s"}`,
    }];
  });
}
