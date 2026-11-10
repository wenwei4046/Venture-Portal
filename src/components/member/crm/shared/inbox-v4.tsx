"use client";
/**
 * The phone Inbox of the CRM redesign v4 (docs/design_handoff_crm_redesign_v4, 2026-11-10), drawn by hand from
 * CRM Optimized Phone.dc.html and placed into the generated screens by tools/crm-design/phone-4a.cjs:
 * - Mine = frame 10b (notes/16): the header (search · Team | Mine · bell · house), the chip row (All ads ▾ · a divider ·
 *   the statuses and labels) or, with search open, the field in its place with Cancel; the rows — every one the same
 *   height: avatar 50, name + label tags, time or the wait, the ad, and a fixed 22 px message line with the unread badge.
 * - Team = frame 2d (notes/17) with frame 2c's filters and its 2c·2 sheet: People / Status buttons, removable tags,
 *   "N chats of M · Clear all", and the cards in the 10b layout with the owner line.
 * Behaviour is the view models' (sales/vm/inbox.ts, panel/vm/inbox.ts); swipes, long press and More are as before.
 *
 * Sizes: the frames' px are final on-screen px; type goes through `fs` (phone4a.tsx — undoes the phone's type step), so on a
 * phone it lands on the frame's px exactly, as every 4a part does. Boxes (heights, paddings, radii) are plain px.
 */
import { useEffect, useRef, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import { Ic } from "./icons4a";
import { typePx } from "./type";
import type { InboxVM as MineVM } from "../sales/vm/inbox";
import type { ShellExtras } from "../sales/vm/header";
import type { InboxVM as TeamVM } from "../panel/vm/inbox";
import type { TeamMineSwap } from "./team-mine";

const fs = (px: number) => typePx(Math.round((px / 0.92) * 100) / 100);
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", padding: 0, margin: 0, boxSizing: "border-box" };
const ROUND: CSSProperties = { ...BTN, flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--crm-line)", background: "var(--crm-page)", color: "var(--crm-ink)" };
const TM: CSSProperties = { ...ROUND, border: 0, background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)" };
const ELLIPSIS: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** The title row: "Inbox" Inter Tight 500 30 and the 40 px round buttons, 8 apart. */
function Head({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px" }}>
      <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontFamily: TIGHT, fontSize: fs(30), fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.2, color: "var(--crm-ink)" }}>Inbox</h1>
      {children}
    </div>
  );
}
const SearchBtn = ({ open }: { open: () => void }) => (
  <button type="button" onClick={open} title="Search" aria-label="Search" style={ROUND}><Ic name="search" size={18} /></button>
);
const SwapBtn = ({ tm }: { tm: TeamMineSwap }) => (
  <button type="button" onClick={tm.swap} title={tm.title} aria-label={tm.title} style={TM}><Ic name={tm.label === "Team" ? "users" : "user-round"} size={18} /></button>
);
const BellBtn = ({ open, dot, label }: { open: () => void; dot: boolean; label: string }) => (
  <button type="button" onClick={open} title="Notifications" aria-label={label} style={{ ...ROUND, position: "relative" }}>
    <Ic name="bell" size={18} />
    {dot && <span style={{ position: "absolute", top: "8px", right: "9px", width: "8px", height: "8px", boxSizing: "content-box", borderRadius: "50%", background: "var(--crm-orange)", border: "2px solid var(--crm-page)" }} />}
  </button>
);

