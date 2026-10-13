/**
 * The CRM on live data: the database's rows (crm_* tables, read through RLS,
 * and crm_people()) turned into the shapes the screens already draw — the
 * same CrmLead / CrmAppointment / CrmMember / CrmAssignConfig the demo uses.
 * Pure, so every rule is tested; the reads are crm-actions.ts.
 */
import { CRM_LOST_REASONS, type CrmAppointment, type CrmAttachment, type CrmLead, type CrmLostReason, type CrmMessage, type CrmShowroom, type CrmStatus } from "./crm";
import type { CrmAssignConfig, CrmMember, CrmRole } from "./crm-team";

/* ── The rows, as PostgREST returns them ───────────────────────────────── */

export interface CrmPeopleRow {
  me: string | null;
  role: CrmRole | null;
  people: { id: string; name: string; role: CrmRole; uplineId: string | null; fullTime: boolean; title?: string | null }[];
}

export interface CrmContactRow {
  id: string;
  channel: "whatsapp" | "messenger";
  account_id: string;
  external_id: string;
  name: string | null;
  phone: string | null;
  ad_source_id: string | null;
  ad_headline: string | null;
  status: CrmStatus;
  lost_reason: string | null;
  lost_note: string | null;
  previous_status: "won" | "lost" | null;
  assigned_to: string | null;
  team_id: string | null;
  last_customer_at?: string | null;
  unread: number;
  created_at: string;
}

export interface CrmMessageRow {
  id: string;
  contact_id: string;
  direction: "in" | "out";
  kind: string;
  body: string | null;
  auto: boolean;
  sent_by: string | null;
  sent_at: string;
  /** Meta's media id: the file is fetched by our route, never by the browser from Meta. */
  media_id?: string | null;
  /** A file we sent, in the private bucket crm-media (mig 20261013240000). */
  media_path?: string | null;
  /** Messenger's address for a customer's attachment (its own CDN). */
  media_url?: string | null;
  status?: "received" | "sent" | "delivered" | "read" | "failed" | null;
  error?: string | null;
}

export interface CrmAppointmentRow {
  id: string;
  contact_id: string;
  showroom: string;
  start_at: string;
  minutes: number;
  state: CrmAppointment["state"];
}

export interface CrmShowroomRow { id: string; name: string; active: boolean; sort_order: number }
export interface CrmAssignRuleRow { ad_source_id: string; ad_label: string | null; tl_ids: string[]; shares?: Record<string, number> | null }
export interface CrmTeamSettingsRow {
  tl_id: string;
  team_share: number;
  percent_days: number[] | null;
  weekend_full_time: boolean | null;
  ratios: Record<string, number> | null;
  edited_by: string | null;
  edited_at: string | null;
}

export interface CrmRows {
  people: CrmPeopleRow;
  contacts: CrmContactRow[];
  messages: CrmMessageRow[];
  appointments: CrmAppointmentRow[];
  rules: CrmAssignRuleRow[];
  teams: CrmTeamSettingsRow[];
  showrooms: CrmShowroomRow[];
}

/** What the CRM screen needs to run on live data. */
export interface CrmLiveData {
  /** The signed-in person; null when their login is not linked to a person or their title has no CRM role. */
  viewerId: string | null;
  /** Why there is no viewer: the login is not linked to a person in People, or that person's title has no CRM role. */
  setup: "not_linked" | "no_role" | null;
  members: CrmMember[];
  leads: CrmLead[];
  appointments: CrmAppointment[];
  config: CrmAssignConfig;
  /** Open and closed, in the list's order. */
  showrooms: CrmShowroom[];
}

/* ── Rows → screen ─────────────────────────────────────────────────────── */

const CHANNEL_LABEL: Record<CrmContactRow["channel"], string> = { whatsapp: "WhatsApp", messenger: "Messenger" };
const MEDIA_LABEL: Record<string, string> = {
  image: "📷 Photo", video: "🎥 Video", audio: "🎤 Voice message", document: "📄 Document",
  sticker: "Sticker", location: "📍 Location", template: "Template message",
};
const lostReasons = new Set<string>(CRM_LOST_REASONS.map(r => r.value));

/** A message as the chat draws it. Media is named until it can be downloaded (it needs the token, server-side). */
/** Media the chat can show, through our own route (crm-media/[messageId]) — never Meta's address. */
const ATTACHMENT_KIND: Record<string, CrmAttachment["kind"]> = { image: "image", sticker: "image", video: "video", audio: "audio", document: "file" };

