import { ARENA_WEEK_BRANDS, arenaMonthFridays, arenaWeekendLabel, type MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaBrandWeek } from "@/lib/member/arena-history";
import { dayRange, monthName } from "../format";

/**
 * My brand weeks — read only since 2026-10-12. The user: the Houzs ERP now
 * lists the sales attending every project fair, "so our sales is no more
 * needed to select brand week … this collum when press, can view they have
 * been allocate to which place work". Each fair weekend of a month shows the
 * booth the ERP's Sales Attending lists the member at; a weekend it lists them
 * nowhere, the booth they wrote the most bills at ("if fail, then go with auto
 * detect, same engine with previous one"). That booth alone earns their Fair
 * result points that week, and it is the fair a claim is for. Nothing is
 * picked here; HR changes the attendance in the ERP.
 */

/** erp — the ERP's Sales Attending; auto — auto-located by the bills; none — no booth that weekend. */
export type BrandWeekSource = "erp" | "auto" | "none";

export interface BrandWeekVM {
  /** The week's Friday. */
  key: string;
  title: string;
  /** The booth's days, else the weekend. */
  when: string;
  source: BrandWeekSource;
  /** The brand's code, and its name to show. */
  brand: string | null;
  brandName: string | null;
  /** "MID VALLEY · BIGHOME" */
  where: string | null;
  note: string;
}

export interface BrandMonthVM {
  period: string;
  label: string;
  weeks: BrandWeekVM[];
  /** Weekends the ERP lists them at a booth. */
  listed: number;
}

const NAME = new Map<string, string>(ARENA_WEEK_BRANDS.map(b => [b.code, b.name]));
const nameOf = (code: string | null) => (code ? NAME.get(code) ?? code : null);

/**
 * One month of the person's brand weeks. `history.weeks` carries only the
 * person read (the member, or whom the Principal views); `staffId` narrows it
 * again when known. `today` (YYYY-MM-DD, the office's) tells a weekend still
 * to come — not listed yet — from one that has passed with no fair. `viewing`:
 * the Principal reads somebody else, so the notes say "them", not "you".
 */
export function brandMonthVM(snap: MemberArenaSnapshot, today: string, staffId?: string | null, viewing = false): BrandMonthVM {
  const them = viewing ? "them" : "you";
  const their = viewing ? "their" : "your";
  const mine = new Map<string, ArenaBrandWeek>(
    (snap.history?.weeks ?? []).filter(w => !staffId || w.staffId === staffId).map(w => [w.week, w]),
  );
  const weeks = arenaMonthFridays(snap.period).map((friday, i): BrandWeekVM => {
    const found = mine.get(friday);
    const title = `Week ${i + 1}`;
    if (!found) {
      // A Friday's weekend ends that Sunday.
      const sunday = new Date(Date.parse(`${friday}T00:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
      return {
        key: friday, title, when: arenaWeekendLabel(friday), source: "none", brand: null, brandName: null, where: null,
        note: sunday >= today ? "Not on the ERP's Sales Attending yet" : "No fair this weekend",
      };
    }
    const where = [found.venue, found.organizer].filter(Boolean).join(" · ") || null;
    const note = found.source === "erp"
      ? (found.booths ?? 1) > 1
        ? `From the ERP's Sales Attending · listed at ${found.booths} booths — the one with the most of ${their} bills counts`
        : "From the ERP's Sales Attending"
      : `Auto-located · the ERP lists ${them} at no booth, so the booth with the most of ${their} bills counts`;
    return {
      key: friday, title,
      when: found.start && found.end ? dayRange(found.start, found.end) : arenaWeekendLabel(friday),
      source: found.source, brand: found.brand, brandName: nameOf(found.brand), where, note,
    };
  });
  return {
    period: snap.period,
    label: `${monthName(snap.period)} ${snap.period.slice(0, 4)}`,
    weeks,
    listed: weeks.filter(w => w.source === "erp").length,
  };
}
