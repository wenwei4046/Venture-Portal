/**
 * The CRM's colours, 4a "Espresso & White" (2026-10-18, docs/design_handoff_crm_redesign › README › Design tokens).
 * Every value is a `var(--crm-*)` from globals.css, so the hex lives in one place. The screens read colours from here
 * (hand-written parts and view models) or have them written in by tools/crm-design/palette-4a.cjs (generated screens).
 */

const v = (name: string) => `var(--crm-${name})`;

export const C = {
  ink: v("ink"), inkSoft: v("ink-soft"), muted: v("muted"), faint: v("faint"), faint2: v("faint-2"),
  line: v("line"), rule: v("rule"), ruleSoft: v("rule-soft"),
  page: v("page"), field: v("field"), cream: v("cream"), creamNav: v("cream-nav"), creamNavActive: v("cream-nav-active"),
  navLine: v("nav-line"), hover: v("hover"), audit: v("audit"), auditLine: v("audit-line"),
  rust: v("rust"), rustPress: v("rust-press"), rustMeta: v("rust-meta"), orange: v("orange"), amber: v("amber"), amberLine: v("amber-line"),
  oxblood: v("oxblood"), brown: v("brown"), deep: v("deep"), onLight: v("on-light"), sidebarText: v("sidebar-text"),
  deltaGood: v("delta-good"), deltaBad: v("delta-bad"), peach: v("peach"), peachSoft: v("peach-soft"),
  whatsapp: v("whatsapp"), messenger: v("messenger"),
  tintAttention: v("tint-attention"), tintAppt: v("tint-appt"), tintFollow: v("tint-follow"), tintNew: v("tint-new"),
  tintWon: v("tint-won"), tintLost: v("tint-lost"), tintCold: v("tint-cold"), textAppt: v("text-appt"),
  tickRead: v("tick-read"),
} as const;

export type StatusName = "New" | "Attention" | "Follow up" | "Appointment" | "Won" | "Lost" | "Cold leads";

/** The status ramp (change list 5): the dot / bar, the pill's tint and the words on it. */
export const STATUS: Record<StatusName, { dot: string; tint: string; text: string }> = {
  New: { dot: v("st-new"), tint: C.tintNew, text: C.ink },
  Attention: { dot: v("st-attention"), tint: C.tintAttention, text: C.oxblood },
  "Follow up": { dot: v("st-follow"), tint: C.tintFollow, text: C.brown },
  Appointment: { dot: v("st-appt"), tint: C.tintAppt, text: C.textAppt },
  Won: { dot: v("st-won"), tint: C.tintWon, text: C.brown },
  Lost: { dot: v("st-lost"), tint: C.tintLost, text: C.muted },
  "Cold leads": { dot: v("st-cold"), tint: C.tintCold, text: C.muted },
};
/** The ramp by the CRM's own status keys (crm_contacts.status, plus the inbox's derived ones). */
export const STATUS_BY_KEY: Record<string, (typeof STATUS)[StatusName]> = {
  new: STATUS.New, need: STATUS.Attention, attention: STATUS.Attention, urgency: STATUS.Attention, follow_up: STATUS["Follow up"], fup: STATUS["Follow up"],
  appointment: STATUS.Appointment, appt: STATUS.Appointment, won: STATUS.Won, lost: STATUS.Lost, cold: STATUS["Cold leads"],
};

/**
 * Team colours (change list 6), fixed in this order: the Revenue Director, then the teams as the CRM lists them; teams
 * after the design's four continue with the two spares and then repeat. [colour, tint].
 */
export const DIRECTOR_COLOUR: [string, string] = [v("st-new"), C.tintNew];
const TEAM_COLOURS: [string, string][] = [
  [C.orange, C.tintAttention], [C.amber, C.tintAppt], [C.oxblood, C.tintAttention], [C.brown, C.tintFollow],
  [v("team-6"), C.tintWon], [v("team-7"), C.tintFollow],
];
/** The k-th team's (0 = the first team after the Director) [colour, tint]. */
export const teamColour = (k: number): [string, string] => TEAM_COLOURS[((k % TEAM_COLOURS.length) + TEAM_COLOURS.length) % TEAM_COLOURS.length];

/** Initials avatars (change list 7): one of four tints by a stable hash of the customer's name. [background, initials]. */
const AVATARS: [string, string][] = [[C.cream, C.ink], [C.tintAppt, C.textAppt], [C.tintFollow, C.brown], [C.tintAttention, C.oxblood]];
export function avatarTint(name: string): [string, string] {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATARS[h % AVATARS.length];
}

/** Channel colours (change list 4): WhatsApp green, Messenger blue — used for nothing else. */
export const CHANNEL_COLOUR = { whatsapp: C.whatsapp, messenger: C.messenger } as const;
/** A tile behind a channel's icon: its own colour, faint. */
export const CHANNEL_TINT = { whatsapp: "color-mix(in srgb, var(--crm-whatsapp) 14%, white)", messenger: "color-mix(in srgb, var(--crm-messenger) 12%, white)" } as const;

/** Urgency (change list 3): Reply soon in ink, Urgent and Overdue in oxblood. */
export const URGENCY_COLOUR = { soon: C.ink, urgent: C.oxblood, overdue: C.oxblood } as const;

/** Shadows (change list 8): only what floats casts one. */
export const SHADOW = {
  composerPhone: "0 4px 16px rgba(42,22,12,.12)", composerDesk: "0 6px 20px rgba(42,22,12,.08)", popover: "0 14px 36px rgba(42,22,12,.18)",
} as const;
