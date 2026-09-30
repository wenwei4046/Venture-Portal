"use client";

/**
 * The member app's shared atoms.
 *
 * They lived inside MemberWorkspace until Insight and the team map needed the
 * same pill, the same icon set and the same money format. Two copies of a
 * progress bar is two bars that drift apart, so they moved here rather than
 * being duplicated.
 */

import type { ReactNode } from "react";
import s from "./member.module.css";

export const icons: Record<string, string> = {
  home: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  wallet: "M3 6h17v15H3V6Zm0 0V3h14v3m-3 6h7v5h-7v-5Z",
  calculator:
    "M5 3h14v18H5V3Zm3 4h8M8 11h1m3 0h1m3 0h.1M8 15h1m3 0h1m3 0h.1M8 18h1m3 0h1m3 0h.1",
  team: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  user: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  more: "M6 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12ZM8 10h8M8 14h5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  install: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm4 5v7m-3-3 3 3 3-3m-4 7h2",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  back: "M19 12H5m6-6-6 6 6 6",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8M8 12h8M8 16h4",
  replace: "M3 7h16l-4-4m6 14H5l4 4M19 7l-4 4M5 17l4-4",
  list: "M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  eyeOff:
    "m3 3 18 18M10 5c7-1 12 7 12 7s-2 4-5 5M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3-.3 4-1",
  refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18a8 8 0 0 1-13-2",
  moon: "M20 14A9 9 0 0 1 10 4 9 9 0 1 0 20 14Z",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  info: "M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  copy: "M8 8h13v13H8V8ZM16 4V1H1v15h3",
  gift: "M3 8h18v4H3V8Zm2 4v9h14v-9M12 8v13m0-13C5 8 4 2 8 2c3 0 4 6 4 6Zm0 0c7 0 8-6 4-6-3 0-4 6-4 6Z",
  target: "M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5m0 5L22 2m-5 0h5v5",
  logout: "M9 3H3v18h6m5-14 5 5-5 5M8 12h13",
  calendar: "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14",
  file: "M5 2h9l5 5v15H5V2Zm9 0v6h5M8 12h8M8 16h8",
  trophy:
    "M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  chart: "M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18",
  branch: "M6 3v12a3 3 0 0 0 3 3h9M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0-16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  map: "M9 4 3 6v15l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v15m6-13v15",
  zoomIn: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-3v6m-3-3h6",
  zoomOut: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-11 0h6",
  locate: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v3m0 14v3M2 12h3m14 0h3",
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={icons[name] ?? icons.info} />
    </svg>
  );
}

export const fmt = (n: number) =>
  new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(n);

/** Compact money for a dense row: RM 128k rather than RM 128,000.00. */
export const fmtShort = (n: number) =>
  Math.abs(n) >= 1000
    ? `RM ${new Intl.NumberFormat("en-MY", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n)}`
    : fmt(n);

export const date = (raw: string) =>
  new Date(raw).toLocaleDateString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    month: "short",
    day: "numeric",
  });

export const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`${s.pill} ${s[tone] ?? s.neutral}`}>{children}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <Icon name="list" size={28} />
      <h3>{title}</h3>
      <p className={s.sub}>{children}</p>
    </div>
  );
}

export function Progress({
  label,
  value,
  target,
  unit,
  privateMode = false,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  privateMode?: boolean;
}) {
  const amount = (n: number) =>
    privateMode ? "••••" : unit === "RM" ? fmt(n) : `${n} ${unit}`;
  const pct = target && target > 0 ? (value / target) * 100 : 0;
  return (
    <div className={s.kpi}>
      <div className={`${s.row} ${s.rowWrap}`}>
        <span className={s.kpiTitle}>{label}</span>
        <span className={s.amount}>{amount(value)}</span>
      </div>
      {target !== null && target > 0 ? (
        <>
          <div
            className={s.progress}
            role="progressbar"
            aria-label={label}
            aria-valuenow={Math.min(pct, 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
          </div>
          <div className={`${s.row} ${s.rowWrap}`}>
            <span className={s.sub}>
              {value >= target
                ? "Target achieved"
                : `Remaining ${amount(target - value)}`}
            </span>
            <span className={s.caption}>Target {amount(target)}</span>
          </div>
        </>
      ) : (
        <p className={s.sub} style={{ marginTop: 8 }}>
          Target not set
        </p>
      )}
    </div>
  );
}
