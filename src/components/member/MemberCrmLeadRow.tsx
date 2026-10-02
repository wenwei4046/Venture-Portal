"use client";

import {
  URGENCY_LABELS, crmStatusLabel, lostReasonLabel, messagePreview, previousLabel, replyUrgency, waitingLabel,
  type CrmLead,
} from "@/lib/member/crm";
import c from "./MemberCrm.module.css";
import s from "./member.module.css";
import { whenLabel } from "./crm-format";
import { initials } from "./MemberUI";

/**
 * One lead in a list: who, which ad, the last message, status and how long
 * they have waited. `owner` names the salesperson when the viewer is looking
 * at someone else's lead (a leader or the Boss).
 */
export default function MemberCrmLeadRow({ lead, now, viewerId, nameOf, owner, onOpen }: {
  lead: CrmLead;
  now: Date;
  viewerId: string;
  nameOf: (memberId: string) => string;
  owner?: string;
  onOpen: () => void;
}) {
  const last = lead.messages[lead.messages.length - 1];
  const urgency = replyUrgency(lead, now);
  // Who sent the last reply, as the viewer would say it.
  const sender = last?.from !== "me" ? "" : (last.by ?? lead.assignedTo) === viewerId ? "You: " : `${firstName(nameOf(last.by ?? lead.assignedTo ?? ""))}: `;
  return <button className={c.leadRow} data-urgency={urgency.level} onClick={onOpen}>
    <span className={c.leadAvatar} aria-hidden="true">{initials(lead.name)}</span>
    <span className={c.leadBody}>
      <span className={c.leadTop}><strong>{lead.name}</strong><span className={s.caption}>{whenLabel(last?.at ?? lead.createdAt)}</span></span>
      <span className={c.leadAd}>{lead.adName}</span>
      <span className={c.leadPreview}>{sender}{last && messagePreview(last)}</span>
      <span className={c.leadMeta}>
        <span className={c.status} data-status={lead.status}>{crmStatusLabel(lead.status)}{lead.lost && ` · ${lostReasonLabel(lead.lost)}`}</span>
        {lead.previous && <span className={c.previous}>{previousLabel(lead.previous)}</span>}
        {urgency.level !== "none" && <span className={c.waitBadge} data-urgency={urgency.level}>{URGENCY_LABELS[urgency.level]} · {waitingLabel(urgency.waitingMinutes)}</span>}
        {lead.unread > 0 && <span className={c.unread}>{lead.unread} new</span>}
        {owner && <span className={c.owner}>→ {owner}</span>}
      </span>
    </span>
  </button>;
}

export const firstName = (name: string) => name.split(" ")[0];
