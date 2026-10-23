/**
 * The desktop CRM's constants, copied from the prototype (CrmFrame v2.dc.html's script, CRM Desktop v2): its icons'
 * paths, colours and copy. Kept as the design writes them; a change here is a change to the design.
 */

import { C, DIRECTOR_COLOUR, STATUS, teamColour } from "../../shared/palette";

/** The Revenue app's sidebar: [label, icon path, count]. */
export const NAV: [string, string][] = [
  ["Today", "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9"],
  ["Insight", "M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18"],
  ["Quote", "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 7h6M9 11h1M12 11h1M15 11h0M9 15h1M12 15h1M9 18h1M12 18h1M15 15v3"],
  ["Arena", "M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3"],
  ["Profile", "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  ["Notifications", "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"],
];
export const ICON: Record<string, string> = {
  insight: "M3 3v18h18M18 17V9M13 17V5M8 17v-3",
  adsperf: "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  showrooms: "M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  assignment: "M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3M15 9l6-6",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  settings: "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4",
  contacts: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  channels: "M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  forms: "M9 3h6v3H9zM6 5H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1M8 11h8M8 15h5",
  auditlog: "M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v5h5",
  reports: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 17v-3M12 17v-6M16 17v-4",
  profile: "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
};
export const PANEL_TABS: [import("./ctx").DeskTab, string][] = [["insight", "Insight"], ["inbox", "Inbox"], ["people", "Contacts"], ["assignment", "Assignment"], ["calendar", "Calendar"], ["adsperf", "Ads Performance"], ["showrooms", "Showrooms"], ["forms", "Customer form"], ["channels", "Channels"], ["settings", "Settings"], ["auditlog", "Audit log"], ["reports", "Reports"]];
/** The sidebar's groups (v2): [label, pages]. */
export const NAV_GROUPS: [string, import("./ctx").DeskTab[]][] = [["", ["insight", "inbox", "people", "calendar"]], ["MARKETING", ["adsperf", "assignment"]], ["REPORTS", ["reports"]], ["MANAGEMENT", ["showrooms", "forms", "channels", "settings", "auditlog"]]];
/**
 * CRM · Manage's pages (rev 1 dev changes), with v2's Customer form and Audit log (a setting and its history). Contacts
 * reads (View at All, as Inbox); Channels shows read-only to whoever cannot manage (README §7).
 */
export const MANAGE_TABS = new Set(["assignment", "adsperf", "showrooms", "settings", "forms", "auditlog", "reports"]);
export const PANE_MODE = { adsperf: "closed", insight: "closed", calendar: "closed", inbox: "empty", assignment: "wideEmpty", settings: "wideEmpty", showrooms: "wideEmpty", people: "closed", forms: "wideEmpty", channels: "closed", auditlog: "closed", reports: "closed" } as const;
export const LI: Record<string, string> = {
  sprout: "M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z",
  megaphone: "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  briefcase: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  store: "M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6",
  file: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8",
  chart: "M3 3v18h18M18 17V9M13 17V5M8 17v-3",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z",
  zap: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
};
export const TINTS: [string, string][] = [[C.tintFollow, C.brown], [C.tintAppt, C.textAppt], [C.tintAttention, C.rust], [C.field, C.ink]];
/**
 * Status chips: [background, ink] — 4a's status ramp (crm/shared/palette.ts). Urgent and Overdue are urgent text
 * (oxblood on the Attention tint), Reply soon ink on the field.
 */
export const ST: Record<string, [string, string]> = {
  New: [STATUS.New.tint, STATUS.New.text], Appointment: [STATUS.Appointment.tint, STATUS.Appointment.text],
  "Follow up": [STATUS["Follow up"].tint, STATUS["Follow up"].text], Overdue: [C.tintAttention, C.oxblood],
  Booked: [STATUS.Appointment.tint, STATUS.Appointment.text], "Showed up": [C.tintFollow, C.brown], "To mark": [C.tintAppt, C.textAppt],
  Urgent: [C.tintAttention, C.oxblood], "Reply soon": [C.field, C.ink], Won: [STATUS.Won.tint, STATUS.Won.text], Lost: [STATUS.Lost.tint, STATUS.Lost.text],
  Cold: [STATUS["Cold leads"].tint, STATUS["Cold leads"].text], "No show": [C.tintAttention, C.oxblood], "No show yet": [C.field, C.muted],
};
export const SOLID = [C.rust, C.ink, C.brown, C.oxblood, C.inkSoft];
export const PHONE_IC: Record<string, string> = {
  "Organic Leads": "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5",
  "Ads to teams": "M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7",
  "Full time lead allocation": "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4",
};
/** Ad delivery (Meta): [label, dot, hint, tint, ink]. */
export const ST_META: Record<string, [string, string, null, string, string]> = {
  all: ["All ads", C.ink, null, C.field, C.ink], Running: ["Running", C.brown, null, C.tintFollow, C.brown],
  Paused: ["Paused", C.faint2, null, C.field, C.muted], Pending: ["Pending", C.amber, null, C.tintAppt, C.textAppt],
};
export const SHEET_COPY: Record<string, [string, string, string]> = {
  forms: ["Customer form", "What salespeople fill in for each customer", "Customer form"],
  showrooms: ["Showrooms", "Where visits are booked", "Showrooms"], assignment: ["Assignment", "Who gets each new enquiry", "All assignment"],
  settings: ["Settings", "Choose what to set up", "All settings"],
};
export const SECTION_PICK: Record<string, number> = { assignment: 0, settings: 0, showrooms: 0, forms: 0 };
export const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DIRECTOR_TEAM = "Revenue Director";
/** The Revenue Director's key in an ad's split — the database's fixed key for the directors' "team" (mig 20261016010000). */
export const DIRECTOR_SPLIT_KEY = "ffffffff-ffff-ffff-ffff-ffffffffffff";
export const DIRECTOR_C: [string, string] = DIRECTOR_COLOUR;

/** The teams' colours, in the CRM's order (4a change list 6: after the Director, orange, amber, oxblood, brown, then the spares). */
export const teamColours = (k: number): [string, string] => teamColour(k);
