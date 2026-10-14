/**
 * History (CRM Desktop rev 1, B8): the audit trail's rows (fetchCrmHistory → audit_changes) as the page shows them —
 * which setting, what it is called, and each changed field before → after in words, people and teams by name.
 */
import type { CrmHistoryRow } from "@/app/(member)/member/crm-actions";
import type { HistRow } from "./ctx";

const FIELD: Record<string, string> = {
  name: "Name", active: "Open", address: "Address", slots: "Time slots", cap: "Visits per slot", weekly: "Closed every week", blocks: "Closures",
  photo_path: "Photo", map_google: "Google Maps link", map_waze: "Waze link", sort_order: "Order",
  ad_label: "Ad", mode: "Mode", team_split: "Team split", people_mode: "Inside teams", people: "People", team_modes: "Inside each team", started_at: "Counted from",
  days: "Days", vals: "Who, which days", full_time: "Full time",
  channel: "Channel", body: "Message", status: "Status", is_on: "On", reject_reason: "Meta's reason", meta_name: "Meta's name",
  sections: "Questions", sub_department_id: "Sub-department",
};
const SKIP = new Set(["id", "created_at", "created_by", "updated_at", "updated_by", "meta_id", "language", "category"]);
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A value in words: a person or team by name, a list joined, yes / no, a long thing cut short. */
export function words(field: string, v: unknown, nameOf: (id: string) => string): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return UUID.test(v) ? nameOf(v) : v.length > 80 ? `${v.slice(0, 77)}…` : v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return "None";
    if (field === "weekly") return v.map(d => DAY[Number(d)] ?? String(d)).join(", ");
    if (field === "blocks") return `${v.length} closure${v.length === 1 ? "" : "s"}`;
    if (field === "sections") return `${v.reduce((n, s) => n + (Array.isArray((s as { fields?: unknown[] }).fields) ? (s as { fields: unknown[] }).fields.length : 0), 0)} questions`;
    return v.map(x => words(field, x, nameOf)).join(", ");
  }
  if (typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>);
    if (!e.length) return "None";
    const s = e.map(([k, x]) => `${UUID.test(k) ? nameOf(k) : k}: ${typeof x === "object" ? words(field, x, nameOf) : words(field, x, nameOf)}`).join(" · ");
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  }
  return String(v);
}

export function historyRows(rows: CrmHistoryRow[], nameOf: (id: string) => string): HistRow[] {
  return rows.map(r => {
    const row = r.after ?? r.before ?? {};
    const label = (row.name ?? row.ad_label ?? (row.staff_id ? nameOf(String(row.staff_id)) : row.tl_id ? `${nameOf(String(row.tl_id))}'s team` : null) ?? r.key) as string;
    const fields = r.op === "UPDATE" ? r.changed : Object.keys(row);
    return {
      at: r.at, who: r.who, table: r.table, op: r.op, what: String(label || "—"), row, before: r.before, after: r.after,
      changes: r.op === "UPDATE"
        ? fields.filter(k => !SKIP.has(k)).map(k => ({ field: FIELD[k] ?? k, from: words(k, r.before?.[k], nameOf), to: words(k, r.after?.[k], nameOf) }))
        : [],
    };
  });
}
