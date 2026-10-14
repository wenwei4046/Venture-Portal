"use client";

/**
 * The CRM on a computer, live (CRM Desktop rev 1, 2026-10-13): the generated markup (DeskApp.tsx, from the prototype)
 * on the one view model (vm/app.ts), over the same data, writes and permissions as the phone — CrmApp reads every 5 s
 * and hands them in. What only this screen keeps: what is open, drafted and filtered (vm/ctx.ts DeskUi), its toasts
 * (3 s), Undo (30 s), the keyboard (Esc closes the menu, then the pane; ↑ ↓ walk the number fields) and its own
 * writes (PROPOSALS.md B1–B6) — each a database function that asks who may, as every CRM write does.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { crmWrite, fetchCrmHistory, saveCrmShowroomExtras } from "@/app/(member)/member/crm-actions";
import { fetchCrmChannels, saveCrmChannel, type MetaChannels } from "@/app/(member)/member/crm-channels-actions";
import type { CrmData, CrmEvent, CrmForm, CrmNote, CrmPerson } from "@/lib/member/crm-data";
import type { PanelActions } from "../panel/actions";
import type { Team } from "../panel/vm/common";
import DeskApp from "./DeskApp";
import R from "./desk-root.module.css";
import { deskVM } from "./vm/app";
import { initialDeskUi, type DeskActions, type DeskApp as DeskAppFrame, type DeskUi } from "./vm/ctx";
import { historyRows } from "./vm/history";
import { useDeskPlace, withSavedPlace } from "./nav";
import { useFollowNewest } from "../shared/stick";
import { MediaViewer } from "../shared/viewer";
import { MessageMenu } from "../shared/msg-menu";

export interface DeskScreensProps {
  data: CrmData;
  me: CrmPerson;
  now: Date;
  live: boolean;
  act: PanelActions;
  setData: Dispatch<SetStateAction<CrmData>>;
  teams: Team[];
  directors: CrmPerson[];
  nameOf(id: string | null | undefined): string;
  app: DeskAppFrame;
  exit(): void;
  toMine?: () => void;
  /** A read that failed (the last one's words), shown as the toast. */
  problem?: string;
  /** What a shared action (send, star, forward …) said — the phone panel's toast — shown here as the desktop's toast. */
  actToast?: string;
}

const TOAST_MS = 3_000;
const MIN_W = 1280, MIN_H = 800;

