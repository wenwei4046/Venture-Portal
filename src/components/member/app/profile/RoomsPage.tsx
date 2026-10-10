"use client";

import { Select } from "@/components/hrv/select";
import { hm, type Booking } from "@/lib/rooms/model";
import Sheet from "../Sheet";
import { Svg } from "../icons";
import {
  ROOM_TONE, TIMES, blockAt, bookingFacts, clampOf, dayBookings, dayChips, deptOptions, paxNote, sheetDay, shortRoom, slotOfPress, suggestions, toneOf,
  totalOf, whoLine, type MemberRoomsData, type RoomsForm, type RoomsMode,
} from "./rooms-model";
import r from "./rooms.module.css";

/** The handoff's back chevron (18px, stroke 2) — its pages' own. */
const BACK = "M15 6l-6 6 6 6";
const MODES: ReadonlyArray<[RoomsMode, string]> = [["cards", "By room"], ["timeline", "Timeline"]];
const HOURS = Array.from({ length: 12 }, (_, i) => hm((8 + i) * 60));

export interface RoomsPageProps {
  data: MemberRoomsData | null;
  /** Said instead of the schedule when it could not be read. */
  message: string | null;
  today: string;
  day: string;
  mode: RoomsMode;
  /** The page's Create box is theirs: "+ Book", a free room's "tap to book" and the timeline's empty slots. */
  canBook: boolean;
  onBack: () => void;
  onMode: (mode: RoomsMode) => void;
  onDay: (day: string) => void;
  onNew: (room?: string, from?: number) => void;
  onOpen: (id: string) => void;
}

/**
 * Meeting rooms (README 18.4, app-08 / app-09): the seven days from today,
 * each room's meetings as a card or side by side on a timeline. A meeting
 * opens its sheet; an empty slot, a free room or "+ Book" the book sheet.
 */
