"use client";

/**
 * The CRM on a computer, live (CRM Desktop rev 1, 2026-10-13): the generated markup (DeskApp.tsx, from the prototype)
 * on the one view model (vm/app.ts), over the same data, writes and permissions as the phone — CrmApp reads every 5 s
 * and hands them in. What only this screen keeps: what is open, drafted and filtered (vm/ctx.ts DeskUi), its toasts
 * (3 s), Undo (30 s), the keyboard (Esc closes the menu, then the pane; ↑ ↓ walk the number fields) and its own
 * writes (PROPOSALS.md B1–B6) — each a database function that asks who may, as every CRM write does.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { crmWrite, fetchAdDaily, fetchCrmHistory, saveCrmShowroomExtras } from "@/app/(member)/member/crm-actions";
import { cachedFigs, keepFigs } from "./meta-cache";
import { askAgainSoon } from "../shared/ad-figures-read";
import { metaAdIds, prefetchNeeds } from "./vm/prefetch";
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";
import { fetchCrmChannels, saveCrmBusinessProfile, saveCrmChannel, type MetaChannels } from "@/app/(member)/member/crm-channels-actions";
import { readsAds, type CrmData, type CrmEvent, type CrmForm, type CrmNote, type CrmPerson } from "@/lib/member/crm-data";
import type { PanelActions } from "../panel/actions";
import type { Team } from "../panel/vm/common";
import DeskApp from "./DeskApp";
import { DeskApplyAds } from "./DeskExtras";
import R from "./desk-root.module.css";
import { deskVM } from "./vm/app";
import { titleData, titleName, titleTeams } from "./vm/names";
import { initialDeskUi, type DeskActions, type DeskApp as DeskAppFrame, type DeskUi, type DeskViewAs } from "./vm/ctx";
import { historyRows } from "./vm/history";
import { useDeskPlace, withSavedPlace, withSavedPrefs, useDeskPrefs } from "./nav";
import { ViewAsList, type ViewAsPerson } from "./ViewAsList";
import { useFollowNewest } from "../shared/stick";
import { useReadWhenSeen } from "../shared/seen";
import { MediaViewer } from "../shared/viewer";
import { MessageMenu } from "../shared/msg-menu";
import { ActionSheetHost } from "../shared/action-sheet";
import { CustomerPickHost } from "../shared/customer-pick";
import { InviteAskHost } from "../shared/won-files";
import { inBrand } from "./vm/insight";
import { sourceOf, type SourcePick } from "@/lib/member/crm-source";
import { newRoomDraftKey, pickedSource } from "@/lib/member/crm-view";

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
  /** View as a team member (the owner, 2026-10-29: "desktop 版本能做 view as team member 吗？"): whose CRM may be opened, and opening it. */
  viewAs?: DeskViewAs;
  /** Viewing somebody's desktop (View as, 2026-10-29): whose, and the way back to one's own. */
  viewing?: { id: string; name: string; exit: () => void; people: ViewAsPerson[]; switchTo: (id: string) => void };
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
  const [ui, setUi] = useState<DeskUi>(() => withSavedPrefs(withSavedPlace(initialDeskUi())));
  useDeskPlace(ui, setUi);
  // Columns, chart tiles and cards set up once stay for the next visit (./nav.ts, the owner 2026-10-29).
  useDeskPrefs(ui);
  // A chat opens on its newest message and follows the next ones, as on the phone (the owner, 2026-10-14: "電腦版打開聊天時
  // 看的是最新消息，而不是從上面慢慢滑到下面").
  const msgCount = (id: string | null) => (id ? data.customers.find(c => c.id === id)?.messages.length ?? 0 : 0);
  useFollowNewest(ui.chat || ui.awChat ? `${ui.tab}:${ui.chat ?? ""}:${ui.awChat ?? ""}` : null, msgCount(ui.chat) + msgCount(ui.awChat));
  // One's own chat is read once its newest message is on screen — the window in front (shared/seen.ts, 2026-10-17).
  useReadWhenSeen(ui.chat, ui.chat ? data.customers.find(c => c.id === ui.chat)?.unread ?? 0 : 0, act.readChat);
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

  // The view's sub-department (mig 20261124210000): a form saved here is its, and so is a new showroom's draft.
  const viewSub = data.view?.sub && data.scope ? data.view.sub : null, newDraftKey = newRoomDraftKey(data, viewSub);
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
      async saveForm(form, kind = "customer") {
        const args = { p_id: form.id, p_name: form.name, p_sections: form.sections, p_kind: kind };
        const r = await (viewSub ? call("crm_save_form_in", { p_sub: viewSub, ...args }) : call("crm_save_form", args));
        if (!r) return false;
        const row = r.data as { id?: string; sub_department_id?: string | null } | null;
        const id = row?.id ?? form.id ?? `f${Date.now()}`;
        const key = kind === "booking" ? "bookingForms" : "forms";
        setData(d => {
          const list = d[key] ?? [], fsub = row?.sub_department_id ?? list.find(x => x.id === id)?.sub ?? viewSub;
          const saved: CrmForm = { id, name: form.name, sections: form.sections, ...(fsub ? { sub: fsub } : {}) };
          return { ...d, [key]: list.some(x => x.id === id) ? list.map(x => (x.id === id ? saved : x)) : [...list, saved] };
        });
        return id;
      },
      async addCustomer(name, phone, assign) {
        const r = await call("crm_add_contact", { p_name: name, p_phone: phone, p_assign: assign });
        if (!r) return false;
        const id = live ? String(r.data ?? "") : `demo-${Date.now()}`;
        if (!id) return false;
        // Shown at once; the next read (≤ 5 s) brings the row as the database keeps it.
        const d = phone.replace(/D/g, "").replace(/^0/, "60"), at = new Date().toISOString();
        setData(x => (x.customers.some(c => c.id === id) ? x : { ...x, customers: [{ id, name: name.trim(), phone: `+${d}`, channel: "whatsapp", adId: null, ad: "", status: "new", wonAmount: null,
          assignedTo: assign ?? me, teamId: null, lastCustomerAt: null, createdAt: at, unread: 0, details: { type: "", size: "", loc: "", req: "", budget: "" }, detailsSaved: false, messages: [] }, ...x.customers] }));
        return id;
      },
      async setActiveForm(id) {
        if (!(await call("crm_set_active_form", { p_id: id }))) return false;
        const first = (list: CrmForm[] | undefined) => { const f = (list ?? []).find(x => x.id === id); return f ? [f, ...(list ?? []).filter(x => x.id !== id)] : list; };
        setData(d => ({ ...d, forms: first(d.forms), bookingForms: first(d.bookingForms) }));
        return true;
      },
      async deleteForm(id) {
        if (!(await call("crm_delete_form", { p_id: id }))) return false;
        setData(d => ({ ...d, forms: (d.forms ?? []).filter(x => x.id !== id), bookingForms: (d.bookingForms ?? []).filter(x => x.id !== id) }));
        return true;
      },
      async saveRoomRemarks(roomId, remarks) {
        if (!(await call("crm_save_showroom_remarks", { p_id: roomId, p_remarks: remarks }))) return false;
        setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === roomId ? { ...r, remarks } : r)) }));
        return true;
      },
      async saveRoomDraft(room0, draft) {
        // A new showroom's draft is the view's sub-department's own (crm-view.ts › newRoomDraftKey).
        const room = room0 === "new" ? newDraftKey : room0;
        if (!(await call("crm_save_showroom_draft", { p_room: room, p_draft: draft }))) return false;
        setData(d => {
          const next = { ...(d.roomDrafts ?? {}) };
          if (draft) next[room] = { draft, by: me, at: new Date().toISOString() }; else delete next[room];
          return { ...d, roomDrafts: next };
        });
        return true;
      },
      async deleteRoom(roomId) {
        if (!(await call("crm_delete_showroom", { p_id: roomId }))) return false;
        setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === roomId ? { ...r, active: false, deleted: true } : r)) }));
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
      saveUiPref: (() => {
        // A burst of clicks is one write per key (v4 notes 21 / 25: remembered per user, on the server).
        const timers = new Map<string, ReturnType<typeof setTimeout>>();
        return (key: string, value: unknown) => {
          setData(d => ({ ...d, uiPrefs: { ...(d.uiPrefs ?? {}), [key]: value } }));
          const t = timers.get(key); if (t) clearTimeout(t);
          timers.set(key, setTimeout(() => { timers.delete(key); void call("crm_save_ui_pref", { p_key: key, p_value: value ?? null }); }, 600));
        };
      })(),
      saveRecents: (() => {
        // A burst of picks is one write, as the phone's (sales/actions.ts).
        let timer: ReturnType<typeof setTimeout> | null = null;
        return (list: string[]) => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; void call("crm_save_recent_emoji", { p_emoji: list }); }, 1200); };
      })(),
      async saveProfile(form) {
        if (!live) { patch({ toast: "The preview does not send anything to Meta" }); return null; }
        const r = await saveCrmBusinessProfile(form);
        if (!r.ok) { patch({ toast: r.error }); return null; }
        return r.result;
      },
      async saveMeta(s) {
        if (!live) { patch({ toast: "The preview does not send anything to Meta" }); return false; }
        const r = await saveCrmChannel(s);
        if (!r.ok) { patch({ toast: r.error }); return false; }
        return true;
      },
    };
  }, [live, patch, setData, data.customers, p.me.id, viewSub, newDraftKey]);

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
  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const meta = useMemo(() => ({ data: metaData, loading: onChannels && !metaData && !metaErr, error: metaErr, reload: () => setMetaN(n => n + 1), origin }), [metaData, onChannels, metaErr, origin]);

  // People and teams in Title Case on the desktop (v2 › note 03) — display only; the writes take ids.
  // One brand at a time, as Lead View (the owner, 2026-10-29: "要分开 DC 和 The Conts 不同的专页，像 lead view 一样"): the
  // sidebar's All · The Conts · Dream Crafter keeps every page to that brand's customers, their visits and journey (ui.insSrc,
  // kept on this computer; Insight's own switch is the same choice). Writes still take ids.
  // A view holding the CRM (2026-11-23) leaves no brand to pick: a pick kept from before is not read.
  const shown = useMemo(() => ({ data: inBrand(titleData(data), pickedSource(data, ui.insSrc as SourcePick | undefined)), me: { ...p.me, name: titleName(p.me.name) }, teams: titleTeams(p.teams), directors: p.directors.map(d => ({ ...d, name: titleName(d.name) })) }), [data, p.me, p.teams, p.directors, ui.insSrc]);
  const nameOf = useCallback((id: string | null | undefined) => titleName(p.nameOf(id)), [p]);
  // The Inbox's brand tabs count what waits in each brand, whichever is picked (as Lead View's).
  const brandCounts = useMemo(() => {
    const n = { all: 0, conts: 0, dc: 0 };
    for (const c of data.customers) { if (!(c.unread > 0)) continue; n.all++; const b = sourceOf(c).brand; if (b) n[b]++; }
    return n;
  }, [data.customers]);
  const ctx = {
    data: shown.data, me: shown.me, now: p.now, live, ui, set: setUi, patch, act, deskAct, teams: shown.teams, directors: shown.directors, nameOf,
    slotCounts, brandCounts, W: size.W, H: size.H, app: p.app, toMine: p.toMine, viewAs: p.viewAs, exit: p.exit, meta,
  };
  const v = deskVM(ctx);
  // Inbox opens on its first chat, so the page is never an empty "Pick a chat" (the owner, 2026-10-24: "能不能默認打開第一個信息，
  // 就不會顯得很空") — once each time Inbox is entered; a chat closed by hand stays closed.
  const firstChat = ui.tab === "inbox" && !ui.chat ? v.list4?.rows[0] : undefined;
  const autoOpened = useRef(false);
  useEffect(() => {
    if (ui.tab !== "inbox") { autoOpened.current = false; return; }
    if (!autoOpened.current && !ui.chat && firstChat) { autoOpened.current = true; firstChat.open(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.tab, ui.chat, firstChat?.id]);
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

  // Assignment brings in, by itself, every Meta ad running or about to run (2026-10-22, the owner: "广告开始跑，或者 pending
  // 要跑（几时开始，几时结束），在 desktop 都要看到") — CRM · Manage, at most every 10 minutes (act.metaAds(true) → crm_add_ad).
  const synced = useRef(0);
  useEffect(() => {
    if (ui.tab !== "assignment" || !live || !data.can.manage || Date.now() - synced.current < 10 * 60_000) return;
    synced.current = Date.now();
    void act.metaAds(true).then(rows => { if (rows) patch({ addAdList: rows }); });
  }, [ui.tab, live, data.can.manage, act, patch]);

  // Cold lead templates asks Meta how each review stands every time it opens, as the phone's does (2026-11-04, the owner:
  // "为什么还是review in crm?" — both were Approved in Meta, the desktop never asked); the 5 s re-read then shows it.
  const cltOn = live && data.can.manage && v.opTitle === "Cold lead templates";
  useEffect(() => { if (cltOn) void act.refreshTemplates(); }, [cltOn, act]);

  // Ads Performance reads Ads Manager's figures for the range on screen (and the compare range) — spend, cost per lead …
  // (2026-10-22, the owner: "做花费和每个名单成本"); each range and ad once (ui.apMeta), CRM · Manage, the server's token.
  // …and Assignment's Ad performance tab, for the ad open there (2026-10-23).
  const needs = [...((v.apNeed ?? []) as { key: string; since: string; until: string; ids: string[] }[]), ...(ui.tab === "assignment" && ui.adPane === "perf" ? v.adMetaNeed ?? [] : []),
    // Reports › Overview's Meta columns (2026-11-11): Spend, Impressions … for the period on screen.
    ...((v.rpNeed ?? []) as { key: string; since: string; until: string; ids: string[] }[]),
    // Insight › Overview's spend and fee (2026-11-17): the period, the one before, and the months the fee is read on.
    ...(v.overview?.need ?? [])];
  const apNeedKey = JSON.stringify(needs);
  // …on Ads Performance, on Insight › Overview, and on Reports › Ads performance, which draws the same table (2026-10-23).
  const adsOn = ui.tab === "adsperf" || (ui.tab === "insight" && (ui.insTab === "ads" || !!v.overview)) || (ui.tab === "reports" && (ui.rpCat === "ads" || ((v.rpNeed as unknown[] | undefined)?.length ?? 0) > 0)) || (ui.tab === "assignment" && ui.adPane === "perf");
  const asked = useRef(new Set<string>());
  // Old first, then new (2026-11-26, the owner: "先看到之前的记录再跳真正的数据"): a range the server answered from an older read
  // (`stale`, while it reads Meta again) is asked once more a few seconds on, and the new figures laid over the old.
  const mergeFresh = (figs: Record<string, Record<string, MetaFig | null>>) => setUi(u => {
    const m = { ...u.apMeta };
    for (const [k, f] of Object.entries(figs)) if (f && Object.keys(f).length) { keepFigs(k, f); m[k] = { ...(m[k] ?? {}), ...f }; }
    return { ...u, apMeta: m };
  });
  const staleAware = (body: { figs: Record<string, Record<string, MetaFig | null>>; stale?: string[] }, part: { key: string; since: string; until: string; ids: string[] }[]) => {
    const again = part.filter(p => body.stale?.includes(p.key));
    if (again.length) askAgainSoon(again, mergeFresh);
    return body.figs;
  };
  // An ad Meta did not answer for (left out of the GET's answer, or the GET failed) is asked again 3 s later, three times
  // at most, then reads "—" (2026-11-24, the owner: "计算还是很慢" — such an ad was marked asked and read "—" for good).
  const metaTries = useRef(new Map<string, number>());
  const [metaRetry, setMetaRetry] = useState(0);
  useEffect(() => {
    // Meta's figures: CRM · Manage, or View at All read-only (readsAds) — the server asks the same.
    if (!adsOn || !live || !readsAds(data.can)) return;
    // Faster (2026-11-23, the owner: "计算方式要加快"): what this computer kept shows at once, and every range still to read
    // goes in ONE request — a GET (/member/crm-ad-figures), so it never waits behind the 5 s re-read the way a Server
    // Action does (the owner, the same day: "overview 的数据还是很慢"); the server keeps Meta's answers for the next asker.
    const ask: typeof needs = [], shown: Record<string, Record<string, unknown>> = {};
    for (const n of needs) {
      const ids = n.ids.filter(id => !asked.current.has(`${n.key}|${id}`));
      if (!ids.length) continue;
      ids.forEach(id => asked.current.add(`${n.key}|${id}`));
      const kept = cachedFigs(n.key, n.until, ids);
      if (Object.keys(kept.figs).length) shown[n.key] = kept.figs;
      if (kept.stale.length) ask.push({ ...n, ids: kept.stale });
    }
    if (Object.keys(shown).length) setUi(u => { const m = { ...u.apMeta }; for (const [k, f] of Object.entries(shown)) m[k] = { ...(f as object), ...(m[k] ?? {}) }; return { ...u, apMeta: m }; });
    for (let i = 0; i < ask.length; i += 8) {
      const part = ask.slice(i, i + 8);
      const read = fetch(`/member/crm-ad-figures?n=${encodeURIComponent(JSON.stringify(part))}`, { cache: "no-store" })
        .then(async res => (res.ok ? { ok: true as const, figs: staleAware(await res.json(), part) } : { ok: false as const }))
        .catch(() => ({ ok: false as const }));
      void read.then(r => {
        // What did not come: asked again shortly, until its third try, which then reads "—".
        const gaveUp: Record<string, string[]> = {};
        let again = false;
        for (const n of part) for (const id of n.ids) {
          if (r.ok && id in (r.figs[n.key] ?? {})) continue;
          const k = `${n.key}|${id}`, t = (metaTries.current.get(k) ?? 0) + 1;
          metaTries.current.set(k, t);
          if (t < 3) { asked.current.delete(k); again = true; } else (gaveUp[n.key] ??= []).push(id);
        }
        if (again) setTimeout(() => setMetaRetry(x => x + 1), 3000);
        setUi(u => {
          const m = { ...u.apMeta };
          for (const n of part) {
            const figs = r.ok ? r.figs[n.key] ?? {} : {};
            if (Object.keys(figs).length) keepFigs(n.key, figs);
            // What could not be read keeps what was shown from this computer rather than blanking it.
            const none = Object.fromEntries((gaveUp[n.key] ?? []).map(id => [id, null]));
            m[n.key] = { ...none, ...(m[n.key] ?? {}), ...figs };
          }
          return { ...u, apMeta: m };
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsOn, live, data.can.manage, data.can.viewAll, apNeedKey, metaRetry]);

  // Up to date (2026-11-25, the owner: "所有的数据都要 up to date"): each range above is asked once a page load, so a computer
  // left open kept the spend it first read. Every 10 minutes, a range still running (its last day today or later) is read
  // again for every ad on screen and the answer laid over what shows; a range that ended keeps its answer.
  const apMetaRef = useRef(ui.apMeta);
  apMetaRef.current = ui.apMeta;
  useEffect(() => {
    if (!adsOn || !live || !readsAds(data.can)) return;
    const t = setInterval(() => {
      const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const again = Object.entries(apMetaRef.current ?? {}).map(([key, figs]) => { const [since, until] = key.split("|"); return { key, since, until, ids: Object.keys(figs ?? {}) }; })
        .filter(n => n.since && n.until && n.until >= today && n.ids.length);
      for (let i = 0; i < again.length; i += 8) {
        const part = again.slice(i, i + 8);
        void fetch(`/member/crm-ad-figures?n=${encodeURIComponent(JSON.stringify(part))}`, { cache: "no-store" })
          .then(async res => (res.ok ? staleAware(await res.json(), part) : null))
          .catch(() => null)
          .then(figs => {
            if (!figs) return;
            setUi(u => { const m = { ...u.apMeta }; for (const n of part) { const f = figs[n.key]; if (f && Object.keys(f).length) { keepFigs(n.key, f); m[n.key] = { ...(m[n.key] ?? {}), ...f }; } } return { ...u, apMeta: m }; });
          });
      }
    }, 10 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsOn, live, data.can.manage, data.can.viewAll]);

  // Read ahead (2026-11-26, the owner: "insight 的算法速度还是有点慢，尤其我从进页面，换时间等"): once Insight's own figures are
  // asked for, Today / This week / This month, the period before each and their fee months are read too, a second later and
  // in the background (prefetch.ts) — so switching the period finds its spend already here. Once a page load per day.
  const aheadDay = useRef("");
  useEffect(() => {
    if (!adsOn || !live || !readsAds(data.can) || ui.tab !== "insight") return;
    const day = new Date().toDateString();
    if (aheadDay.current === day) return;
    const t = setTimeout(() => {
      aheadDay.current = day;
      const ids = metaAdIds(data.customers, data.adNames);
      for (const part of prefetchNeeds(new Date(), ids, apMetaRef.current ?? {})) {
        part.forEach(n => n.ids.forEach(id => asked.current.add(`${n.key}|${id}`)));
        void fetch(`/member/crm-ad-figures?n=${encodeURIComponent(JSON.stringify(part))}`, { cache: "no-store" })
          .then(async res => (res.ok ? staleAware(await res.json(), part) : null))
          .catch(() => null)
          .then(figs => {
            // What did not come is left to the screen's own read, which asks again.
            for (const n of part) n.ids.forEach(id => { if (!figs?.[n.key] || !(id in figs[n.key])) asked.current.delete(`${n.key}|${id}`); });
            if (!figs) return;
            setUi(u => { const m = { ...u.apMeta }; for (const n of part) { const f = figs[n.key]; if (f && Object.keys(f).length) { keepFigs(n.key, f); m[n.key] = { ...f, ...(m[n.key] ?? {}) }; } } return { ...u, apMeta: m }; });
          });
      }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsOn, live, data.can.manage, data.can.viewAll, ui.tab]);

  // …and its chart, the same figures day by day for the range on screen (2026-10-23; ui.apDaily), each range and ad once.
  const dayNeed = v.apDayNeed as { key: string; since: string; until: string; ids: string[] } | null | undefined;
  const dayNeedKey = JSON.stringify(dayNeed ?? null);
  const askedDays = useRef(new Set<string>());
  useEffect(() => {
    if (!adsOn || !live || !readsAds(data.can) || !dayNeed) return;
    const ids = dayNeed.ids.filter(id => !askedDays.current.has(`${dayNeed.key}|${id}`));
    if (!ids.length) return;
    ids.forEach(id => askedDays.current.add(`${dayNeed.key}|${id}`));
    void fetchAdDaily(ids, dayNeed.since, dayNeed.until).then(r => {
      const days = r.ok ? r.days : Object.fromEntries(ids.map(id => [id, null]));
      setUi(u => ({ ...u, apDaily: { ...u.apDaily, [dayNeed.key]: { ...(u.apDaily[dayNeed.key] ?? {}), ...days } } }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsOn, live, data.can.manage, data.can.viewAll, dayNeedKey]);

  // Entering Ads to teams opens its first ad, Full time its first team (v2) — once per entering, not after a close.
  const seeded = useRef("");
  const seedKey = `${ui.tab}:${ui.pick}:${ui.stage}`;
  useEffect(() => {
    if (seeded.current === seedKey) return;
    if (v.adSeed) { seeded.current = seedKey; v.openAdById(v.adSeed); }
    else if (v.ftSeed) { seeded.current = seedKey; v.ftSeed(); }
  }, [seedKey, v.adSeed, v.ftSeed, v.openAdById, patch]);

  // An ad the place brought back (a refresh, Back) has no draft — load its saved split, or Save would write the default
  // even one (2026-10-24); again once the read brings a rule it lacked.
  const reloadAdDraft = v.reloadAdDraft;
  useEffect(() => {
    if (ui.ad && v.adDraftWant && ui.adDraftFor !== v.adDraftWant) reloadAdDraft(ui.ad);
  }, [ui.ad, ui.adDraftFor, v.adDraftWant, reloadAdDraft]);

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
      {p.viewing && (
        <div role="status" style={{ position: "fixed", top: "10px", left: "50%", transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", gap: "12px", height: "36px", padding: "0 6px 0 14px", borderRadius: "18px", background: "var(--crm-ink)", color: "#fff", font: "500 13px Inter, sans-serif", boxShadow: "0 8px 24px rgba(42,22,12,.25)", whiteSpace: "nowrap" }}>
          <span>Viewing {p.viewing.name}&apos;s CRM</span>
          {p.viewing.people.length > 1 && <ViewingSwitch v={p.viewing} />}
          <button type="button" onClick={p.viewing.exit} style={{ height: "26px", padding: "0 12px", borderRadius: "13px", border: 0, background: "#fff", color: "var(--crm-ink)", font: "600 12px Inter, sans-serif", cursor: "pointer" }}>Exit</button>
        </div>
      )}
      {/* Save and apply to all's window (2026-10-24): over the split editor, drawn as the Add customer window. */}
      {v.applyWin && <DeskApplyAds v={v.applyWin} />}
      {/* The phone's photo / video / document viewer and the message dialogs (Forward, Info, Starred), shared. */}
      <MediaViewer />
      <MessageMenu />
      {/* The cold chat's templates (CRM v4 notes/11: the warning row's Template, the + menu's Cold template) — the phone's sheet. */}
      <ActionSheetHost />
      {/* Calendar › + › Book appointment's customer picker, and Book visit's "Send invitation?" (2026-11-19) — CrmApp mounts
          them in the phone's shell only, so on a computer the picker never opened and every booking sent the invitation
          unasked (found 2026-11-27, with the Calendar's one +). */}
      <CustomerPickHost />
      <InviteAskHost />
    </div>
  );
}

/** The viewing strip's Switch (the owner, 2026-10-29: "要有可以 switch 的功能"): another person's CRM straight away. */
function ViewingSwitch({ v }: { v: NonNullable<DeskScreensProps["viewing"]> }) {
  const [on, setOn] = useState(false);
  return (
    <span style={{ position: "relative", display: "flex" }}>
      <button type="button" onClick={() => setOn(o => !o)} aria-expanded={on} style={{ height: "26px", padding: "0 10px", borderRadius: "13px", border: "1px solid rgba(255,255,255,.35)", background: "transparent", color: "#fff", font: "600 12px Inter, sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
        Switch <span aria-hidden>▾</span>
      </button>
      {on && (<>
        <span onClick={() => setOn(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
        <ViewAsList people={v.people} current={v.id} pick={id => { setOn(false); if (id !== v.id) v.switchTo(id); }} style={{ position: "absolute", top: "34px", left: "50%", transform: "translateX(-50%)", zIndex: 2, color: "var(--crm-ink)" }} />
      </>)}
    </span>
  );
}
