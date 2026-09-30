import { describe, expect, it } from "vitest";
import {
  appointmentRate, appointmentSlots, relativeWhen, showUpRate, upcomingByDay, applyAutoFollowUp, cancelAppointment, markAttended, previousLabel, receiveCustomerMessage, rescheduleAppointment, statusAfterCancel, daySlots, isClosedStatus, statusAfterReply, lostReasonComplete, lostReasonLabel, openMinutesBetween, replyUrgency, setLeadStatus, slotClash, sortByUrgency, waitingLabel,
  type CrmAppointment, type CrmLead, type CrmMessage,
} from "./crm";

const lead = (id: string, status: CrmLead["status"] = "new"): CrmLead => ({
  id, name: id, phone: "", adName: "", campaign: "", status,
  createdAt: "2026-09-30T02:00:00.000Z", unread: 0, messages: [],
});
const appt = (leadId: string, start = "2026-10-01T04:00:00.000Z"): CrmAppointment => ({
  id: `${leadId}-${start}`, leadId, showroomId: "kl", start, minutes: 60, state: "booked",
});

describe("appointmentRate", () => {
  it("is booked leads over all leads", () => {
    expect(appointmentRate([lead("a"), lead("b"), lead("c"), lead("d")], [appt("a")])).toEqual({ leads: 4, booked: 1, rate: 0.25 });
  });

  it("counts a lead once however many times it was booked", () => {
    const r = appointmentRate([lead("a"), lead("b")], [appt("a"), appt("a", "2026-10-02T04:00:00.000Z")]);
    expect(r.booked).toBe(1);
    expect(r.rate).toBe(0.5);
  });

  it("still counts a lead that went on to Won or Lost", () => {
    expect(appointmentRate([lead("a", "won"), lead("b", "lost")], [appt("a"), appt("b")]).rate).toBe(1);
  });

  it("ignores appointments of leads outside the list, and has no rate without leads", () => {
    expect(appointmentRate([lead("a")], [appt("zzz")]).booked).toBe(0);
    expect(appointmentRate([], []).rate).toBeNull();
  });
});

describe("slotClash", () => {
  const busy = [{ start: "2026-10-01T04:00:00.000Z", minutes: 60, label: "Booked" }];

  it("finds an overlapping booking", () => {
    expect(slotClash("2026-10-01T04:30:00.000Z", 60, busy)?.label).toBe("Booked");
  });

  it("lets back-to-back slots through", () => {
    expect(slotClash("2026-10-01T05:00:00.000Z", 60, busy)).toBeNull();
    expect(slotClash("2026-10-01T03:00:00.000Z", 60, busy)).toBeNull();
  });
});

describe("daySlots", () => {
  it("offers hourly slots that end by closing time", () => {
    const slots = daySlots(new Date(2026, 9, 1), 10, 13, 60);
    expect(slots.map(s => new Date(s).getHours())).toEqual([10, 11, 12]);
  });
});