export default function RoomsPage({ data, message, today, day, mode, canBook, onBack, onMode, onDay, onNew, onOpen }: RoomsPageProps) {
  const rooms = data?.range.rooms ?? [];
  const bookings = data?.range.bookings ?? [];
  const cols = { gridTemplateColumns: `38px repeat(${Math.max(1, rooms.length)}, minmax(0,1fr))` };
  return (
    <div className={r.page}>
      <button className={r.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Profile</button>
      <div className={r.headRow}>
        <h1 className={r.title}>Meeting rooms</h1>
        {/* With no room yet there is nothing to book: the portal's "+ Book a room" greys out too. */}
        {canBook && <button className={r.book} disabled={!!data && rooms.length === 0} onClick={() => onNew()}>+ Book</button>}
      </div>
      <div className={r.modes} role="tablist" aria-label="Show">
        {MODES.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} className={`${r.mode} ${mode === id ? r.modeOn : ""}`} onClick={() => onMode(id)}>{label}</button>
        ))}
      </div>
      <div className={r.days}>
        {dayChips(today, day).map(d => (
          <button key={d.day} className={`${r.day} ${d.on ? r.dayOn : ""}`} aria-pressed={d.on} onClick={() => onDay(d.day)}>
            <span className={r.dayWd}>{d.wd}</span><span className={r.dayN}>{d.n}</span>
          </button>
        ))}
      </div>
      {!data ? (
        <p className={r.empty} role={message ? "alert" : "status"}>{message ?? "Loading the rooms…"}</p>
      ) : !rooms.length ? (
        <p className={r.empty}>No meeting rooms yet.</p>
      ) : mode === "cards" ? (
        rooms.map(room => {
          const items = dayBookings(bookings, room.id, day);
          return (
            <section key={room.id} className={r.card} aria-label={room.name}>
              <div className={r.cardHead}><span className={r.cardName}>{room.name}</span><span className={r.cardMeta}>{room.seats} seats</span></div>
              {items.map(b => (
                <button key={b.id} className={r.item} onClick={() => onOpen(b.id)}>
                  <span className={r.itemTime}>{hm(b.from)}–{hm(b.to)}</span>
                  <span className={r.itemText} style={{ borderLeftColor: ROOM_TONE[toneOf(b)].bar }}>
                    <span className={r.itemTitle}>{b.title}</span>
                    <span className={r.itemWho}>{whoLine(b)}</span>
                  </span>
                </button>
              ))}
              {!items.length && (canBook
                ? <button className={r.free} onClick={() => onNew(room.id)}>Free all day · tap to book</button>
                : <div className={r.free}>Free all day</div>)}
            </section>
          );
        })
      ) : (
        <>
          <div className={r.tl}>
            <div className={r.tlHead} style={cols}><span />{rooms.map(room => <span key={room.id} className={r.tlRoom}>{shortRoom(room.name)}</span>)}</div>
            <div className={r.tlBody} style={cols}>
              <div className={r.tlHours}>{HOURS.map(x => <span key={x} className={r.tlHour}>{x}</span>)}</div>
              {rooms.map(room => (
                <div key={room.id} className={`${r.tlCol} ${canBook ? r.tlColBook : ""}`} aria-label={room.name}
                  onClick={canBook ? e => { const box = e.currentTarget.getBoundingClientRect(); onNew(room.id, slotOfPress(e.clientY - box.top, box.height)); } : undefined}>
                  {dayBookings(bookings, room.id, day).map(b => {
                    const at = blockAt(b.from, b.to);
                    const tone = ROOM_TONE[toneOf(b)];
                    return (
                      <div key={b.id} role="button" tabIndex={0} className={r.block} aria-label={`${b.title}, ${hm(b.from)}–${hm(b.to)}`}
                        style={{ top: at.top, height: at.height, background: tone.tint, borderLeftColor: tone.bar }}
                        onClick={e => { e.stopPropagation(); onOpen(b.id); }}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpen(b.id); } }}>
                        <div className={r.blockTitle} style={{ WebkitLineClamp: clampOf(b.from, b.to) }}>{b.title}</div>
                        <div className={r.blockTime}>{hm(b.from)}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {canBook && <div className={r.hint}>Tap an empty slot to book it.</div>}
        </>
      )}
    </div>
  );
}

/** The book sheet (app-10): title, department, room, from / to, who is attending and the headcount. */
export function RoomBookSheet({ open, day, form, data, error, busy, readOnly, onChange, onFrom, onBook, onClose }: {
  open: boolean;
  day: string;
  form: RoomsForm;
  data: MemberRoomsData | null;
  error: string;
  busy: boolean;
  /** The Principal viewing somebody: everything shows, nothing is sent. */
  readOnly: boolean;
  onChange: (patch: Partial<RoomsForm>) => void;
  onFrom: (from: string) => void;
  onBook: () => void;
  onClose: () => void;
}) {
  const people = data?.people ?? null;
  const depts = people ? deptOptions(people) : [];
  const rooms = data?.range.rooms ?? [];
  const total = totalOf(form);
  const nameOf = (id: string) => people?.people.find(p => p.id === id)?.name ?? (people?.me?.staffId === id ? people.me.name : "—");
  const sugg = people ? suggestions(form, people) : [];
  return (
    <Sheet open={open} onClose={onClose} z={21} dim="e" maxHeight="88%" scroll className={r.sheet} label="Book a room">
      <span className={r.grab} />
      <div className={r.sheetTitle}>Book a room · {sheetDay(day)}</div>
      <label className={r.field}>
        <span className={r.label}>Meeting title</span>
        <input className={r.input} value={form.title} onChange={e => onChange({ title: e.target.value })} placeholder="e.g. Customer follow-up" />
      </label>
      <label className={r.field}>
        <span className={r.label}>Department</span>
        <Select bare className={r.select} value={form.dept} onChange={e => onChange({ dept: e.target.value })}>
          <option value="">Choose…</option>
          {depts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </Select>
      </label>
      <label className={r.field}>
        <span className={r.label}>Room</span>
        <Select bare className={r.select} value={form.room} onChange={e => onChange({ room: e.target.value })}>
          <option value="">Choose…</option>
          {rooms.map(o => <option key={o.id} value={o.id}>{o.name} · {o.seats} seats</option>)}
        </Select>
      </label>
      <div className={r.pair}>
        <label className={r.field}>
          <span className={r.label}>From</span>
          <Select bare className={r.select} value={form.from} onChange={e => onFrom(e.target.value)}>
            <option value="">—</option>
            {TIMES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </Select>
        </label>
        <label className={r.field}>
          <span className={r.label}>To</span>
          <Select bare className={r.select} value={form.to} onChange={e => onChange({ to: e.target.value })}>
            <option value="">—</option>
            {TIMES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </Select>
        </label>
      </div>
      <div className={r.att}>
        <span className={r.label}>Attending</span>
        <div className={r.chips}>
          {form.att.map(id => (
            <span key={id} className={r.chip}>{nameOf(id)}
              <button className={r.chipX} aria-label={`Remove ${nameOf(id)}`} onClick={() => onChange({ att: form.att.filter(x => x !== id) })}>×</button>
            </span>
          ))}
        </div>
        <input className={r.input} value={form.q} onChange={e => onChange({ q: e.target.value })} placeholder="Add a colleague — type a name" aria-label="Add a colleague" />
        {!!form.q.trim() && (
          <div className={r.chips}>
            {sugg.map(p => <button key={p.id} className={r.sugg} onClick={() => onChange({ att: [...form.att, p.id], q: "" })}>+ {p.name}</button>)}
          </div>
        )}
      </div>
      <div className={r.pax}>
        <span className={r.paxText}><span className={r.label}>Total pax</span><span className={r.paxNote}>{paxNote(form)}</span></span>
        <span className={r.stepper}>
          <button className={r.step} aria-label="Fewer people" onClick={() => onChange({ pax: Math.max(form.att.length, total - 1) })}>−</button>
          <span className={r.stepVal}>{total}</span>
          <button className={r.step} aria-label="More people" onClick={() => onChange({ pax: total + 1 })}>+</button>
        </span>
      </div>
      {error && <span className={r.err} role="alert">{error}</span>}
      <div className={r.actions}>
        <button className={r.cancel} onClick={onClose}>Cancel</button>
        <button className={r.go} onClick={onBook} disabled={busy || readOnly}>{readOnly ? "Read-only while viewing as" : busy ? "Booking…" : "Book"}</button>
      </div>
    </Sheet>
  );
}

/** A meeting, opened: when, its facts, and Cancel meeting (tap twice) for whoever booked it. */
export function RoomViewSheet({ open, booking, roomName, armed, busy, error, readOnly, onCancel, onClose }: {
  open: boolean;
  booking: Booking | null;
  roomName: string;
  armed: boolean;
  busy: boolean;
  error: string;
  readOnly: boolean;
  onCancel: () => void;
  onClose: () => void;
}) {
  const shown = booking ? bookingFacts(booking, roomName) : null;
  return (
    <Sheet open={open} onClose={onClose} z={21} dim="e" maxHeight="88%" scroll className={r.sheet} label={booking?.title ?? "Meeting"}>
      <span className={r.grab} />
      {booking && shown && (
        <>
          <div className={r.sheetTitle}>{booking.title}</div>
          <div className={r.when}>{shown.when}</div>
          <div className={r.facts}>
            {shown.facts.map(f => <div key={f.l} className={r.fact}><span className={r.factL}>{f.l}</span><span className={r.factV}>{f.v}</span></div>)}
          </div>
          {booking.canChange ? (
            <button className={`${r.cancelMeeting} ${armed ? r.armed : ""}`} onClick={onCancel} disabled={busy || readOnly}>
              {readOnly ? "Read-only while viewing as" : busy ? "Cancelling…" : armed ? "Tap again to cancel" : "Cancel meeting"}
            </button>
          ) : (
            <div className={r.only}>Only {booking.bookedBy} can cancel this meeting.</div>
          )}
          {error && <span className={r.err} role="alert">{error}</span>}
        </>
      )}
    </Sheet>
  );
}
