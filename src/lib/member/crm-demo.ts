/**
 * Demo data for the member CRM prototype. Nobody here is real, and nothing is
 * read from Meta yet — the screen says so.
 */
import { OPENING_HOURS, type CrmAppointment, type CrmBusySlot, type CrmLead, type CrmShowroom } from "./crm";
import type { CrmAssignConfig, CrmMember } from "./crm-team";

const at = (dayOffset: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

/**
 * A moment that many OPENING-HOUR minutes before now, so the demo shows every
 * urgency colour whatever the time of day.
 */
const ago = (minutes: number) => {
  let left = minutes;
  let t = new Date();
  for (let guard = 0; guard < 60; guard++) {
    const open = new Date(t); open.setHours(OPENING_HOURS.open, 0, 0, 0);
    const close = new Date(t); close.setHours(OPENING_HOURS.close, 0, 0, 0);
    if (t > close) t = close;
    if (t > open) {
      const avail = (t.getTime() - open.getTime()) / 60_000;
      if (avail >= left) return new Date(t.getTime() - left * 60_000).toISOString();
      left -= avail;
    }
    t = new Date(open); t.setDate(t.getDate() - 1); t.setHours(OPENING_HOURS.close, 0, 0, 0);
  }
  return t.toISOString();
};

export const demoShowrooms: CrmShowroom[] = [
  { id: "kl", name: "Kuala Lumpur Showroom" },
  { id: "pg", name: "Penang Showroom" },
];

export function crmDemo(): {
  leads: CrmLead[];
  appointments: CrmAppointment[];
  showroomBusy: Record<string, CrmBusySlot[]>;
  myBusy: CrmBusySlot[];
} {
  const leads: CrmLead[] = [
    {
      id: "l1", name: "Tan Mei Ling", phone: "+60 12-345 6789",
      adName: "Akemi Mattress · October Fair", campaign: "AKEMI OCT", pageName: "Dream Crafter Design",
      status: "new", createdAt: ago(215), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: interested in a Queen mattress, prefers weekend visit.", at: ago(215) },
        { id: "m2", from: "lead", text: "Hi, is the October promotion still available?", at: ago(210) },
      ],
    },
    {
      id: "l2", name: "Ahmad Faizal", phone: "+60 17-222 3344",
      adName: "Sofa Clearance · Carousel", campaign: "SOFA CLEARANCE", pageName: "The Conts Property Management",
      status: "follow_up", createdAt: ago(10 * 60), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: 3-seater sofa, budget RM 3,000–4,000.", at: ago(10 * 60) },
        { id: "m2", from: "me", text: "Hi Encik Ahmad, thanks for your interest! Which colour are you looking for?", at: ago(9 * 60) },
        { id: "m3", from: "lead", text: "Grey or dark blue. Can I see it in person?", at: ago(8 * 60) },
      ],
    },
    {
      id: "l3", name: "Lim Wei Jie", phone: "+60 16-888 1200",
      adName: "Akemi Mattress · October Fair", campaign: "AKEMI OCT", pageName: "Dream Crafter Design",
      status: "appointment", createdAt: at(-2, 11, 0), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: King size, back pain.", at: at(-2, 11, 0) },
        { id: "m2", from: "me", text: "We have a few firm models that help with back support. Would you like to try them?", at: at(-2, 11, 30) },
        { id: "m3", from: "lead", text: "Yes, Saturday afternoon works.", at: at(-2, 12, 10) },
        { id: "m4", from: "system", kind: "booking", text: "Appointment booked.", at: at(-2, 12, 15) },
        { id: "m5", from: "lead", text: "Sorry, something came up. Can we change to Sunday 11am?", at: ago(20) },
      ],
    },
    {
      id: "l6", name: "Siti Hajar", phone: "+60 13-456 7788",
      adName: "Bedframe Bundle · Reels", campaign: "BEDFRAME BUNDLE", pageName: "Dream Crafter Design",
      status: "new", createdAt: ago(30 * 60), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: single bed frame for a child room.", at: ago(30 * 60) },
        { id: "m2", from: "lead", text: "Hi, do you have a white single bed frame? Does it come with a mattress?", at: ago(26 * 60) },
      ],
    },
    {
      // Won last month; wrote again, so the lead came back to Follow up by itself.
      id: "l7", name: "Chong Li Na", phone: "+60 12-909 1188",
      adName: "Akemi Mattress · September", campaign: "AKEMI SEP", pageName: "Dream Crafter Design",
      status: "follow_up", previous: { status: "won" }, createdAt: at(-20, 14, 0), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: Queen mattress.", at: at(-20, 14, 0) },
        { id: "m2", from: "me", text: "Thank you for your purchase, Ms Chong! Enjoy your new mattress.", at: at(-15, 11, 0) },
        { id: "m3", from: "lead", text: "Hi! Do you have pillows that match the Akemi mattress?", at: ago(40) },
      ],
    },
    {
      id: "l8", name: "Rajesh Kumar", phone: "+60 12-771 4455",
      adName: "Sofa Clearance · Carousel", campaign: "SOFA CLEARANCE", pageName: "The Conts Property Management",
      status: "appointment", createdAt: at(-3, 10, 0), unread: 0,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: recliner sofa.", at: at(-3, 10, 0) },
        { id: "m2", from: "me", text: "Hi Mr Rajesh, we have 3 recliner models on display. When can you come?", at: at(-3, 11, 0) },
        { id: "m3", from: "lead", text: "Tomorrow evening after work.", at: at(-3, 12, 0) },
        { id: "m4", from: "system", kind: "booking", text: "Appointment booked.", at: at(-3, 12, 5) },
      ],
    },
    {
      id: "l9", name: "Goh Siew Ling", phone: "+60 16-330 9087",
      adName: "Akemi Mattress · October Fair", campaign: "AKEMI OCT", pageName: "Dream Crafter Design",
      status: "appointment", createdAt: at(-1, 13, 0), unread: 0,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: 2 single mattresses for kids.", at: at(-1, 13, 0) },
        { id: "m2", from: "me", text: "Hi Ms Goh, our Penang showroom has the kids range. Saturday morning?", at: at(-1, 14, 0) },
        { id: "m3", from: "lead", text: "Yes please.", at: at(-1, 14, 30) },
        { id: "m4", from: "system", kind: "booking", text: "Appointment booked.", at: at(-1, 14, 35) },
      ],
    },
    {
      id: "l4", name: "Nurul Aina", phone: "+60 19-765 4321",
      adName: "Bedframe Bundle · Reels", campaign: "BEDFRAME BUNDLE", pageName: "Dream Crafter Design",
      status: "follow_up", createdAt: ago(36 * 60), unread: 2,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: bed frame + mattress bundle.", at: ago(36 * 60) },
        { id: "m2", from: "me", text: "Hi Nurul, the bundle comes in Queen and King. Which one suits you?", at: ago(33 * 60) },
        { id: "m3", from: "lead", text: "Queen. Need to check with my husband first.", at: ago(31 * 60) },
        { id: "m4", from: "lead", text: "Is there installment?", at: ago(30 * 60) },
      ],
    },
    {
      id: "l5", name: "Wong Kah Hou", phone: "+60 11-1010 2020",
      adName: "Sofa Clearance · Carousel", campaign: "SOFA CLEARANCE", pageName: "The Conts Property Management",
      status: "lost", lost: { reason: "bought_elsewhere" }, createdAt: at(-6, 13, 0), unread: 0,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: L-shape sofa.", at: at(-6, 13, 0) },
        { id: "m2", from: "me", text: "Hi Mr Wong, the L-shape is RM 4,599 during clearance.", at: at(-6, 14, 0) },
        { id: "m3", from: "lead", text: "Bought elsewhere already, thanks.", at: at(-5, 10, 0) },
      ],
    },
  ];

  return {
    leads: [...leads.map(l => ({ ...l, assignedTo: "a1", teamId: "lkv" })), ...teamLeads()],
    appointments: [
      ...teamAppointments(),
      { id: "a1", leadId: "l3", showroomId: "kl", start: at(2, 15), minutes: 60, state: "booked" },
      // Later today when the demo opens before 7pm, else tomorrow evening.
      { id: "a2", leadId: "l8", showroomId: "kl", start: new Date().getHours() < 18 ? at(0, 19) : at(1, 19), minutes: 60, state: "booked" },
      { id: "a3", leadId: "l9", showroomId: "pg", start: at(3, 10), minutes: 60, state: "booked" },
      // Past ones, for the show-up rate: Chong came (and bought); Wong never turned up.
      { id: "a4", leadId: "l7", showroomId: "kl", start: at(-18, 11), minutes: 60, state: "attended" },
      { id: "a5", leadId: "l5", showroomId: "kl", start: at(-5, 15), minutes: 60, state: "booked" },
    ],
    // Other bookings at the showroom and the salesperson's own plans; this salesperson's
    // appointments are added from the appointment list, so a cancelled one frees its slot.
    showroomBusy: {
      kl: [
        { start: at(1, 11), minutes: 60, label: "Showroom booked" },
        { start: at(1, 14), minutes: 60, label: "Showroom booked" },
      ],
      pg: [{ start: at(1, 12), minutes: 60, label: "Showroom booked" }],
    },
    myBusy: [
      { start: at(1, 16), minutes: 60, label: "Your calendar: team meeting" },
    ],
  };
}

