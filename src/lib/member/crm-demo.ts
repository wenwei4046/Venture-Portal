/**
 * Demo data for the member CRM prototype. Nobody here is real, and nothing is
 * read from Meta yet — the screen says so.
 */
import { OPENING_HOURS, type CrmAppointment, type CrmBusySlot, type CrmLead, type CrmShowroom } from "./crm";

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
      adName: "Akemi Mattress · October Fair", campaign: "AKEMI OCT",
      status: "new", createdAt: ago(215), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: interested in a Queen mattress, prefers weekend visit.", at: ago(215) },
        { id: "m2", from: "lead", text: "Hi, is the October promotion still available?", at: ago(210) },
      ],
    },
    {
      id: "l2", name: "Ahmad Faizal", phone: "+60 17-222 3344",
      adName: "Sofa Clearance · Carousel", campaign: "SOFA CLEARANCE",
      status: "follow_up", createdAt: ago(10 * 60), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: 3-seater sofa, budget RM 3,000–4,000.", at: ago(10 * 60) },
        { id: "m2", from: "me", text: "Hi Encik Ahmad, thanks for your interest! Which colour are you looking for?", at: ago(9 * 60) },
        { id: "m3", from: "lead", text: "Grey or dark blue. Can I see it in person?", at: ago(8 * 60) },
      ],
    },
    {
      id: "l3", name: "Lim Wei Jie", phone: "+60 16-888 1200",
      adName: "Akemi Mattress · October Fair", campaign: "AKEMI OCT",
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
      adName: "Bedframe Bundle · Reels", campaign: "BEDFRAME BUNDLE",
      status: "new", createdAt: ago(30 * 60), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: single bed frame for a child room.", at: ago(30 * 60) },
        { id: "m2", from: "lead", text: "Hi, do you have a white single bed frame? Does it come with a mattress?", at: ago(26 * 60) },
      ],
    },
    {
      // Won last month; wrote again, so the lead came back to Follow up by itself.
      id: "l7", name: "Chong Li Na", phone: "+60 12-909 1188",
      adName: "Akemi Mattress · September", campaign: "AKEMI SEP",
      status: "follow_up", previous: { status: "won" }, createdAt: at(-20, 14, 0), unread: 1,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: Queen mattress.", at: at(-20, 14, 0) },
        { id: "m2", from: "me", text: "Thank you for your purchase, Ms Chong! Enjoy your new mattress.", at: at(-15, 11, 0) },
        { id: "m3", from: "lead", text: "Hi! Do you have pillows that match the Akemi mattress?", at: ago(40) },
      ],
    },
    {
      id: "l8", name: "Rajesh Kumar", phone: "+60 12-771 4455",
      adName: "Sofa Clearance · Carousel", campaign: "SOFA CLEARANCE",
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
      adName: "Akemi Mattress · October Fair", campaign: "AKEMI OCT",
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
      adName: "Bedframe Bundle · Reels", campaign: "BEDFRAME BUNDLE",
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
      adName: "Sofa Clearance · Carousel", campaign: "SOFA CLEARANCE",
      status: "lost", lost: { reason: "bought_elsewhere" }, createdAt: at(-6, 13, 0), unread: 0,
      messages: [
        { id: "m1", from: "system", text: "Lead form submitted: L-shape sofa.", at: at(-6, 13, 0) },
        { id: "m2", from: "me", text: "Hi Mr Wong, the L-shape is RM 4,599 during clearance.", at: at(-6, 14, 0) },
        { id: "m3", from: "lead", text: "Bought elsewhere already, thanks.", at: at(-5, 10, 0) },
      ],
    },
  ];

  return {
    leads,
    appointments: [
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