describe("reply urgency", () => {
  // Local times: opening hours are 8am–8pm wherever the phone is.
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
  const now = at(2, 12); // Fri 2 Oct, noon
  const msg = (from: CrmMessage["from"], when: Date): CrmMessage => ({ id: from + when.getTime(), from, text: "", at: when.toISOString() });
  const withMessages = (status: CrmLead["status"], ...messages: CrmMessage[]): CrmLead => ({ ...lead("x", status), messages });

  it("counts opening hours only", () => {
    expect(openMinutesBetween(at(2, 9), at(2, 12))).toBe(180);
    expect(openMinutesBetween(at(1, 23), at(2, 9))).toBe(60); // 11pm message: the clock starts at 8am
    expect(openMinutesBetween(at(1, 19), at(2, 9))).toBe(120); // 7–8pm, then 8–9am
    expect(openMinutesBetween(at(1, 8), at(3, 8))).toBe(24 * 60); // two full days = 24 opening hours
    expect(openMinutesBetween(at(2, 12), at(2, 9))).toBe(0);
  });

  it("grades yellow at 3 h, orange at 6 h, red at 24 h", () => {
    expect(replyUrgency(withMessages("new", msg("lead", at(2, 10))), now).level).toBe("none");
    expect(replyUrgency(withMessages("new", msg("lead", at(2, 9))), now).level).toBe("soon");
    expect(replyUrgency(withMessages("new", msg("lead", at(1, 18))), now).level).toBe("urgent"); // 2 h + 4 h
    expect(replyUrgency(withMessages("new", msg("lead", at(1, 12))), now)).toEqual({ level: "urgent", waitingMinutes: 12 * 60 });
    expect(replyUrgency(withMessages("new", msg("lead", at(1, 8))), now)).toEqual({ level: "urgent", waitingMinutes: 16 * 60 }); // yesterday 8am: 12 h + 4 h
    expect(replyUrgency(withMessages("new", msg("lead", at(0, 10))), now)).toEqual({ level: "overdue", waitingMinutes: 26 * 60 }); // 30 Sep 10am: 10 + 12 + 4
  });

  it("does not hold the night against the salesperson", () => {
    // Sent at 10pm, now 9am: one opening hour, not eleven.
    expect(replyUrgency(withMessages("new", msg("lead", at(1, 22))), at(2, 9))).toEqual({ level: "none", waitingMinutes: 60 });
  });

  it("stops the clock once the salesperson replied, and ignores system notes", () => {
    expect(replyUrgency(withMessages("follow_up", msg("lead", at(1, 9)), msg("me", at(1, 10))), now).level).toBe("none");
    expect(replyUrgency(withMessages("new", msg("lead", at(2, 8)), msg("system", at(2, 11))), now).level).toBe("soon");
  });

  it("treats booking the appointment as the answer", () => {
    const booked: CrmMessage = { ...msg("system", at(1, 10)), kind: "booking" };
    expect(replyUrgency(withMessages("appointment", msg("lead", at(1, 9)), booked), now).level).toBe("none");
    expect(replyUrgency(withMessages("appointment", msg("lead", at(1, 9)), booked, msg("lead", at(2, 8))), now).level).toBe("soon");
  });

  it("never rushes a lead that is Won or Lost", () => {
    expect(replyUrgency(withMessages("won", msg("lead", at(0, 8))), now).level).toBe("none");
  });

  it("moves only a New lead to Follow up past 24 opening hours", () => {
    const old = msg("lead", at(0, 10)), recent = msg("lead", at(1, 8));
    const leads = [withMessages("new", old), withMessages("appointment", old), withMessages("new", recent)];
    expect(applyAutoFollowUp(leads, now).map(l => l.status)).toEqual(["follow_up", "appointment", "new"]);
  });

  it("sorts the most urgent and longest waiting first", () => {
    const a = { ...withMessages("new", msg("lead", at(2, 8))), id: "soon" };
    const b = { ...withMessages("new", msg("lead", at(0, 9))), id: "overdue" };
    const c = { ...withMessages("follow_up", msg("me", at(2, 11))), id: "answered" };
    const d = { ...withMessages("new", msg("lead", at(0, 11))), id: "overdue-less" };
    expect(sortByUrgency([a, c, d, b], now).map(l => l.id)).toEqual(["overdue", "overdue-less", "soon", "answered"]);
  });

  it("labels the wait in minutes, then hours", () => {
    expect([waitingLabel(45), waitingLabel(6 * 60), waitingLabel(30 * 60)]).toEqual(["45 min", "6 h", "30 h"]);
  });
});