/* ── The team behind the CRM (demo) ─────────────────────────────────────── */

/**
 * Boss → HOD Peter → (Senior TL vacant) → three TLs → a TA each → RS.
 * Nobody has more than 3 direct downlines. `a1` is "you" — the RS whose
 * Inbox the prototype has always shown — so the demo's own leads are theirs.
 */
export function crmTeamDemo(you = "You"): { members: CrmMember[]; config: CrmAssignConfig } {
  return {
    members: [
      { id: "boss", name: "Alex Wong", role: "boss" },
      { id: "hod", name: "Peter", role: "hod", uplineId: "boss" },
      { id: "lkv", name: "Kelvin Lee", role: "tl", uplineId: "hod", teamName: "Klang Valley" },
      { id: "a2", name: "Farah Aziz", role: "ta", uplineId: "lkv" },
      { id: "a1", name: you, role: "rs", uplineId: "a2", fullTime: true },
      { id: "a3", name: "Daniel Ong", role: "rs", uplineId: "a2" },
      { id: "a4", name: "Amir Hamzah", role: "rs", uplineId: "a2", fullTime: true },
      { id: "lnt", name: "Priya Nair", role: "tl", uplineId: "hod", teamName: "Northern" },
      { id: "b1", name: "Hafiz Rahman", role: "ta", uplineId: "lnt" },
      { id: "b2", name: "Joanne Teh", role: "rs", uplineId: "b1", fullTime: true },
      { id: "b3", name: "Lina Ho", role: "rs", uplineId: "b1" },
      { id: "lst", name: "Ryan Goh", role: "tl", uplineId: "hod", teamName: "Southern" },
      { id: "c1", name: "Nadia Salleh", role: "ta", uplineId: "lst" },
      { id: "c2", name: "Vincent Lim", role: "rs", uplineId: "c1", fullTime: true },
    ],
    config: {
      rules: [
        { adId: "SOFA CLEARANCE", adName: "Sofa Clearance · Carousel", tlIds: ["lkv", "lnt"] },
        { adId: "AKEMI OCT", adName: "Akemi Mattress · October Fair", tlIds: ["lkv", "lnt", "lst"], shares: { lkv: 50, lnt: 25, lst: 25 } },
      ],
      teams: {
        // Klang Valley: every weekday by %, weekends to full time. Northern: by hand Mon–Thu.
        // Southern: Mon–Wed by % (Thursday by hand), weekends by % too.
        lkv: { percentDays: [1, 2, 3, 4], weekendFullTime: true, ratios: { lkv: 0, a2: 15, a1: 40, a3: 15, a4: 30 } },
        lnt: { percentDays: [], weekendFullTime: true, ratios: { lnt: 0, b1: 25, b2: 50, b3: 25 } },
        lst: { percentDays: [1, 2, 3], weekendFullTime: false, ratios: { lst: 0, c1: 35, c2: 65 } },
      },
    },
  };
}

