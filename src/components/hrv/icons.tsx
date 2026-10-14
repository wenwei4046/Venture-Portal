import type { ReactNode } from 'react'

// The HR revamp's line icons (2026-10-10). Two sets, as the prototype draws
// them: the nav set is the portal's BottomTabBar set plus a soft three-dot
// "tree" for Sales Groups (stroke 1.5); the card set is SheetIcon's (stroke
// 1.6). 24-unit viewBox, round caps and joins, `currentColor`.

const NAV = {
  home: (
    <>
      <path d="M3 10.2 12 3.5l9 6.7" />
      <path d="M5.5 9.2V20h13V9.2" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  approve: (
    <>
      <path d="M4 5.5h16v13H4z" />
      <path d="M8 12.2l2.7 2.7L16 9.6" />
    </>
  ),
  in: (
    <>
      <path d="M12 4v16" />
      <path d="M17.5 14.5 12 20l-5.5-5.5" />
    </>
  ),
  out: (
    <>
      <path d="M12 20V4" />
      <path d="M6.5 9.5 12 4l5.5 5.5" />
    </>
  ),
  invoice: (
    <>
      <path d="M6 3.5h9l3.5 3.5v13H6z" />
      <path d="M14.6 3.6v3.8h3.8" />
      <path d="M9 12h6M9 15.5h4" />
    </>
  ),
  payroll: (
    <>
      <path d="M3 7.5h18v9H3z" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 10.5v3M18 10.5v3" />
    </>
  ),
  staff: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </>
  ),
  director: (
    <>
      <circle cx="10" cy="8" r="3" />
      <path d="M4 20c0-3.4 2.7-5.7 6-5.7 1 0 2 .2 2.8.6" />
      <circle cx="17.5" cy="17.5" r="3.2" />
    </>
  ),
  report: (
    <>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8.5 20v-6M13 20v-9.5M17.5 20v-4" />
    </>
  ),
  org: (
    <>
      <rect x="9" y="3.5" width="6" height="4.5" rx="1" />
      <rect x="3.5" y="16" width="6" height="4.5" rx="1" />
      <rect x="14.5" y="16" width="6" height="4.5" rx="1" />
      <path d="M12 8v4M6.5 16v-4h11v4" />
    </>
  ),
  tree: (
    <>
      <circle cx="12" cy="5.5" r="2.4" />
      <circle cx="5.5" cy="18.5" r="2.4" />
      <circle cx="18.5" cy="18.5" r="2.4" />
      <path d="M12 8c0 4.5-6.5 3.5-6.5 8.1" />
      <path d="M12 8c0 4.5 6.5 3.5 6.5 8.1" />
    </>
  ),
  chev: <path d="M6 9l6 6 6-6" />,
  chevR: <path d="M9 6l6 6-6 6" />,
  // Round 2 (2026-10-11, README §3): Documentation, Hiring › Requests, Meeting Rooms, Guest Link.
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  hire: (
    <>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 20c0-3.6 2.7-6 6-6 1.2 0 2.3.3 3.2.8" />
      <path d="M18 14v6M15 17h6" />
    </>
  ),
  room: (
    <>
      <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  // Change password (2026-10-12): a padlock in the set's own hand.
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
      <path d="M12 14.5v2" />
    </>
  ),
} satisfies Record<string, ReactNode>

const CARD = {
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  percent: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 16 8-8" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="16" cy="16" r="1" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3l2 1 2-1 3 1 3-1 2 1 2-1v18l-2-1-2 1-3-1-3 1-2-1-2 1Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" />
    </>
  ),
  fileAlert: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M12 12v4M12 19h.01" />,
} satisfies Record<string, ReactNode>

export type NavIconName = keyof typeof NAV
export type CardIconName = keyof typeof CARD

function Svg({ size, stroke, children }: { size: number; stroke: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** The nav set (and its chevrons): 1.5 stroke unless told otherwise. */
export function NavIcon({ name, size = 16, stroke = 1.5 }: { name: NavIconName; size?: number; stroke?: number }) {
  return <Svg size={size} stroke={stroke}>{NAV[name]}</Svg>
}

/** The summary cards' set: 15px at 1.6, as SheetIcon draws them. */
export function CardIcon({ name, size = 15, stroke = 1.6 }: { name: CardIconName; size?: number; stroke?: number }) {
  return <Svg size={size} stroke={stroke}>{CARD[name]}</Svg>
}

/** The 14px chevrons the switcher, rows and Data source wear. */
export function Chevron({ right = false, size = 14 }: { right?: boolean; size?: number }) {
  return <NavIcon name={right ? 'chevR' : 'chev'} size={size} />
}

/** Any glyph of the two sets — the design system's `HrIcon` (2026-10-14, the Finance revamp v2). */
export type HrIconName = NavIconName | CardIconName

export function isCardIcon(name: HrIconName): name is CardIconName {
  return name in CARD
}

/** One name for both sets, each at its own stroke (the nav set 1.5, the card set 1.6). */
export function HrIcon({ name, size = 16, stroke }: { name: HrIconName; size?: number; stroke?: number }) {
  return isCardIcon(name)
    ? <Svg size={size} stroke={stroke ?? 1.6}>{CARD[name]}</Svg>
    : <Svg size={size} stroke={stroke ?? 1.5}>{NAV[name]}</Svg>
}
