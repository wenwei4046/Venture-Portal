"use client";
/**
 * A partner's booking link on the desktop (2026-10-29, mig 20261029190000; the owner: The Conts' own salespeople book a
 * showroom slot from a link, without the CRM). Settings › Booking link: the link on or off, its address to copy, a new
 * address (the old one stops opening), and the bookings still to come. The pane: one booking as it came in — when, where,
 * who booked it, the customer, the remarks and the booker's note — with Cancel for CRM · Manage.
 */
import { useState } from "react";
import type { CrmPartnerBooking, CrmPartnerLink } from "@/lib/member/crm-data";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const when = (iso: string) => new Date(iso).toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const btn = (primary: boolean) => ({ border: primary ? "0" : "1px solid var(--crm-line)", background: primary ? "var(--crm-rust)" : "#fff", color: primary ? "#fff" : "var(--crm-ink)", borderRadius: "10px", padding: "8px 14px", font: "600 13px Inter, sans-serif", cursor: "pointer" });

export interface BookingLinkBits {
  can: boolean; links: CrmPartnerLink[]; upcoming: CrmPartnerBooking[]; roomName: (id: string) => string;
  set: (id: string, on: boolean | null, fresh: boolean) => Promise<boolean>; open: (id: string) => void; toast: (msg: string) => void;
}

export function DeskBookingLink({ v }: { v: BookingLinkBits }) {
  const [busy, setBusy] = useState(false);
  if (!v.can) return <div style={{ padding: "24px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Only CRM · Manage sees and changes the booking link.</div>;
  const urlOf = (l: CrmPartnerLink) => `${typeof window === "undefined" ? "" : window.location.origin}/b/${l.code}`;
  const run = (p: Promise<boolean>) => { setBusy(true); void p.finally(() => setBusy(false)); };
  const copy = (l: CrmPartnerLink) => { void navigator.clipboard?.writeText(urlOf(l)).then(() => v.toast("Link copied"), () => v.toast(urlOf(l))); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "980px" }}>
      {v.links.map(l => (
        <div key={l.id} style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "18px", borderBottom: "1px solid var(--crm-line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: 1, font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>{l.name}</span>
            <span style={{ font: "500 12px Inter, sans-serif", color: l.on ? "var(--crm-st-won)" : "var(--crm-muted)" }}>{l.on ? "On · the link takes bookings" : "Off · the link says closed"}</span>
            <button type="button" role="switch" aria-checked={l.on} aria-label={`${l.name} booking link`} disabled={busy} onClick={() => run(v.set(l.id, !l.on, false))}
              style={{ width: "44px", height: "26px", borderRadius: "13px", border: 0, padding: "3px", cursor: "pointer", background: l.on ? "var(--crm-st-won)" : "var(--crm-line)", display: "flex", justifyContent: l.on ? "flex-end" : "flex-start" }}>
              <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "9px 12px", borderRadius: "10px", background: "var(--crm-sand)", font: "500 13px ui-monospace, monospace", color: "var(--crm-ink)" }}>{urlOf(l)}</code>
            <button type="button" onClick={() => copy(l)} style={btn(true)}>Copy link</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Make a new link for ${l.name}? The old one stops opening; bookings already made stay.`)) run(v.set(l.id, null, true)); }} style={btn(false)}>New link</button>
          </div>
          <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>
            No sign-in. They pick a showroom, a day and a time; the showroom&apos;s limit per slot counts their bookings and the CRM&apos;s together, so a full slot is full on both sides. Each booking gets a reference to change or cancel it.
          </span>
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ paddingBottom: "10px", borderBottom: "1px solid var(--crm-ink)", font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>Coming up · {v.upcoming.length}</div>
        {!v.upcoming.length && <div style={{ padding: "18px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No bookings through the link yet.</div>}
        {v.upcoming.map(b => (
          <button key={b.id} type="button" onClick={() => v.open(b.id)} style={{ display: "grid", gridTemplateColumns: "190px minmax(0,1fr) minmax(0,1fr) 90px", gap: "12px", alignItems: "center", padding: "12px 0", border: 0, borderBottom: "1px solid var(--crm-line)", background: "transparent", textAlign: "left", cursor: "pointer", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
            <span style={{ fontWeight: 600 }}>{when(b.start)}</span>
            <span>{b.customer} <span style={{ color: "var(--crm-muted)" }}>· {b.customerPhone}</span></span>
            <span style={{ color: "var(--crm-muted)" }}>{v.roomName(b.showroomId)} · by {b.booker}</span>
            <span style={{ font: "600 12px ui-monospace, monospace", color: "var(--crm-rust)" }}>{b.ref}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export interface PartnerPaneBits { b: CrmPartnerBooking; room: string; partnerName: string; can: boolean; infoRows: { label: string; value: string }[]; cancel: () => Promise<boolean> }

export function DeskPartnerPane({ v, close }: { v: PartnerPaneBits | null; close: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!v) return null;
  const { b } = v;
  const row = (k: string, val: string) => val ? (
    <div key={k} style={{ display: "grid", gridTemplateColumns: "130px minmax(0,1fr)", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--crm-line)", font: "400 13px Inter, sans-serif" }}>
      <span style={{ color: "var(--crm-muted)" }}>{k}</span><span style={{ color: "var(--crm-ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{val}</span>
    </div>) : null;
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ padding: "3px 9px", borderRadius: "999px", background: "var(--crm-peach-soft)", color: "var(--crm-brown)", font: "600 11px Inter, sans-serif" }}>{v.partnerName} booking</span>
        <span style={{ flex: 1, font: "600 12px ui-monospace, monospace", color: "var(--crm-rust)" }}>{b.ref}</span>
        <button type="button" aria-label="Close" onClick={close} style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: "20px", color: "var(--crm-faint)" }}>×</button>
      </div>
      <div style={{ font: `500 22px ${TIGHT}`, color: "var(--crm-ink)", marginTop: "6px" }}>{b.customer}</div>
      <div style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)", marginBottom: "8px" }}>{when(b.start)} · {v.room}{b.state === "cancelled" ? " · Cancelled" : ""}</div>
      {row("Customer phone", b.customerPhone)}
      {v.infoRows.map(x => row(x.label, x.value))}
      {row("Remarks", b.remarks)}
      {row("Booked by", `${b.booker}${b.bookerPhone ? ` · ${b.bookerPhone}` : ""}`)}
      {row("Booker's note", b.note)}
      {row("Booked on", when(b.createdAt))}
      <span style={{ marginTop: "8px", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Booked through {v.partnerName}&apos;s link — no CRM customer behind it; it takes its slot on the calendar.</span>
      {v.can && b.state === "booked" && (
        <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Cancel ${b.customer}'s visit, ${when(b.start)}?`)) { setBusy(true); void v.cancel().then(ok => { setBusy(false); if (ok) close(); }); } }}
          style={{ alignSelf: "flex-start", marginTop: "10px", ...btn(false), color: "var(--crm-oxblood)" }}>Cancel booking</button>
      )}
    </div>
  );
}

