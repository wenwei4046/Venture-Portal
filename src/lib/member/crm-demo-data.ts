/**
 * The redesigned CRM on demo data (/member/preview): the old demo's customers,
 * appointments and team (crm-demo.ts), in the shape live data comes in
 * (CrmData). The person looking is "a1".
 */
import { crmDemo, crmTeamDemo, demoShowrooms } from "./crm-demo";
import { DEFAULT_AUTO_REPLY_SET, canFromRole, type CrmData } from "./crm-data";

/** `viewer`: whose eyes — "a1" (a salesperson), or "boss" / "hod" for the Control panel (/member/preview?page=crm&crmAs=boss). */
export function crmDemoData(you = "You", viewer = "a1"): CrmData {
  const demo = crmDemo(), team = crmTeamDemo(you);
  const people = team.members.map(m => ({ id: m.id, name: m.name, role: m.role, uplineId: m.uplineId ?? null, fullTime: !!m.fullTime }));
  const customers = demo.leads.map((l, i) => {
    const msgs = l.messages.filter(m => m.from !== "system");
    const lastIn = [...msgs].reverse().find(m => m.from === "lead");
    return {
      id: l.id, name: l.name, phone: l.phone.replace(/\D/g, ""), channel: (i % 3 === 1 ? "messenger" : "whatsapp") as "whatsapp" | "messenger",
      adId: l.campaign || null, ad: l.adName, status: l.status, ...(l.lost ? { lost: l.lost } : {}),
      wonAmount: l.status === "won" ? 3280 : null, assignedTo: l.assignedTo ?? null, teamId: l.teamId ?? null,
      lastCustomerAt: lastIn?.at ?? null, createdAt: l.createdAt, unread: l.unread,
      details: { type: "", size: "", loc: "", req: "", budget: "" }, detailsSaved: false,
      messages: msgs.map(m => ({ id: `${l.id}-${m.id}`, from: m.from as "lead" | "me", kind: "text", text: m.text, at: m.at, ...(m.from === "me" ? { status: "read" as const } : {}), ...(m.auto ? { auto: true } : {}) })),
    };
  });
  const viewerId = people.some(p => p.id === viewer) ? viewer : "a1";
  return {
    viewerId, can: canFromRole(people.find(p => p.id === viewerId)?.role ?? null), setup: null, people, customers,
    visits: demo.appointments.map(a => ({ id: a.id, customerId: a.leadId, showroomId: a.showroomId, start: a.start, minutes: a.minutes, state: a.state === "attended" ? "attended" : a.state === "cancelled" ? "cancelled" : "booked", outcome: null, remindedAt: null })),
    rooms: demoShowrooms.map((r, i) => ({ id: r.id, name: r.name, active: true, address: i === 0 ? "Jalan Ampang, Kuala Lumpur" : "", slots: ["11:00", "13:00", "15:00", "17:00", "19:00"], cap: 2, weekly: [], blocks: [] })),
    prefs: {}, hiddenMessages: [], labels: [], customerLabels: {}, quickReplies: [], autoReplies: DEFAULT_AUTO_REPLY_SET,
    invites: [], shares: [], events: [], notifsSeenAt: null, notifRead: [], adRules: [], ftRules: [],
  };
}
