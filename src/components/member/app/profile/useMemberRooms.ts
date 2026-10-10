"use client";

import { useCallback, useEffect, useState } from "react";
import { shiftDay, type Booking } from "@/lib/rooms/model";
import { ask, settleRead, type RevenueSource } from "../source";
import type { RoomBookSheet, RoomViewSheet, RoomsPageProps } from "./RoomsPage";
import { bookingOfForm, formProblem, newForm, withFromTime, type MemberRoomsData, type RoomsForm, type RoomsMode, type RoomsSheet } from "./rooms-model";

const BLANK: RoomsForm = { title: "", dept: "", room: "", from: "", to: "", att: [], pax: 1, q: "" };

type BookProps = Parameters<typeof RoomBookSheet>[0];
type ViewProps = Parameters<typeof RoomViewSheet>[0];

/**
 * Book a room's state (2026-10-11): the schedule of the seven days from today
 * (one read, kept on the phone like the app's other reads), the day and the
 * mode shown, and the two sheets. A booking or a cancel reads the schedule
 * again; the design preview books into its own fixture instead.
 */
export function useMemberRooms({ active, source, today, fixture, readOnly, canBook }: {
  /** The page is on screen (and the phone's kept answers are loaded). */
  active: boolean;
  source: RevenueSource;
  today: string;
  /** The design preview's schedule (the handoff's sample): read from nowhere. */
  fixture?: MemberRoomsData;
  readOnly: boolean;
  canBook: boolean;
}): { page: Omit<RoomsPageProps, "onBack">; book: BookProps; view: ViewProps } {
  const roomsToday = fixture?.range.today || today;
  const [mode, setMode] = useState<RoomsMode>("cards");
  const [day, setDay] = useState<string | null>(null);
  const [data, setData] = useState<MemberRoomsData | null>(fixture ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [sheet, setSheet] = useState<RoomsSheet>(null);
  const [form, setForm] = useState<RoomsForm>(BLANK);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(0);
  // The meeting opened — kept while its sheet slides away.
  const [viewed, setViewed] = useState<Booking | null>(null);

  const from = roomsToday;
  const to = shiftDay(roomsToday, 6);
  useEffect(() => {
    if (!active || fixture || !source.rooms) return;
    const kept = source.peek?.<MemberRoomsData>(ask.rooms(from, to));
    if (kept) setData(d => d ?? kept);
    let live = true;
    void settleRead(source.rooms(from, to)).then(res => {
      if (!live) return;
      if (res.ok) { setData(res.data); setMessage(null); } else setMessage(res.error);
    });
    return () => { live = false; };
  }, [active, fixture, source, from, to, gen]);

  // Leaving the page puts its sheets away.
  useEffect(() => { if (!active) { setSheet(null); setArmed(false); } }, [active]);

  const theDay = day ?? roomsToday;
  const close = useCallback(() => { setSheet(null); setArmed(false); }, []);
  const onNew = useCallback((room?: string, at?: number) => {
    if (!data) return;
    setForm(newForm(data.people, room ?? null, at ?? null));
    setErr("");
    setSheet({ k: "book" });
  }, [data]);
  const onOpen = useCallback((id: string) => {
    const b = data?.range.bookings.find(x => x.id === id);
    if (!b) return;
    setViewed(b);
    setArmed(false);
    setErr("");
    setSheet({ k: "view", id });
  }, [data]);
  const onChange = useCallback((patch: Partial<RoomsForm>) => { setForm(f => ({ ...f, ...patch })); setErr(""); }, []);
  const onFrom = useCallback((v: string) => { setForm(f => withFromTime(f, v)); setErr(""); }, []);

  const onBook = async () => {
    if (busy || readOnly || !data) return;
    const problem = formProblem(form, theDay, data.range.bookings);
    if (problem) { setErr(problem); return; }
    const input = bookingOfForm(form, theDay);
    if (fixture) {
      setData(d => (d ? { ...d, range: { ...d.range, bookings: [...d.range.bookings, previewBooking(input, d)] } } : d));
      setSheet(null);
      return;
    }
    if (!source.bookRoom) return;
    setBusy(true);
    const res = await settleRead(source.bookRoom(input));
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setSheet(null);
    setGen(g => g + 1);
  };

  const onCancel = async () => {
    if (busy || readOnly || !viewed) return;
    if (!armed) { setArmed(true); return; }
    const id = viewed.id;
    const drop = () => setData(d => (d ? { ...d, range: { ...d.range, bookings: d.range.bookings.filter(b => b.id !== id) } } : d));
    if (fixture) { drop(); close(); return; }
    if (!source.cancelBooking) return;
    setBusy(true);
    const res = await settleRead(source.cancelBooking(id));
    setBusy(false);
    if (!res.ok) { setErr(res.error); setArmed(false); return; }
    drop();
    close();
    setGen(g => g + 1);
  };

  const roomName = (viewed && data?.range.rooms.find(r => r.id === viewed.room)?.name) || viewed?.roomName || "";
  return {
    page: { data, message, today: roomsToday, day: theDay, mode, canBook, onMode: setMode, onDay: setDay, onNew, onOpen },
    book: {
      open: sheet?.k === "book", day: theDay, form, data, error: sheet?.k === "book" ? err : "", busy, readOnly,
      onChange, onFrom, onBook: () => void onBook(), onClose: close,
    },
    view: {
      open: sheet?.k === "view", booking: viewed, roomName, armed, busy, error: sheet?.k === "view" ? err : "", readOnly,
      onCancel: () => void onCancel(), onClose: close,
    },
  };
}

/** The design preview's booking: drawn as the member's own, as the handoff's sample does. */
function previewBooking(input: ReturnType<typeof bookingOfForm>, d: MemberRoomsData): Booking {
  const sub = input.subDepartment ? d.people.subDepartments.find(s => s.id === input.subDepartment) ?? null : null;
  const dept = d.people.departments.find(x => x.id === (sub ? sub.departmentId : input.department)) ?? null;
  const name = (id: string) => d.people.people.find(p => p.id === id)?.name ?? "";
  return {
    id: `BK-R${100 + d.range.bookings.length}`,
    ref: `BK-R${100 + d.range.bookings.length}`,
    room: input.room,
    roomName: d.range.rooms.find(r => r.id === input.room)?.name ?? "",
    day: input.day,
    from: input.from,
    to: input.to,
    title: input.title,
    source: "app",
    departmentId: dept?.id ?? null,
    department: dept?.name ?? null,
    subDepartment: sub?.name ?? null,
    bookedBy: d.people.me?.name ?? d.people.account,
    bookedByStaff: null,
    mine: true,
    canChange: true,
    internal: input.internal.map(id => ({ id, name: name(id), department: null })),
    guests: [],
    pax: input.pax,
    guestCompany: null,
    guestDepartment: null,
    guestCode: null,
    cancelled: false,
    events: [],
  };
}