describe("lost reasons", () => {
  it("records the reason when a lead is marked Lost", () => {
    expect(setLeadStatus(lead("a", "follow_up"), "lost", { reason: "too_expensive" })).toMatchObject({ status: "lost", lost: { reason: "too_expensive" } });
  });

  it("refuses Lost without a reason, and Other without saying what", () => {
    expect(() => setLeadStatus(lead("a"), "lost")).toThrow();
    expect(() => setLeadStatus(lead("a"), "lost", { reason: "other", note: "  " })).toThrow();
    expect(lostReasonComplete(null, "")).toBe(false);
    expect(lostReasonComplete("other", "Moving overseas")).toBe(true);
  });

  it("keeps a note only for Other, trimmed, and shows it as the label", () => {
    const lost = setLeadStatus(lead("a"), "lost", { reason: "other", note: " Moving overseas " }).lost!;
    expect(lost.note).toBe("Moving overseas");
    expect(lostReasonLabel(lost)).toBe("Moving overseas");
    expect(setLeadStatus(lead("a"), "lost", { reason: "no_response", note: "ignored" }).lost?.note).toBeUndefined();
  });

  it("clears the reason when the lead comes back to life", () => {
    const lost = setLeadStatus(lead("a"), "lost", { reason: "not_ready" });
    expect(setLeadStatus(lost, "follow_up")).toMatchObject({ status: "follow_up", lost: undefined });
  });

  it("asks nothing for Won", () => {
    expect(setLeadStatus(lead("a"), "won")).toMatchObject({ status: "won", lost: undefined });
  });
});

describe("automatic status", () => {
  it("moves a New lead to Follow up when the salesperson replies, and leaves the rest", () => {
    expect(statusAfterReply("new")).toBe("follow_up");
    expect(statusAfterReply("follow_up")).toBe("follow_up");
    expect(statusAfterReply("appointment")).toBe("appointment");
    expect(statusAfterReply("won")).toBe("won");
    expect(statusAfterReply("lost")).toBe("lost");
  });

  it("knows which statuses are closed", () => {
    expect(["new", "follow_up", "appointment", "won", "lost"].map(s => isClosedStatus(s as CrmLead["status"]))).toEqual([false, false, false, true, true]);
  });
});

describe("appointments", () => {
  const booked = appt("a");

  it("moves an appointment, keeping or changing the showroom", () => {
    expect(rescheduleAppointment(booked, "2026-10-02T04:00:00.000Z")).toMatchObject({ start: "2026-10-02T04:00:00.000Z", showroomId: "kl" });
    expect(rescheduleAppointment(booked, "2026-10-02T04:00:00.000Z", "pg").showroomId).toBe("pg");
  });

  it("cancels, or marks attended, only a booked appointment", () => {
    expect(cancelAppointment(booked).state).toBe("cancelled");
    expect(markAttended(booked).state).toBe("attended");
    expect(() => markAttended(cancelAppointment(booked))).toThrow();
    expect(() => rescheduleAppointment(markAttended(booked), "2026-10-02T04:00:00.000Z")).toThrow();
  });

  it("sends the lead back to Follow up when its appointment is cancelled", () => {
    const l = lead("a", "appointment");
    expect(statusAfterCancel(l, [cancelAppointment(booked)])).toBe("follow_up");
    expect(statusAfterCancel(l, [cancelAppointment(booked), appt("a", "2026-10-05T04:00:00.000Z")])).toBe("appointment");
    expect(statusAfterCancel(lead("a", "won"), [])).toBe("won");
  });

  it("frees a cancelled slot, and leaves out the one being moved", () => {
    const other = appt("b", "2026-10-02T04:00:00.000Z");
    expect(appointmentSlots([cancelAppointment(booked), other], "x").map(s => s.start)).toEqual([other.start]);
    expect(appointmentSlots([booked, other], "x", booked.id).map(s => s.start)).toEqual([other.start]);
  });

  it("stops counting a cancelled appointment in the appointment rate", () => {
    expect(appointmentRate([lead("a"), lead("b")], [cancelAppointment(booked)]).booked).toBe(0);
  });
});

