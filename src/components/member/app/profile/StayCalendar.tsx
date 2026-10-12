"use client";

import type { CSSProperties } from "react";
import { shiftDay, tapStayDay, type StayPick, type StayWindow } from "@/lib/member/claim-rules";
import { dayLabel, MONTHS_SHORT } from "../format";
import s from "./profile.module.css";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** Monday 0 … Sunday 6. */
const weekday = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The weeks, Monday first, that hold the range — the days around it shown too, faded. */
export function calendarWeeks(range: Pick<StayWindow, "first" | "last">): string[][] {
  const weeks: string[][] = [];
  let day = shiftDay(range.first, -weekday(range.first));
  const end = shiftDay(range.last, 6 - weekday(range.last));
  while (day <= end) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++, day = shiftDay(day, 1)) week.push(day);
    weeks.push(week);
  }
  return weeks;
}

/** `Sep 2026`, `Sep – Oct 2026`, `Dec 2026 – Jan 2027` — the months the range touches. */
export function calendarTitle(range: Pick<StayWindow, "first" | "last">): string {
  const month = (day: string) => MONTHS_SHORT[Number(day.slice(5, 7)) - 1];
  const [a, b] = [range.first, range.last];
  if (a.slice(0, 7) === b.slice(0, 7)) return `${month(a)} ${a.slice(0, 4)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${month(a)} – ${month(b)} ${b.slice(0, 4)}`;
  return `${month(a)} ${a.slice(0, 4)} – ${month(b)} ${b.slice(0, 4)}`;
}

/**
 * An Airbnb stay's check-in and check-out on ONE calendar (user 2026-10-12: "这个 calendar 可以直接 select
 * date … 不用开两个 calendar"): it opens on the brand week's own days, and only the day before the fair
 * to the day after can be tapped — "那个 range 直接开放给他们，他们只需要在里面点这几天就行". The fair's
 * days carry a dot in the brand's colour; the stay is drawn from its check-in to its check-out, and the
 * two boxes under it say which day the next tap picks.
 */
export default function StayCalendar({ range, checkIn, checkOut, tone, onPick }: {
  /** The fair's days and the days a stay may fall on (`stayWindow`). */
  range: StayWindow;
  checkIn: string;
  checkOut: string;
  /** The brand week's colour, for the fair's days. */
  tone: string;
  onPick: (pick: StayPick) => void;
}) {
  const inStay = (day: string) => !!checkIn && (day === checkIn || (!!checkOut && day > checkIn && day <= checkOut));
  return (
    <div className={s.cal} role="group" aria-label="Check-in and check-out" style={{ "--cal-fair": tone } as CSSProperties}>
      <div className={s.calHead}>
        <span className={s.calTitle}>{calendarTitle(range)}</span>
        {checkIn && <button type="button" className={s.calClear} onClick={() => onPick({ checkIn: "", checkOut: "" })}>Clear</button>}
      </div>
      <div className={s.calGrid}>
        {WEEKDAYS.map((d, i) => <span key={i} className={s.calDow} aria-hidden="true">{d}</span>)}
        {calendarWeeks(range).flat().map(day => {
          const open = day >= range.first && day <= range.last;
          const fair = day >= range.start && day <= range.end;
          const end = day === checkIn ? "in" : day === checkOut ? "out" : null;
          // The stay's band runs between its two ends; a check-in alone has none yet.
          const band = !checkIn || !checkOut ? undefined : end ?? (day > checkIn && day < checkOut ? "mid" : undefined);
          return (
            <button key={day} type="button" className={s.calDay} disabled={!open} data-band={band} data-end={end ?? undefined} data-fair={fair || undefined}
              aria-pressed={open ? inStay(day) : undefined}
              aria-label={`${dayLabel(day)}${end === "in" ? ", check-in" : end === "out" ? ", check-out" : ""}${fair ? ", fair day" : ""}`}
              onClick={() => onPick(tapStayDay({ checkIn, checkOut }, day))}>
              <span className={s.calNum}>{Number(day.slice(8))}</span>
              {fair && <span className={s.calDot} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className={s.calEnds}>
        <span className={s.calEnd} data-next={!checkIn || undefined}>
          <span className={s.calEndLabel}>Check-in</span>
          <span className={s.calEndDay}>{checkIn ? dayLabel(checkIn) : "Tap a day"}</span>
        </span>
        <span className={s.calEnd} data-next={(!!checkIn && !checkOut) || undefined}>
          <span className={s.calEndLabel}>Check-out</span>
          <span className={s.calEndDay}>{checkOut ? dayLabel(checkOut) : checkIn ? "Tap a day" : "—"}</span>
        </span>
      </div>
    </div>
  );
}