/**
 * The booking link over Customer form (the owner, 2026-10-29: "在电脑端 crm 中的 contact form 加上这个的控制 panel，同时附上
 * 这个链接让人可以复制"): each partner's link on one line — on / off, its address to copy, a new address, and how many
 * bookings are coming up. Settings › Booking link keeps the full page with the list.
 */
export function DeskBookingBar({ v }: { v: BookingLinkBits }) {
  const [busy, setBusy] = useState(false);
  if (!v.can || !v.links.length) return null;
  const urlOf = (l: CrmPartnerLink) => `${typeof window === "undefined" ? "" : window.location.origin}/b/${l.code}`;
  const run = (p: Promise<boolean>) => { setBusy(true); void p.finally(() => setBusy(false)); };
  const copy = (l: CrmPartnerLink) => { void navigator.clipboard?.writeText(urlOf(l)).then(() => v.toast("Link copied"), () => v.toast(urlOf(l))); };
  return (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", padding: "12px 36px", borderBottom: "1px solid var(--crm-rule)", background: "var(--crm-cream)" }}>
      {v.links.map(l => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span style={{ flex: "none", font: `500 14px ${TIGHT}`, color: "var(--crm-ink)" }}>Booking link · {l.name}</span>
          <button type="button" role="switch" aria-checked={l.on} aria-label={`${l.name} booking link`} disabled={busy} onClick={() => run(v.set(l.id, !l.on, false))}
            style={{ flex: "none", width: "38px", height: "22px", borderRadius: "11px", border: 0, padding: "3px", cursor: "pointer", background: l.on ? "var(--crm-st-won)" : "var(--crm-line)", display: "flex", justifyContent: l.on ? "flex-end" : "flex-start" }}>
            <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }} />
          </button>
          <span style={{ flex: "none", font: "500 12px Inter, sans-serif", color: l.on ? "var(--crm-st-won)" : "var(--crm-muted)" }}>{l.on ? "On" : "Off"}</span>
          <code style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "6px 10px", borderRadius: "8px", background: "#fff", border: "1px solid var(--crm-line)", font: "500 12px ui-monospace, monospace", color: "var(--crm-ink)" }}>{urlOf(l)}</code>
          <button type="button" onClick={() => copy(l)} style={{ ...btn(true), flex: "none", padding: "6px 12px" }}>Copy link</button>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Make a new link for ${l.name}? The old one stops opening; bookings already made stay.`)) run(v.set(l.id, null, true)); }} style={{ ...btn(false), flex: "none", padding: "6px 12px" }}>New link</button>
          <span style={{ flex: "none", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{v.upcoming.filter(b => b.partner === l.id).length} coming up</span>
        </div>
      ))}
    </div>
  );
}