export function messageFromRow(row: CrmMessageRow, owner: string | null): CrmMessage {
  const media = MEDIA_LABEL[row.kind];
  const shown = row.media_id || row.media_path || row.media_url ? ATTACHMENT_KIND[row.kind] : undefined;
  // With the file shown, the caption is the text; without it, the label says what it was.
  const text = shown ? row.body ?? "" : media ? (row.body ? `${media} · ${row.body}` : media) : row.body ?? "";
  return {
    id: row.id,
    from: row.direction === "in" ? "lead" : "me",
    text,
    at: row.sent_at,
    ...(shown ? { attachment: { kind: shown, url: `/member/crm-media/${row.id}`, ...(shown === "file" ? { name: row.body || "Document" } : {}) } } : {}),
    // Only our own messages have a delivery state worth showing.
    ...(row.direction === "out" && row.status && row.status !== "received" ? { status: row.status } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.auto ? { auto: true } : {}),
    // Replied by someone other than the customer's own salesperson: the team sees who.
    ...(row.direction === "out" && !row.auto && row.sent_by && row.sent_by !== owner ? { by: row.sent_by } : {}),
  };
}

export function leadFromRow(row: CrmContactRow, messages: CrmMessageRow[]): CrmLead {
  const lostReason = row.lost_reason && lostReasons.has(row.lost_reason) ? (row.lost_reason as CrmLostReason) : row.lost_reason ? "other" : null;
  return {
    id: row.id,
    // A WhatsApp profile name is what the customer chose; the number is the fallback.
    name: row.name?.trim() || row.phone || "Customer",
    phone: row.phone ?? "",
    adName: row.ad_headline?.trim() || (row.ad_source_id ? `Ad ${row.ad_source_id}` : `${CHANNEL_LABEL[row.channel]} enquiry`),
    pageName: CHANNEL_LABEL[row.channel],
    channel: row.channel,
    campaign: row.ad_source_id ?? "",
    status: row.status,
    ...(row.status === "lost" && lostReason ? { lost: { reason: lostReason, ...(row.lost_note ? { note: row.lost_note } : {}) } } : {}),
    ...(row.previous_status ? { previous: { status: row.previous_status } } : {}),
    ...(row.assigned_to ? { assignedTo: row.assigned_to } : {}),
    ...(row.team_id ? { teamId: row.team_id } : {}),
    ...(row.last_customer_at ? { lastCustomerAt: row.last_customer_at } : {}),
    createdAt: row.created_at,
    unread: row.unread,
    messages: messages
      .filter(m => m.contact_id === row.id)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
      .map(m => messageFromRow(m, row.assigned_to)),
  };
}

/** People → the reporting line the team layer reads. A TL's team is named after them until teams have names of their own. */
export function membersFromPeople(people: CrmPeopleRow["people"]): CrmMember[] {
  const ids = new Set(people.map(p => p.id));
  return people.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    // An upline the viewer cannot see (above them) is left out: the line starts with them.
    ...(p.uplineId && ids.has(p.uplineId) ? { uplineId: p.uplineId } : {}),
    ...(p.role === "rs" ? { fullTime: p.fullTime } : {}),
    ...(p.role === "tl" ? { teamName: `${p.name.split(" ")[0]}'s team` } : {}),
  }));
}

export function configFromRows(rules: CrmAssignRuleRow[], teams: CrmTeamSettingsRow[]): CrmAssignConfig {
  return {
    rules: rules.filter(r => r.tl_ids.length > 0).map(r => ({
      adId: r.ad_source_id, adName: r.ad_label?.trim() || `Ad ${r.ad_source_id}`, tlIds: r.tl_ids,
      ...(r.shares && Object.keys(r.shares).length ? { shares: r.shares } : {}),
    })),
    teams: Object.fromEntries(teams.map(t => [t.tl_id, {
      percentDays: (t.percent_days ?? []).filter(d => d >= 1 && d <= 4),
      weekendFullTime: t.weekend_full_time ?? true,
      ratios: t.ratios ?? {},
      ...(t.edited_by && t.edited_at ? { editedBy: { memberId: t.edited_by, at: t.edited_at } } : {}),
    }])),
  };
}

export function crmFromRows(rows: CrmRows): CrmLiveData {
  return {
    viewerId: rows.people.role ? rows.people.me : null,
    setup: !rows.people.me ? "not_linked" : !rows.people.role ? "no_role" : null,
    members: membersFromPeople(rows.people.people),
    leads: rows.contacts.map(c => leadFromRow(c, rows.messages)),
    appointments: rows.appointments.map(a => ({ id: a.id, leadId: a.contact_id, showroomId: a.showroom, start: a.start_at, minutes: a.minutes, state: a.state })),
    config: configFromRows(rows.rules, rows.teams),
    showrooms: [...rows.showrooms].sort((a, b) => a.sort_order - b.sort_order).map(r => ({ id: r.id, name: r.name, active: r.active })),
  };
}
