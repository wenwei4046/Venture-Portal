"use client";

import { useState } from "react";
import { crmStatusLabel, searchContacts, type CrmAppointment, type CrmLead } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { apptLabel, whenLabel } from "./crm-format";
import { Icon, initials } from "./MemberUI";

/**
 * Every customer at a glance: search by name or phone, narrow to one Page,
 * call straight from the list, or open the chat.
 */
export default function MemberCrmContacts({ leads, appointments, onOpen }: {
  leads: CrmLead[];
  appointments: CrmAppointment[];
  onOpen: (leadId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<string | undefined>(undefined);
  const pages = [...new Set(leads.map(l => l.pageName).filter((p): p is string => !!p))].sort();
  const shown = searchContacts(leads, query, page);

  return <>
    <label className={c.search}>
      <Icon name="search" size={18} />
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search contacts" />
    </label>
    {pages.length > 1 && <div className={c.chips} role="group" aria-label="Page">
      <button className={c.chip} aria-pressed={!page} onClick={() => setPage(undefined)}>All pages</button>
      {pages.map(p => <button key={p} className={c.chip} aria-pressed={page === p} onClick={() => setPage(p)}>{p}</button>)}
    </div>}
    <section className={`${s.card} ${c.leadList}`} aria-label="Contacts">
      {shown.length === 0 && <p className={s.sub}>No contact matches.</p>}
      {shown.map(lead => {
        const last = lead.messages[lead.messages.length - 1];
        // The next visit says more than the ad once there is one.
        const next = appointments.filter(a => a.leadId === lead.id && a.state === "booked").sort((a, b) => a.start.localeCompare(b.start))[0];
        const line = next ? `${apptLabel(next)}` : `${lead.adName || lead.pageName || "—"} · last contact ${whenLabel(last?.at ?? lead.createdAt)}`;
        return <div key={lead.id} className={c.contactRow}>
          <button className={c.contactMain} onClick={() => onOpen(lead.id)}>
            <span className={c.leadAvatar} aria-hidden="true">{initials(lead.name)}</span>
            <span className={c.leadBody}>
              <strong>{lead.name}</strong>
              <span className={c.contactPhone}>{lead.phone}</span>
              <span className={c.contactLine}><b>{crmStatusLabel(lead.status)}</b> · {line}</span>
            </span>
          </button>
          <a className={c.callButton} href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`} aria-label={`Call ${lead.name}`}><Icon name="phone" size={18} /></a>
        </div>;
      })}
    </section>
  </>;
}