/** The search field in place of the row under the title (same height, so nothing below moves), with Cancel. */
function SearchField({ q, setQ, clear, cancel, h, r }: { q: string; setQ: (e: ChangeEvent<HTMLInputElement>) => void; clear?: () => void; cancel: () => void; h: number; r: number }) {
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", height: `${h}px` }}>
      <label style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", boxSizing: "border-box", borderRadius: `${r}px`, background: "var(--crm-field)", color: "var(--crm-faint)" }}>
        <Ic name="search" size={15} />
        {/* 16 as the search was (globals.css keeps a phone field at 16px, so an iPhone does not zoom). */}
        <input autoFocus value={q} onChange={setQ} placeholder="Search name or message" aria-label="Search chats"
          style={{ flex: 1, minWidth: 0, height: "100%", border: 0, outline: "none", background: "transparent", font: "inherit", fontSize: typePx(16), color: "var(--crm-ink)" }} />
        {!!q && clear && <button type="button" onClick={clear} aria-label="Clear" style={{ ...BTN, flex: "none", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--crm-faint)" }}><Ic name="x" size={14} /></button>}
      </label>
      <button type="button" onClick={cancel} style={{ ...BTN, flex: "none", fontSize: fs(15), fontWeight: 500, color: "var(--crm-rust)" }}>Cancel</button>
    </div>
  );
}

/** A label tag after a name: 20 px, radius 10, sand, a 6 px dot in the label's colour, 11.5 px 500. */
const Tag = ({ t, c }: { t: string; c: string }) => (
  <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "4px", height: "20px", padding: "0 7px", boxSizing: "border-box", borderRadius: "10px", background: "var(--crm-field)", fontSize: fs(11.5), fontWeight: 500, color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>
    <span style={{ flex: "none", width: "6px", height: "6px", borderRadius: "50%", background: c }} />{t}
  </span>
);
/** Line 1's right end: the time (rust while unread), or the wait while the chat waits (icon + "9 h", 13 px 600). */
function TimeOrWait({ w, at, size }: { w: { waitShow: boolean; waitIc: "clock" | "triangle-alert"; waitTxt: string; waitC: string; whenC: string }; at: string; size: number }) {
  return w.waitShow
    ? <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: fs(13), fontWeight: 600, color: w.waitC, whiteSpace: "nowrap" }}><Ic name={w.waitIc} size={12} />{w.waitTxt}</span>
    : <span style={{ flex: "none", fontSize: fs(size), fontWeight: 500, color: w.whenC, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{at}</span>;
}
/** The fixed 22 px message line: a booked visit or a cold chat's lock first, the message (15 px, one line), the badge. */
function MessageLine({ m, extra }: { m: { preview: string; visit: string; cold: boolean; unread: string | number | 0 }; extra?: ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "6px", height: "22px" }}>
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px", fontSize: fs(15), fontWeight: 400, color: "var(--crm-ink-soft)", whiteSpace: "nowrap", overflow: "hidden" }}>
        {!!m.visit && <>
          <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: fs(14), fontWeight: 500, color: "var(--crm-brown)" }}><Ic name="calendar-check" size={13} />{m.visit}</span>
          <span style={{ flex: "none", color: "var(--crm-faint-2)" }}>·</span>
        </>}
        {m.cold && <span style={{ flex: "none", display: "inline-flex", color: "var(--crm-faint)" }}><Ic name="lock" size={13} /></span>}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{m.preview}</span>
      </span>
      {extra}
      {!!m.unread && <span style={{ flex: "none", minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "11px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TIGHT, fontSize: fs(12), fontWeight: 600, background: "var(--crm-rust)", color: "var(--crm-page)" }}>{m.unread}</span>}
    </span>
  );
}
/** The avatar in the customer's tint with the channel's badge (18 px, its colour, a white glyph). */
function Avatar({ size, font, a }: { size: number; font: number; a: { ini: string; avBg: string; avFg: string; chanFg: string; chanIc: "phone" | "message-circle"; chanName: string } }) {
  return (
    <span style={{ flex: "none", position: "relative", width: `${size}px`, height: `${size}px` }}>
      <span style={{ width: `${size}px`, height: `${size}px`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TIGHT, fontSize: fs(font), fontWeight: 500, background: a.avBg, color: a.avFg }}>{a.ini}</span>
      <span title={a.chanName} style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid var(--crm-page)", background: a.chanFg, color: "var(--crm-page)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Ic name={a.chanIc} size={9} sw={2.4} />
      </span>
    </span>
  );
}

// ─── Mine · 10b ───

type MineHead = Pick<MineVM, "searchOpen" | "openSearch" | "cancelSearch" | "q" | "setQ" | "clearQ" | "adLabel" | "openAd" | "chips3b"> & Partial<ShellExtras>;

/** A status chip: 34 px, radius 17, 13 px; on = ink with white words and a light count, off = sand with a faint count. */
function Chip({ c, hot }: { c: { label: string; n: number; on: boolean; pick: () => void }; hot: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  // A chip picked past the row's edge slides into view (the row scrolls; the page does not).
  useEffect(() => { if (c.on) ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [c.on]);
  return (
    <button ref={ref} type="button" onClick={c.pick} aria-pressed={c.on} style={{ ...BTN, flex: "none", height: "34px", padding: "0 12px", borderRadius: "17px", display: "flex", alignItems: "center", gap: "5px", fontSize: fs(13), fontWeight: c.on ? 600 : 500, whiteSpace: "nowrap", background: c.on ? "var(--crm-ink)" : "var(--crm-field)", color: c.on ? "var(--crm-page)" : "var(--crm-ink)" }}>
      {c.label}<span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums", color: c.on ? "var(--crm-on-dark-meta)" : hot ? "var(--crm-oxblood)" : "var(--crm-faint)" }}>{c.n}</span>
    </button>
  );
}

/** 10b · the title row, then the chip row — or the search field in its place. */
export function Phone4aInboxHead({ v }: { v: MineHead }) {
  return (<>
    <Head>
      <SearchBtn open={v.openSearch} />
      {!!v.tb && <>
        {!!v.tm?.on && <SwapBtn tm={v.tm} />}
        <BellBtn open={v.tb.open} dot={!!v.tb.has} label={v.tb.has ? `Notifications · ${v.tb.n} new` : "Notifications"} />
        <button type="button" onClick={v.exitCrm} title="Back to Revenue app" aria-label="Back to Revenue app" style={ROUND}><Ic name="house" size={18} /></button>
      </>}
    </Head>
    {v.searchOpen
      ? <SearchField q={v.q} setQ={v.setQ} clear={v.clearQ} cancel={v.cancelSearch} h={34} r={17} />
      : (
        <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", margin: "0 -20px", padding: "0 20px", overflowX: "auto", scrollbarWidth: "none", userSelect: "none" }}>
          <button type="button" onClick={v.openAd} style={{ ...BTN, flex: "none", maxWidth: "170px", height: "34px", padding: "0 11px", borderRadius: "17px", display: "flex", alignItems: "center", gap: "5px", fontSize: fs(13), fontWeight: 500, border: "1px solid var(--crm-line)", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{v.adLabel}</span><Ic name="chevron-down" size={12} />
          </button>
          <span aria-hidden style={{ flex: "none", width: "1px", margin: "6px 2px", background: "var(--crm-line)" }} />
          {v.chips3b.map(c => <Chip key={c.label} c={c} hot={c.label === "Attention"} />)}
        </div>
      )}
  </>);
}

type MineRow = MineVM["leadsView"][number];
const ACT: CSSProperties = { ...BTN, position: "absolute", top: 0, bottom: 0, width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: typePx(13), fontWeight: 600 };
const ActIc = ({ d, sw = 1.65 }: { d: ReactNode; sw?: number }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>;

/** One row of 10b, its swipe actions behind it (right: Read · Pin; left: Assign · More — as before). */
function MineRowView({ l }: { l: MineRow }) {
  return (
    <div data-inbox-row="1" style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--crm-rule-soft)" }}>
      {l.canRead && <span onClick={l.read} role="button" style={{ ...ACT, left: 0, background: "var(--crm-ink-soft)", color: "var(--crm-page)" }}><ActIc d={<path d="M3 7l9 6 9-6M3 7v10h18V7M3 7l9-4 9 4" />} />{l.readLabel}</span>}
      <span onClick={l.pin} role="button" style={{ ...ACT, left: l.canRead ? "84px" : 0, background: "var(--crm-faint)", color: "var(--crm-page)" }}><ActIc d={<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />} />{l.pinLabel}</span>
      {l.canAssign && <span onClick={l.assign} role="button" style={{ ...ACT, right: "84px", background: "var(--crm-amber)", color: "var(--crm-deep)" }}><ActIc d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>} />Assign</span>}
      <span onClick={l.more} role="button" style={{ ...ACT, right: 0, opacity: l.moreOp, transition: "opacity 120ms", background: "var(--crm-ink)", color: "var(--crm-on-light)" }}><ActIc sw={3} d={<path d="M5 12h.01M12 12h.01M19 12h.01" />} />More</span>
      <div onClick={l.open} onPointerDown={l.down} onPointerMove={l.move} onPointerUp={l.up} onPointerCancel={l.cancel} onContextMenu={l.noMenu}
        style={{ WebkitTouchCallout: "none", position: "relative", display: "flex", alignItems: "center", gap: "14px", padding: "14px 20px", background: "var(--crm-page)", transform: `translateX(${l.tx})`, transition: "transform 220ms cubic-bezier(.2,.8,.2,1)", touchAction: "pan-y", userSelect: "none", cursor: "pointer" }}>
        <Avatar size={50} font={17} a={l} />
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Line 1 is 20 px — the 17 px name, as tall as a label tag — so a tag never changes the row (10b: 95 px a row). */}
          <span style={{ display: "flex", alignItems: "center", gap: "8px", height: "20px" }}>
            <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "7px", overflow: "hidden" }}>
              <strong style={{ flex: "0 1 auto", minWidth: 0, fontSize: fs(17), fontWeight: l.nameW, color: l.nameC, ...ELLIPSIS }}>{l.name}</strong>
              {!!l.ownerTag && <Tag t={l.ownerTag} c={l.ownerC} />}
              {l.tags.map(t => <Tag key={t.t} t={t.t} c={t.c} />)}
            </span>
            <TimeOrWait w={l} at={l.when} size={13} />
          </span>
          <span style={{ height: "16px", lineHeight: "16px", fontSize: fs(13), color: "var(--crm-faint)", ...ELLIPSIS }}>{l.ad}</span>
          <MessageLine m={{ preview: l.preview, visit: l.visit, cold: l.cold, unread: l.unread }} extra={(l.isMuted || l.isPinned) && (
            <span style={{ flex: "none", display: "flex", gap: "6px", color: "var(--crm-muted)" }}>
              {l.isMuted && <span aria-label="Muted" style={{ display: "flex" }}><ActIc d={<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4M3 3l18 18" />} /></span>}
              {l.isPinned && <span aria-label="Pinned" style={{ display: "flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></svg></span>}
            </span>
          )} />
        </span>
      </div>
    </div>
  );
}

/** 10b · the rows, edge to edge, a hairline over each. */
export function Phone4aInboxRows({ v }: { v: { leadsView: MineRow[] } }) {
  return (
    <section style={{ flex: "none", margin: "-4px -20px 0" }}>
      {v.leadsView.map((l, i) => <MineRowView key={i} l={l} />)}
    </section>
  );
}

// ─── Team · 2d with 2c's filters ───

type T2 = TeamVM["t2"];

/** A People / Status button (2c): 44 px, radius 14, its count of picks as a rust badge. No rust ring while something is picked (the owner, 2026-11-10: "红色边框不要"). */
function FilterBtn({ icon, label, n, open }: { icon: ReactNode; label: string; n: number; open: () => void }) {
  return (
    <button type="button" onClick={open} aria-label={n ? `${label} · ${n} picked` : label}
      style={{ ...BTN, flex: 1, minWidth: 0, height: "44px", padding: "0 12px", borderRadius: "14px", display: "flex", alignItems: "center", gap: "8px", background: n ? "var(--crm-sel)" : "var(--crm-field)", border: `1px solid ${n ? "var(--crm-sel)" : "var(--crm-field)"}`, color: "var(--crm-ink)" }}>
      {icon}
      <span style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: fs(14), fontWeight: 600, ...ELLIPSIS }}>{label}</span>
      {!!n && <span style={{ flex: "none", minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TIGHT, fontSize: fs(11), fontWeight: 600, background: "var(--crm-rust)", color: "var(--crm-page)" }}>{n}</span>}
      <span style={{ flex: "none", display: "flex", color: "var(--crm-muted)" }}><Ic name="chevron-down" size={13} /></span>
    </button>
  );
}
const squareDot = (c: string, s = 10, r = 3): CSSProperties => ({ flex: "none", width: `${s}px`, height: `${s}px`, borderRadius: `${r}px`, background: c });

/** The 2c·2 sheet: People (teams, then the people of each team picked) and Status, both multi-select with counts. */
function FilterSheet({ s }: { s: NonNullable<T2["sheet"]> }) {
  const statusRef = useRef<HTMLDivElement>(null);
  // Opened from Status, it is scrolled to that section.
  useEffect(() => { if (s.at === "status") statusRef.current?.scrollIntoView?.({ block: "start" }); }, [s.at]);
  const pill = (on: boolean, h = 38): CSSProperties => ({ ...BTN, flex: "none", height: `${h}px`, padding: h === 38 ? "0 13px" : "0 11px", borderRadius: `${h / 2}px`, display: "flex", alignItems: "center", gap: h === 38 ? "7px" : "6px", fontSize: fs(13), fontWeight: 500, whiteSpace: "nowrap", background: on ? "var(--crm-sel)" : "var(--crm-page)", border: `1px solid ${on ? "var(--crm-rust)" : "var(--crm-line)"}`, color: "var(--crm-ink)" });
  const count = (n: number, c = "var(--crm-faint)") => <span style={{ fontVariantNumeric: "tabular-nums", color: c }}>{n}</span>;
  const tick = (on: boolean) => on && <span style={{ display: "flex", color: "var(--crm-rust)" }}><Ic name="check" size={13} /></span>;
  const head = (t: string, hint: string) => (
    <div style={{ display: "flex", alignItems: "baseline" }}>
      <span style={{ fontSize: fs(11), fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--crm-brown)" }}>{t}</span>
      <span style={{ marginLeft: "auto", fontSize: fs(12), color: "var(--crm-faint)" }}>{hint}</span>
    </div>
  );
  return (
    <div onClick={s.cancel} style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(42,22,12,.4)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div role="dialog" aria-label="Filter chats" onClick={e => e.stopPropagation()}
        style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "88%", boxSizing: "border-box", borderRadius: "26px 26px 0 0", padding: "10px 20px calc(34px + var(--safe-bottom, 0px))", display: "flex", flexDirection: "column", gap: "18px", background: "var(--crm-page)" }}>
        <span style={{ flex: "none", alignSelf: "center", width: "40px", height: "5px", borderRadius: "3px", background: "var(--crm-st-lost)" }} />
        <div style={{ flex: "none", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: TIGHT, fontSize: fs(22), fontWeight: 500, letterSpacing: "-0.01em", color: "var(--crm-ink)" }}>Filter chats</span>
          <button type="button" onClick={s.clear} style={{ ...BTN, marginLeft: "auto", fontSize: fs(14), fontWeight: 500, color: "var(--crm-rust)" }}>Clear all</button>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {head("People", "Pick teams or people")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {s.teams.map(t => (
                <button key={t.key} type="button" aria-pressed={t.on} onClick={t.toggle} style={pill(t.on)}>
                  <span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: t.dot }} />{t.label}{count(t.n)}{tick(t.on && !!t.key)}
                </button>
              ))}
            </div>
            {s.members.map(m => (
              <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px", borderRadius: "14px", background: "var(--crm-hover)" }}>
                <span style={{ fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)" }}>{m.title}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {m.chips.map(c => <button key={c.key} type="button" aria-pressed={c.on} onClick={c.toggle} style={pill(c.on, 34)}>{c.label}{count(c.n)}</button>)}
                </div>
              </div>
            ))}
          </div>
          <div ref={statusRef} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {head("Status", "Pick one or more")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {s.statuses.map(c => (
                <button key={c.key} type="button" aria-pressed={c.on} onClick={c.toggle} style={pill(c.on)}>
                  <span style={squareDot(c.dot, 8, 2)} />{c.label}{count(c.n, c.hot ? "var(--crm-oxblood)" : "var(--crm-faint)")}{tick(c.on)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: "none", display: "flex", gap: "8px", paddingTop: "4px" }}>
          <button type="button" onClick={s.cancel} style={{ ...BTN, flex: 1, height: "50px", borderRadius: "25px", border: "1px solid var(--crm-line)", fontSize: fs(15), fontWeight: 500, color: "var(--crm-ink)" }}>Cancel</button>
          <button type="button" onClick={s.apply} style={{ ...BTN, flex: 1.6, height: "50px", borderRadius: "25px", background: "var(--crm-rust)", fontSize: fs(15), fontWeight: 500, color: "var(--crm-page)" }}>{s.applyLabel}</button>
        </div>
      </div>
    </div>
  );
}

type Card = T2["cards"][number];
/** One Team card (2d): bordered, 15/16 padding, radius 18; inside, the 10b layout with the owner first on line 2 — lines 20 · 15 · 22 px, 5 apart (2d: 98 px a card). */
function TeamCard({ r }: { r: Card }) {
  return (
    <div onClick={r.open} onClickCapture={r.guard} onPointerDown={r.down} onPointerMove={r.move} onPointerUp={r.up} onPointerCancel={r.cancel} onContextMenu={r.noMenu}
      style={{ WebkitTouchCallout: "none", userSelect: "none", flex: "none", display: "flex", gap: "14px", padding: "15px 16px", borderRadius: "18px", background: "var(--crm-page)", border: "1px solid var(--crm-card-line)", cursor: "pointer" }}>
      <Avatar size={44} font={15} a={r} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", height: "20px" }}>
          <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "7px", overflow: "hidden" }}>
            <strong style={{ flex: "0 1 auto", minWidth: 0, fontSize: fs(16), fontWeight: r.nameW, color: r.nameC, ...ELLIPSIS }}>{r.name}</strong>
            {r.tags.map(t => <Tag key={t.t} t={t.t} c={t.c} />)}
          </span>
          <TimeOrWait w={r} at={r.at} size={12.5} />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, height: "15px", fontSize: fs(12.5), color: "var(--crm-muted)", whiteSpace: "nowrap" }}>
          <span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: r.wc }} />
          <span style={{ flex: "0 0 auto", maxWidth: "55%", fontWeight: 500, color: r.toAssign ? "var(--crm-oxblood)" : "var(--crm-ink-soft)", overflow: "hidden", textOverflow: "ellipsis" }}>{r.who}</span>
          {!!r.ad && <><span style={{ flex: "none", color: "var(--crm-faint-2)" }}>·</span><span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: "var(--crm-faint)" }}>{r.ad}</span></>}
          {r.stShow && <span style={{ marginLeft: "auto", paddingLeft: "8px", flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)" }}><span style={squareDot(r.stDot, 6, 2)} />{r.st}</span>}
        </span>
        <MessageLine m={r} />
      </span>
    </div>
  );
}

