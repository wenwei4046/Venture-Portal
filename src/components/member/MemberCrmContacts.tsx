"use client";

import { useState } from "react";
import { crmStatusLabel, searchContacts, type CrmAppointment, type CrmLead } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { whenLabel } from "./crm-format";
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

  return (
    <section className={s.card} aria-label="Contacts">
      <label className={c.search}>
        <Icon name="search" size={18} />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or phone" aria-label="Search contacts" />
      </label>
      {pages.length > 1 && <div className={c.chips} role="group" aria-label="Page">
        <button className={c.chip} aria-pressed={!page} onClick={() => setPage(undefined)}>All pages</button>
        {pages.map(p => <button key={p} className={c.chip} aria-pressed={page === p} onClick={() => setPage(p)}>{p}</button>)}
      </div>}
      <p className={s.caption}>{shown.length} contact{shown.length === 1 ? "" : "s"}</p>
      {shown.length === 0 && <p className={s.sub}>No contact matches.</p>}
      {shown.map(lead => {
        const last = lead.messages[lead.messages.length - 1];
        const visits = appointments.filter(a => a.leadId === lead.id && a.state !== "cancelled").length;
        return <div key={lead.id} className={c.contactRow}>
          <button className={c.contactMain} onClick={() => onOpen(lead.id)}>
            <span className={c.leadAvatar} aria-hidden="true">{initials(lead.name)}</span>
            <span className={c.leadBody}>
              <span className={c.leadTop}><strong>{lead.name}</strong><span className={c.status} data-status={lead.status}>{crmStatusLabel(lead.status)}</span></span>
              <span className={s.caption}>{lead.phone}</span>
              <span className={s.caption}>{lead.pageName ?? "—"} · last contact {whenLabel(last?.at ?? lead.createdAt)}{visits ? ` · ${visits} appointment${visits === 1 ? "" : "s"}` : ""}</span>
            </span>
          </button>
          <a className={c.callButton} href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`} aria-label={`Call ${lead.name}`}><Icon name="phone" size={18} /></a>
        </div>;
      })}
    </section>
  );
}