describe("a closed lead that writes again", () => {
  const hello: CrmMessage = { id: "h", from: "lead", text: "Hi, still available?", at: "2026-10-01T04:00:00.000Z" };

  it("comes back to Follow up by itself, remembering it was Lost and why", () => {
    const lost = setLeadStatus(lead("a", "follow_up"), "lost", { reason: "too_expensive" });
    const back = receiveCustomerMessage(lost, hello);
    expect(back).toMatchObject({ status: "follow_up", lost: undefined, previous: { status: "lost", lost: { reason: "too_expensive" } }, unread: 1 });
    expect(previousLabel(back.previous!)).toBe("was Lost · Too expensive");
  });

  it("remembers Won too", () => {
    const back = receiveCustomerMessage(lead("a", "won"), hello);
    expect([back.status, previousLabel(back.previous!)]).toEqual(["follow_up", "was Won"]);
  });

  it("leaves an open lead's status alone", () => {
    const open = receiveCustomerMessage(lead("a", "appointment"), hello);
    expect([open.status, open.previous, open.messages.length]).toEqual(["appointment", undefined, 1]);
  });

  it("forgets the old status once the salesperson moves the lead on", () => {
    const back = receiveCustomerMessage(lead("a", "won"), hello);
    expect(setLeadStatus(back, "appointment").previous).toBeUndefined();
    expect(setLeadStatus(back, "follow_up").previous).toEqual({ status: "won", lost: undefined });
  });
});

describe("daySlots defaults", () => {
  it("offers 8am to 7pm starts, matching opening hours", () => {
    const hours = daySlots(new Date(2026, 9, 1)).map(s => new Date(s).getHours());
    expect([hours[0], hours[hours.length - 1], hours.length]).toEqual([8, 19, 12]);
  });
});

describe("upcoming appointments", () => {
  const now = new Date(2026, 8, 30, 10, 0); // Wed 30 Sep, 10am
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString();

  it("says how soon", () => {
    expect(relativeWhen(at(30, 10, 40), now)).toBe("in 40 min");
    expect(relativeWhen(at(30, 15), now)).toBe("in 5 h");
    expect(relativeWhen(at(31, 9), now)).toBe("Tomorrow"); // 1 Oct
    expect(relativeWhen(new Date(2026, 9, 3, 11).toISOString(), now)).toBe("in 3 days");
    expect(relativeWhen(at(30, 9), now)).toBe("Now");
  });

  it("groups booked future appointments by day, soonest first", () => {
    const list: CrmAppointment[] = [
      { ...appt("b", new Date(2026, 9, 2, 15).toISOString()) },
      { ...appt("a", new Date(2026, 9, 2, 11).toISOString()) },
      { ...appt("c", at(30, 16)) },
      { ...appt("past", at(30, 8)) },
      { ...cancelAppointment(appt("gone", at(30, 17))) },
    ];
    const groups = upcomingByDay(list, now);
    expect(groups.map(g => [g.day, g.items.map(i => i.leadId)])).toEqual([
      ["2026-09-30", ["c"]],
      ["2026-10-02", ["a", "b"]],
    ]);
  });
});

describe("show-up rate", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");
  const past = "2026-09-29T04:00:00.000Z", future = "2026-10-05T04:00:00.000Z";

  it("is showed up over appointments that were due", () => {
    const list = [markAttended(appt("a", past)), markAttended(appt("b", past)), appt("c", past), appt("d", past)];
    expect(showUpRate(list, now)).toEqual({ due: 4, showed: 2, rate: 0.5 });
  });

  it("leaves out cancelled and future appointments", () => {
    const list = [markAttended(appt("a", past)), cancelAppointment(appt("b", past)), appt("c", future)];
    expect(showUpRate(list, now)).toEqual({ due: 1, showed: 1, rate: 1 });
  });

  it("counts a customer marked as showed up early, before the slot ends", () => {
    expect(showUpRate([markAttended(appt("a", future))], now)).toEqual({ due: 1, showed: 1, rate: 1 });
  });

  it("has no rate before anything was due", () => {
    expect(showUpRate([appt("a", future)], now).rate).toBeNull();
  });
});