/** 2d · the Team inbox page: the title row, 2c's filters, the card list (and the 2c·2 sheet over it). */
export function Phone4aTeamInbox({ ib, tm, bl, bell }: { ib: TeamVM; tm: TeamMineSwap; bl: { openNotifs: () => void; notifUnread: string }; bell: boolean }) {
  const t = ib.t2;
  return (
    <main style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "none", padding: "10px 20px 12px" }}>
        <Head>
          <SearchBtn open={t.openSearch} />
          {bell && <>
            {tm.on && <SwapBtn tm={tm} />}
            <BellBtn open={bl.openNotifs} dot={!!bl.notifUnread} label="Notifications" />
          </>}
          <button type="button" onClick={ib.openPc} title="Contacts" aria-label="Contacts" style={ROUND}><Ic name="contact" size={18} /></button>
        </Head>
      </div>
      <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "10px", padding: "0 0 12px 20px", borderBottom: "1px solid var(--crm-rule)" }}>
        <div style={{ paddingRight: "20px" }}>
          {t.searchOpen
            ? <SearchField q={t.q} setQ={t.setQ} clear={t.clearQ} cancel={t.cancelSearch} h={44} r={14} />
            : (
              <div style={{ display: "flex", gap: "8px" }}>
                <FilterBtn icon={<span style={{ flex: "none", display: "flex", color: "var(--crm-ink)" }}><Ic name="users" size={16} /></span>} label="People" n={t.peopleN} open={t.openPeople} />
                <FilterBtn icon={<span style={squareDot("var(--crm-ink)")} />} label="Status" n={t.statusN} open={t.openStatus} />
              </div>
            )}
        </div>
        {!!t.tags.length && (
          <div data-drag-scroll="1" style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", paddingRight: "20px" }}>
            {t.tags.map(g => (
              <span key={g.key} style={{ flex: "none", height: "38px", padding: "0 8px 0 12px", borderRadius: "19px", display: "flex", alignItems: "center", gap: "6px", fontSize: fs(13), fontWeight: 500, whiteSpace: "nowrap", boxSizing: "border-box", background: "var(--crm-sel)", border: "1px solid var(--crm-sum-line)", color: "var(--crm-ink)" }}>
                <span style={{ flex: "none", width: "8px", height: "8px", borderRadius: g.square ? "2px" : "50%", background: g.dot }} />{g.label}
                <button type="button" onClick={g.remove} aria-label={`Remove ${g.label}`} style={{ ...BTN, flex: "none", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--crm-muted)" }}><Ic name="x" size={12} /></button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", paddingRight: "20px", fontSize: fs(13), color: "var(--crm-muted)" }}>
          <span style={{ fontWeight: 600, color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{t.count}</span>{t.of}
          {t.canClear && <button type="button" onClick={t.clearAll} style={{ ...BTN, marginLeft: "auto", fontSize: fs(13), fontWeight: 500, color: "var(--crm-rust)" }}>Clear all</button>}
        </div>
      </div>
      {/* The list keeps its place across a chat (shared/inbox-scroll.ts reads data-inb-board and its first child). */}
      <div data-inb-board="1" style={{ flex: "1 1 0", minHeight: 0, display: "flex", background: "var(--crm-hover)" }}>
        <div style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "12px", padding: "16px 16px 16px", boxSizing: "border-box" }}>
          {t.cards.map(r => <TeamCard key={r.id} r={r} />)}
          {t.empty && <span style={{ padding: "18px 0", textAlign: "center", fontSize: fs(13), color: "var(--crm-faint)" }}>No chats here</span>}
        </div>
      </div>
      {t.sheet && <FilterSheet s={t.sheet} />}
    </main>
  );
}