/**
 * The other salespeople's leads: enough of each to give the Team tab real
 * numbers — a quick replier, a slow one, one who never answered.
 */
function teamLeads(): CrmLead[] {
  const real = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  // Whose team each person is in; "lnt:" alone = waiting in that TL's "To assign" list; "" = no team yet.
  const team: Record<string, string> = { lkv: "lkv", lnt: "lnt", lst: "lst", a2: "lkv", a3: "lkv", a4: "lkv", b1: "lnt", b2: "lnt", b3: "lnt", c1: "lst", c2: "lst" };
  const lead = (id: string, name: string, phone: string, to: string, adName: string, status: CrmLead["status"],
    askedMinutesAgo: number, replyAfter: number | null, question: string, answer = "Hi! Thanks for your message — when would you like to visit the showroom?"): CrmLead => ({
    id, name, phone, adName, status,
    ...(to === "" ? {} : to.endsWith(":") ? { teamId: to.slice(0, -1) } : { assignedTo: to, teamId: team[to] }),
    // The same ad id as the main leads use, so one ad is one row on Assignment.
    campaign: ({ "Akemi Mattress · October Fair": "AKEMI OCT", "Akemi Mattress · September": "AKEMI SEP", "Sofa Clearance · Carousel": "SOFA CLEARANCE", "Bedframe Bundle · Reels": "BEDFRAME BUNDLE" } as Record<string, string>)[adName] ?? adName.split(" · ")[0].toUpperCase(),
    pageName: adName.startsWith("Sofa") ? "The Conts Property Management" : "Dream Crafter Design",
    createdAt: real(askedMinutesAgo), unread: replyAfter === null ? 1 : 0,
    messages: [
      { id: `${id}m1`, from: "lead", text: question, at: real(askedMinutesAgo) },
      ...(replyAfter === null ? [] : [{ id: `${id}m2`, from: "me" as const, text: answer, at: real(askedMinutesAgo - replyAfter) }]),
    ],
  });
  const D = 24 * 60;
  return [
    lead("t1", "Aisyah Kamal", "+60 12-410 2231", "a2", "Sofa Clearance · Carousel", "appointment", 3 * D, 12, "Is the grey 3-seater still in stock?"),
    lead("t2", "Marcus Yeo", "+60 16-220 8812", "a2", "Akemi Mattress · October Fair", "won", 6 * D, 25, "Price for the Akemi King?"),
    lead("t3", "Zul Hakim", "+60 19-339 0021", "a2", "Bedframe Bundle · Reels", "follow_up", 2 * D, 50, "Can deliver to Shah Alam?"),
    lead("t4", "Cheryl Lau", "+60 12-778 4410", "a3", "Akemi Mattress · October Fair", "follow_up", 4 * D, 30 * 60, "Do you have a firmer one?"),
    lead("t5", "Rosli Ismail", "+60 13-552 6070", "a3", "Bedframe Bundle · Reels", "new", 2 * D, null, "Ada warna putih?"),
    lead("t6", "Nicole Chan", "+60 17-801 1123", "b1", "Sofa Clearance · Carousel", "appointment", 2 * D, 8, "Penang showroom open on Sunday?"),
    lead("t7", "Ganesh Pillai", "+60 12-650 7781", "b1", "Akemi Mattress · October Fair", "lost", 8 * D, 40, "Any installment plan?"),
    lead("t8", "Yvonne Khoo", "+60 16-404 3398", "b2", "Akemi Mattress · October Fair", "won", 9 * D, 15, "I'd like to try the Queen this weekend."),
    lead("t9", "Hakimi Yusof", "+60 11-2345 6677", "b2", "Bedframe Bundle · Reels", "follow_up", 3 * 60, null, "Bundle ni ada lagi?"),
    lead("t10", "Kavitha Raj", "+60 12-818 3302", "b3", "Akemi Mattress · October Fair", "follow_up", 2 * D, 35, "Do you deliver to Ipoh?"),
    lead("t11", "Faizal Omar", "+60 19-277 5510", "c2", "Akemi Mattress · October Fair", "appointment", 3 * D, 20, "Johor showroom got the King size?"),
    lead("t12", "Bernard Sim", "+60 16-990 4421", "a4", "Bedframe Bundle · Reels", "follow_up", D + 120, 90, "How long is delivery?"),
    // Northern deals Monday–Thursday by hand: these wait for Priya to assign.
    lead("t13", "Mei Xin", "+60 11-5566 7788", "lnt:", "Akemi Mattress · October Fair", "new", 50, null, "Hi, what sizes for Akemi?"),
    lead("t14", "Syafiq Rahim", "+60 13-221 9090", "lnt:", "Bedframe Bundle · Reels", "new", 20, null, "Boleh tengok katil di showroom?"),
    lead("t17", "Datin Rosnah", "+60 12-200 8890", "lkv", "Akemi Mattress · October Fair", "follow_up", 5 * 60, 45, "I want 3 mattresses for my new house, any package?"),
    // No team took these (in the real flow: no ad rule and every team at 0%) — they wait for the Boss or HOD.
    lead("t15", "Grace Tan", "+60 12-303 4567", "", "Dining Set · Stories", "new", 35, null, "Is the 6-seater dining set still on promo?"),
    lead("t16", "Azlan Mokhtar", "+60 17-660 2219", "", "Dining Set · Stories", "new", 12, null, "Meja makan ni ada warna lain?"),
  ].map(l => (l.status === "lost" ? { ...l, lost: { reason: "too_expensive" as const } } : l));
}

function teamAppointments(): CrmAppointment[] {
  const at = (dayOffset: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  return [
    { id: "ta1", leadId: "t1", showroomId: "kl", start: at(1, 11), minutes: 60, state: "booked" },
    { id: "ta2", leadId: "t2", showroomId: "kl", start: at(-4, 15), minutes: 60, state: "attended" },
    { id: "ta3", leadId: "t6", showroomId: "pg", start: at(2, 14), minutes: 60, state: "booked" },
    { id: "ta4", leadId: "t7", showroomId: "pg", start: at(-6, 11), minutes: 60, state: "booked" },
    { id: "ta5", leadId: "t8", showroomId: "pg", start: at(-7, 16), minutes: 60, state: "attended" },
    { id: "ta6", leadId: "t11", showroomId: "kl", start: at(2, 11), minutes: 60, state: "booked" },
  ];
}