export default function DeskScreens(p: DeskScreensProps) {
  const { data, live, act, setData } = p;
  // A refresh opens where this tab was; Back steps through the clicks (./nav.ts, user 2026-10-13).
  const [ui, setUi] = useState<DeskUi>(() => withSavedPlace(initialDeskUi()));
  useDeskPlace(ui, setUi);
  // A chat opens on its newest message and follows the next ones, as on the phone (the owner, 2026-10-14: "電腦版打開聊天時
  // 看的是最新消息，而不是從上面慢慢滑到下面").
  const msgCount = (id: string | null) => (id ? data.customers.find(c => c.id === id)?.messages.length ?? 0 : 0);
  useFollowNewest(ui.chat || ui.awChat ? `${ui.tab}:${ui.chat ?? ""}:${ui.awChat ?? ""}` : null, msgCount(ui.chat) + msgCount(ui.awChat));
  const patch = useCallback((x: Partial<DeskUi>) => setUi(u => ({ ...u, ...x })), []);
  const [size, setSize] = useState({ W: 1440, H: 900 });
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const uiRef = useRef(ui);
  uiRef.current = ui;

  // The space the desktop fills: the screen in the app, the preview's desktop frame there — measured, never the window's.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // Never smaller than the design's smaller frame (1280 × 800): below it the lists and editors were squeezed to nothing
    // (the owner, 2026-10-13: Chat progress and Full time showed no rows); the page scrolls instead.
    const read = () => setSize({ W: Math.max(MIN_W, el.clientWidth || window.innerWidth), H: Math.max(MIN_H, el.clientHeight || window.innerHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One toast at a time, gone after 3 s (rev 1011); Undo lasts its 30 s, then the change stands.
  useEffect(() => {
    if (!ui.toast) return;
    const t = setTimeout(() => setUi(u => (u.toast === ui.toast && !u.undo ? { ...u, toast: "" } : u)), TOAST_MS);
    return () => clearTimeout(t);
  }, [ui.toast]);
  useEffect(() => {
    if (!ui.undo) return;
    const t = setTimeout(() => setUi(u => (u.undo && u.undo.until <= Date.now() ? { ...u, undo: null, toast: "" } : u)), Math.max(0, ui.undo.until - Date.now()));
    return () => clearTimeout(t);
  }, [ui.undo]);
  // A read that failed says so once.
  useEffect(() => { if (p.problem) patch({ toast: p.problem }); }, [p.problem, patch]);
  // A shared action's words (a send that failed, a forward …) reach the desktop's toast too (rev 1 showed them nowhere).
  useEffect(() => { if (p.actToast) patch({ toast: p.actToast }); }, [p.actToast, patch]);

  // Appointment greys a full slot: the showroom's booked counts around the week shown.
  const rooms = data.rooms.filter(r => r.active);
  const bookRoom = ui.book ? (rooms[ui.book.room] ?? rooms[0])?.id : undefined;
  const bookWeek = ui.book?.week ?? 0;
  useEffect(() => {
    if (!bookRoom) return;
    const d = new Date(), from = new Date(d.getFullYear(), d.getMonth() - 1, 1), to = new Date(d.getFullYear(), d.getMonth() + 3, 1);
    let current = true;
    void act.slotCounts(bookRoom, from, to).then(c => { if (current) setSlotCounts(c); });
    return () => { current = false; };
  }, [bookRoom, bookWeek, act, data.visits.length]);

  // The desktop's own writes. Each says what went wrong in the toast and changes the screen only once saved.
  const deskAct = useMemo<DeskActions>(() => {
    const call = async (name: Parameters<typeof crmWrite>[0], args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | null> => {
      if (!live) return { ok: true, data: null };
      const r = await crmWrite(name, args);
      if (!r.ok) { patch({ toast: r.error }); return null; }
      return r;
    };
    const me = p.me.id;
    return {
      async remind(customerId) {
        if (!(await call("crm_remind", { p_contact: customerId }))) return false;
        const owner = data.customers.find(c => c.id === customerId)?.assignedTo ?? null;
        const ev: CrmEvent = { id: -Date.now(), kind: "reminded", customerId, actor: me, owner, data: { to: owner }, at: new Date().toISOString() };
        setData(d => ({ ...d, events: [ev, ...d.events] }));
        return true;
      },
      async deleteNotifs(keys) {
        if (!(await call("crm_delete_notifs", { p_keys: keys }))) return false;
        setData(d => ({ ...d, notifDeleted: [...new Set([...(d.notifDeleted ?? []), ...keys])] }));
        return true;
      },
      async restoreNotifs(keys) {
        if (!(await call("crm_delete_notifs", { p_keys: keys, p_restore: true }))) return false;
        setData(d => ({ ...d, notifDeleted: (d.notifDeleted ?? []).filter(k => !keys.includes(k)) }));
        return true;
      },
      async addNote(customerId, text) {
        const r = await call("crm_add_note", { p_contact: customerId, p_body: text });
        if (!r) return false;
        const row = r.data as { id: string; created_at: string } | null;
        const note: CrmNote = { id: row?.id ?? `n${Date.now()}`, customerId, by: me, text, at: row?.created_at ?? new Date().toISOString() };
        setData(d => ({ ...d, notes: [note, ...(d.notes ?? [])] }));
        return true;
      },
      async saveForm(form) {
        const r = await call("crm_save_form", { p_id: form.id, p_name: form.name, p_sections: form.sections });
        if (!r) return false;
        const id = (r.data as { id?: string } | null)?.id ?? form.id ?? `f${Date.now()}`;
        const saved: CrmForm = { id, name: form.name, sections: form.sections };
        setData(d => {
          const list = d.forms ?? [];
          return { ...d, forms: list.some(x => x.id === id) ? list.map(x => (x.id === id ? saved : x)) : [...list, saved] };
        });
        return id;
      },
      async deleteForm(id) {
        if (!(await call("crm_delete_form", { p_id: id }))) return false;
        setData(d => ({ ...d, forms: (d.forms ?? []).filter(x => x.id !== id) }));
        return true;
      },
      async saveShowroomExtras(roomId, x) {
        if (live) {
          const form = new FormData();
          form.set("room", roomId);
          form.set("gmap", x.gmap);
          form.set("waze", x.waze);
          if (x.removePhoto) form.set("removePhoto", "1");
          if (x.photo) form.set("photo", x.photo);
          const r = await saveCrmShowroomExtras(form);
          if (!r.ok) { patch({ toast: r.error }); return false; }
        }
        // The photo's address arrives with the next read (≤ 5 s); the links show at once.
        setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === roomId ? { ...r, mapGoogle: x.gmap || null, mapWaze: x.waze || null, ...(x.removePhoto ? { photo: null } : {}) } : r)) }));
        return true;
      },
      // Channels (v2): the CRM's own link state, and a tab sent to Meta (never from the demo).
      async setChannel(kind, id, name, linked, isDefault) {
        return !!(await call("crm_set_channel", { p_kind: kind, p_external: id, p_name: name, p_linked: linked, p_default: isDefault }));
      },
      async saveMeta(s) {
        if (!live) { patch({ toast: "The preview does not send anything to Meta" }); return false; }
        const r = await saveCrmChannel(s);
        if (!r.ok) { patch({ toast: r.error }); return false; }
        return true;
      },
    };
  }, [live, patch, setData, data.customers, p.me.id]);

  // Channels: what Meta answers, read when Channels opens and again on Refresh / after a save.
  const [metaData, setMetaData] = useState<MetaChannels | null>(null);
  const [metaErr, setMetaErr] = useState("");
  const [metaN, setMetaN] = useState(0);
  const onChannels = ui.tab === "channels";
  useEffect(() => {
    if (!onChannels) return;
    let current = true;
    if (!live) { setMetaData(null); setMetaErr("Meta is not read in the preview"); return; }
    void fetchCrmChannels().then(r => { if (!current) return; if (r.ok) { setMetaData(r.data); setMetaErr(""); } else setMetaErr(r.error); });
    return () => { current = false; };
  }, [onChannels, live, metaN]);
  const meta = useMemo(() => ({ data: metaData, loading: onChannels && !metaData && !metaErr, error: metaErr, reload: () => setMetaN(n => n + 1) }), [metaData, onChannels, metaErr]);

  const ctx = {
    data, me: p.me, now: p.now, live, ui, set: setUi, patch, act, deskAct, teams: p.teams, directors: p.directors, nameOf: p.nameOf,
    slotCounts, W: size.W, H: size.H, app: p.app, toMine: p.toMine, exit: p.exit, meta,
  };
  const v = deskVM(ctx);
  // The audit trail (audit_changes) is read when Assignment or the Audit log opens (their logs), and again after a
  // setting is saved (a write sets history back to null); CRM · Manage only, as History was.
  const histOn = data.can.manage && (ui.tab === "assignment" || ui.tab === "auditlog");
  useEffect(() => {
    if (!histOn || ui.history !== null) return;
    let current = true;
    if (!live) { patch({ history: [] }); return; }
    void fetchCrmHistory().then(r => {
      if (!current) return;
      if (r.ok) patch({ history: historyRows(r.rows, id => p.nameOf(id)) });
      else patch({ history: [], toast: r.error });
    });
    return () => { current = false; };
  }, [histOn, ui.history, live, patch, p]);


  // A setting changed (here or by somebody else — the 5 s re-read): the logs read the trail again.
  const settingsSig = JSON.stringify([data.adRules, data.ftRules, data.forms, data.rooms.map(r => [r.id, r.name, r.slots, r.blocks]), data.people.map(p => [p.id, p.fullTime]), data.templates?.length]);
  const lastSig = useRef(settingsSig);
  useEffect(() => { if (lastSig.current === settingsSig) return; lastSig.current = settingsSig; if (histOn) patch({ history: null }); }, [settingsSig, histOn, patch]);

  // Entering Ads to teams opens its first ad, Full time its first team (v2) — once per entering, not after a close.
  const seeded = useRef("");
  const seedKey = `${ui.tab}:${ui.pick}:${ui.stage}`;
  useEffect(() => {
    if (seeded.current === seedKey) return;
    if (v.adSeed) { seeded.current = seedKey; patch({ ad: v.adSeed }); }
    else if (v.ftSeed) { seeded.current = seedKey; v.ftSeed(); }
  }, [seedKey, v.adSeed, v.ftSeed, patch]);

  // The prototype's keyboard: ↑ ↓ walk the number fields of the open editor; Esc closes the menu, then the pane.
  const closeRef = useRef(v.closePane);
  closeRef.current = v.closePane;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && t?.tagName === "INPUT" && t.getAttribute("inputmode") === "numeric") {
        const scope = t.closest("aside") ?? document;
        const list = [...scope.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]')].filter(x => x.offsetParent);
        const next = list[list.indexOf(t as HTMLInputElement) + (e.key === "ArrowDown" ? 1 : -1)];
        if (next) { e.preventDefault(); next.focus(); next.select(); }
        return;
      }
      if (e.key !== "Escape") return;
      if (uiRef.current.menu) setUi(u => ({ ...u, menu: false }));
      else closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // data-revenue-app: the desktop sits inside the Revenue app, so the portal's display serif stays off. Over the app's own
  // sidebar and header (z 3) — the design draws its own — and under its sheets and bell panel (z 20+), which the frame opens.
  return (
    <div ref={boxRef} className={R.root} data-revenue-app="" style={{ position: "fixed", inset: 0, zIndex: 10, overflow: "auto" }}>
      <DeskApp v={v} />
      {/* The phone's photo / video / document viewer and the message dialogs (Forward, Info, Starred), shared. */}
      <MediaViewer />
      <MessageMenu />
    </div>
  );
}
