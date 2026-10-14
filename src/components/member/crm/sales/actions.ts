/**
 * Everything the salesperson CRM changes. Live: each is a database function
 * (or a send through Meta) under the member's own session, saved FIRST — the
 * screen changes only once it said yes, and says why when it did not. Demo
 * (/member/preview): the same changes, kept on the page.
 */
import type { Dispatch, SetStateAction } from "react";
import {
  crmWrite, fetchCrmTemplates, reactToMessage, sendCrmMedia, sendCrmMessage, sendCrmTemplate, type CrmWrite,
} from "@/app/(member)/member/crm-actions";
import type { CrmAutoReplySet, CrmCard, CrmChatMessage, CrmData, CrmLabel, CrmPrefs, CrmQuickReply, CrmVisit } from "@/lib/member/crm-data";
import type { WaTemplate } from "@/lib/whatsapp/send";
import { createClient } from "@/lib/supabase/client";
import { withMapLinks } from "@/lib/member/crm-maps";
import { mediaKindOf, mediaPath } from "@/lib/member/crm-media";
import { rememberLocalMedia } from "../shared/pending";
import { dayLabel, timeLabel, windowShut } from "./vm/common";

export interface SalesActions {
  openChat(customerId: string): void;
  send(customerId: string, text: string, replyTo?: string | null): Promise<boolean>;
  react(messageId: string, emoji: string): Promise<void>;
  hideMessage(messageId: string): Promise<void>;
  setPref(customerId: string, p: Partial<CrmPrefs>): Promise<void>;
  saveLabels(labels: { id?: string | null; name: string; color: string }[]): Promise<CrmLabel[] | null>;
  setLabel(customerId: string, labelId: string, on: boolean): Promise<void>;
  /** `extra`: answers to the questions the Control panel added to Customer info (CRM Desktop rev 1, B5); null clears one. */
  saveDetails(customerId: string, f: { name: string; phone: string; type: string; size: string; loc: string; req: string; budget: string; extra?: Record<string, string | null> }): Promise<boolean>;
  book(customerId: string, roomId: string, start: string): Promise<boolean>;
  moveVisit(visitId: string, roomId: string, start: string): Promise<boolean>;
  cancelVisit(visitId: string): Promise<boolean>;
  outcome(visitId: string, came: boolean, outcome: "follow_up" | "won" | "lost" | "rebooked", extra?: { amount?: number; reason?: string; note?: string }): Promise<boolean>;
  remind(visitId: string): Promise<boolean>;
  saveQuickReplies(items: { shortcut: string; message: string }[]): Promise<void>;
  /** Profile › Quick replies: typed in place, saved a moment after the last keystroke (a half-typed row is kept on screen, not saved). */
  editQuickReplies(items: CrmQuickReply[]): void;
  /** An auto-reply's picture: uploaded to the person's own folder; returns its public link. */
  uploadAutoReplyImage(file: File): Promise<string | null>;
  saveAutoReplies(set: CrmAutoReplySet): void;
  /** Mark notifications read: these ids, or (all) everything up to now — invitations stay until answered. */
  readNotifs(keys: string[], all?: boolean): void;
  invite(kind: "share" | "move", customerId: string, to: string): Promise<boolean>;
  answerInvite(inviteId: string, accept: boolean): Promise<void>;
  loadTemplates(): Promise<WaTemplate[] | null>;
  sendTemplate(customerId: string, t: WaTemplate, params: string[]): Promise<boolean>;
  sendMedia(customerId: string, file: File, caption: string): Promise<boolean>;
  slotCounts(roomId: string, from: Date, to: Date): Promise<Record<string, number>>;
  /** Say something on screen (the design's dark toast). */
  toast(text: string): void;
}

interface Deps {
  live: boolean;
  me: string;
  data: () => CrmData;
  setData: Dispatch<SetStateAction<CrmData>>;
  toast: (text: string) => void;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/** The words a visit card sends the customer (the chat draws them as the card), with the way there. */
export function cardText(card: CrmCard): string {
  return withMapLinks(cardWords(card), card);
}
function cardWords(card: CrmCard): string {
  const d = new Date(card.start), when = `${dayLabel(d)}, ${timeLabel(d)}`;
  const where = card.addr ? `${card.room}\n${card.addr}` : card.room;
  return card.kind === "Cancelled" ? `Your showroom visit on ${when} at ${card.room} is cancelled. Reply here to book another time.`
    : card.kind === "Reminder" ? `Reminder: your showroom visit is on ${when}.\n${where}`
      : card.kind === "Updated" ? `Your showroom visit is changed to ${when}.\n${where}`
        : `Your showroom visit is confirmed for ${when}.\n${where}`;
}

export function makeSalesActions({ live, me, data, setData, toast }: Deps): SalesActions {
  const write = async (name: CrmWrite, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false }> => {
    if (!live) return { ok: true, data: null };
    const r = await crmWrite(name, args);
    if (!r.ok) { toast(r.error); return { ok: false }; }
    return r;
  };
  const patchCustomer = (id: string, f: (c: CrmData["customers"][number]) => CrmData["customers"][number]) =>
    setData(d => ({ ...d, customers: d.customers.map(c => (c.id === id ? f(c) : c)) }));
  // A reply from anyone clears the chat's unread (crm_record_out, user 2026-10-09: 谁回复都清零).
  const addMessage = (customerId: string, m: CrmChatMessage) => patchCustomer(customerId, c => ({ ...c, messages: [...c.messages, m], status: c.status === "new" ? "follow_up" : c.status, unread: m.from === "me" ? 0 : c.unread }));
  // Sending shows at once (user 2026-10-13: a message took seconds to appear): a "sending" copy goes into the chat, the
  // real one takes its place when it went and was kept, or it leaves again and the caller says why. One chat's sends go
  // one after another, in the order tapped.
  const swapMessage = (customerId: string, tempId: string, m: CrmChatMessage | null) =>
    patchCustomer(customerId, c => ({ ...c, messages: m ? c.messages.map(x => (x.id === tempId ? m : x)) : c.messages.filter(x => x.id !== tempId) }));
  const queues = new Map<string, Promise<unknown>>();
  const inTurn = <T,>(customerId: string, run: () => Promise<T>): Promise<T> => {
    const next = (queues.get(customerId) ?? Promise.resolve()).catch(() => undefined).then(run);
    queues.set(customerId, next);
    return next;
  };
  const room = (id: string) => data().rooms.find(r => r.id === id);
  const visit = (id: string) => data().visits.find(v => v.id === id);
  const setVisit = (id: string, f: (v: CrmVisit) => CrmVisit) => setData(d => ({ ...d, visits: d.visits.map(v => (v.id === id ? f(v) : v)) }));

  /** Send a card's words when the window allows; the card shows in the chat once it went. */
  async function sendCard(customerId: string, card: CrmCard): Promise<void> {
    const c = data().customers.find(x => x.id === customerId);
    if (!c) return;
    if (windowShut(c, new Date())) {
      toast(c.channel === "messenger"
        ? "Saved. Messenger's 7-day window is closed, so the customer was not told — call them."
        : "Saved. WhatsApp's 24-hour window is closed, so the customer was not told — send a template.");
      return;
    }
    if (!live) { addMessage(customerId, { id: uid(), from: "me", kind: "text", text: cardText(card), at: new Date().toISOString(), status: "sent", by: me, card }); return; }
    const r = await sendCrmMessage(customerId, cardText(card), { card });
    if (r.ok) addMessage(customerId, r.message);
    else toast(`Saved, but the customer was not told: ${r.error}`);
  }

  return {
    toast,
    openChat(customerId) {
      const c = data().customers.find(x => x.id === customerId);
      if (!c || c.assignedTo !== me || c.unread === 0) return;
      patchCustomer(customerId, x => ({ ...x, unread: 0 }));
      if (live) void crmWrite("crm_mark_read", { p_contact: customerId }); // nothing to undo if it fails
    },
    async send(customerId, text, replyTo) {
      if (!live) { addMessage(customerId, { id: uid(), from: "me", kind: "text", text: text.trim(), at: new Date().toISOString(), status: "sent", by: me, ...(replyTo ? { replyTo } : {}) }); return true; }
      const tempId = `sending-${uid()}`;
      addMessage(customerId, { id: tempId, from: "me", kind: "text", text: text.trim(), at: new Date().toISOString(), status: "sending", by: me, ...(replyTo ? { replyTo } : {}) });
      const r = await inTurn(customerId, () => sendCrmMessage(customerId, text, { replyTo }));
      if (!r.ok) { swapMessage(customerId, tempId, null); toast(r.error); return false; }
      swapMessage(customerId, tempId, r.message);
      return true;
    },
    async react(messageId, emoji) {
      if (live) { const r = await reactToMessage(messageId, emoji); if (!r.ok) { toast(r.error); return; } }
      setData(d => ({ ...d, customers: d.customers.map(c => ({ ...c, messages: c.messages.map(m => (m.id === messageId ? { ...m, myReaction: emoji || undefined } : m)) })) }));
    },
    async hideMessage(messageId) {
      if (!(await write("crm_hide_message", { p_message: messageId })).ok) return;
      setData(d => ({ ...d, hiddenMessages: [...d.hiddenMessages, messageId] }));
    },
    async setPref(customerId, p) {
      const args: Record<string, unknown> = { p_contact: customerId, p_pinned: p.pinned ?? null, p_muted: p.muted ?? null, p_hidden: p.hidden ?? null, p_blocked: p.blocked ?? null };
      if (p.pinnedMessageId !== undefined) { args.p_pinned_message = p.pinnedMessageId; args.p_clear_pinned_message = p.pinnedMessageId === null; }
      if (!(await write("crm_set_pref", args)).ok) return;
      setData(d => ({ ...d, prefs: { ...d.prefs, [customerId]: { ...(d.prefs[customerId] ?? { pinned: false, muted: false, hidden: false, blocked: false, pinnedMessageId: null }), ...p } } }));
    },
    async saveLabels(labels) {
      const r = await write("crm_save_labels", { p_labels: labels.map(l => ({ ...(l.id ? { id: l.id } : {}), name: l.name, color: l.color })) });
      if (!r.ok) return null;
      const saved: CrmLabel[] = live ? (r.data as CrmLabel[]) : labels.map(l => ({ id: l.id ?? uid(), name: l.name, color: l.color }));
      setData(d => {
        const ids = new Set(saved.map(l => l.id));
        return { ...d, labels: saved, customerLabels: Object.fromEntries(Object.entries(d.customerLabels).map(([k, v]) => [k, v.filter(x => ids.has(x))])) };
      });
      return saved;
    },
    async setLabel(customerId, labelId, on) {
      if (!(await write("crm_set_label", { p_contact: customerId, p_label: labelId, p_on: on })).ok) return;
      setData(d => {
        const cur = d.customerLabels[customerId] ?? [];
        return { ...d, customerLabels: { ...d.customerLabels, [customerId]: on ? [...new Set([...cur, labelId])] : cur.filter(x => x !== labelId) } };
      });
    },
    async saveDetails(customerId, f) {
      // With answers to the form's own questions, the nine-argument function (mig 20261013100000); else the eight as before.
      if (!(await write("crm_save_details", { p_contact: customerId, p_name: f.name, p_phone: f.phone, p_type: f.type, p_size: f.size, p_location: f.loc, p_requirement: f.req, p_budget: f.budget, ...(f.extra ? { p_extra: f.extra } : {}) })).ok) return false;
      const merged = (old: Record<string, string> | undefined) => {
        if (!f.extra) return old;
        const next: Record<string, string> = { ...(old ?? {}) };
        for (const [k, v] of Object.entries(f.extra)) { if (v == null || v === "") delete next[k]; else next[k] = v; }
        return next;
      };
      patchCustomer(customerId, c => ({ ...c, name: f.name.trim(), phone: f.phone.trim() || c.phone, details: { type: f.type, size: f.size, loc: f.loc.trim(), req: f.req.trim(), budget: f.budget.trim() }, extra: merged(c.extra) }));
      return true;
    },
    async book(customerId, roomId, start) {
      const r = await write("crm_book", { p_contact: customerId, p_showroom: roomId, p_start: start, p_minutes: 60 });
      if (!r.ok) return false;
      const saved = r.data as { id: string } | null;
      setData(d => ({ ...d, visits: [...d.visits, { id: saved?.id ?? uid(), customerId, showroomId: roomId, start, minutes: 60, state: "booked", outcome: null, remindedAt: null }] }));
      patchCustomer(customerId, c => ({ ...c, status: "appointment", lost: undefined, previous: undefined }));
      const rm = room(roomId);
      await sendCard(customerId, { kind: "Confirmed", start, room: rm?.name ?? "", addr: rm?.address ?? "" });
      return true;
    },
    async moveVisit(visitId, roomId, start) {
      if (!(await write("crm_move_appointment", { p_appointment: visitId, p_start: start, p_showroom: roomId })).ok) return false;
      const v = visit(visitId);
      setVisit(visitId, x => ({ ...x, start, showroomId: roomId }));
      const rm = room(roomId);
      if (v) await sendCard(v.customerId, { kind: "Updated", start, room: rm?.name ?? "", addr: rm?.address ?? "" });
      return true;
    },
    async cancelVisit(visitId) {
      if (!(await write("crm_set_appointment_state", { p_appointment: visitId, p_state: "cancelled" })).ok) return false;
      const v = visit(visitId);
      setVisit(visitId, x => ({ ...x, state: "cancelled" }));
      if (v) {
        const stillBooked = data().visits.some(x => x.customerId === v.customerId && x.id !== visitId && x.state === "booked");
        if (!stillBooked) patchCustomer(v.customerId, c => (c.status === "appointment" ? { ...c, status: "follow_up" } : c));
        const rm = room(v.showroomId);
        await sendCard(v.customerId, { kind: "Cancelled", start: v.start, room: rm?.name ?? "", addr: rm?.address ?? "" });
      }
      return true;
    },
    async outcome(visitId, came, outcome, extra = {}) {
      const v = visit(visitId);
      if (!v) return false;
      if (!(await write("crm_visit_outcome", { p_appointment: visitId, p_came: came, p_outcome: outcome, p_amount: extra.amount ?? null, p_reason: extra.reason ?? null, p_note: extra.note ?? null })).ok) return false;
      setVisit(visitId, x => ({ ...x, state: came ? "attended" : "no_show", outcome }));
      if (outcome !== "rebooked") patchCustomer(v.customerId, c => ({
        ...c,
        status: outcome === "won" ? "won" : outcome === "lost" ? "lost" : "follow_up",
        wonAmount: outcome === "won" ? extra.amount ?? null : c.wonAmount,
        lost: outcome === "lost" && extra.reason ? { reason: extra.reason as NonNullable<typeof c.lost>["reason"], ...(extra.note ? { note: extra.note } : {}) } : undefined,
      }));
      if (!live && (outcome === "won" || outcome === "lost")) setData(d => ({ ...d, events: [{ id: Date.now(), kind: outcome, customerId: v.customerId, actor: me, owner: me, data: outcome === "won" ? { amount: extra.amount } : { reason: extra.reason }, at: new Date().toISOString() }, ...d.events] }));
      return true;
    },
    async remind(visitId) {
      const v = visit(visitId);
      if (!v) return false;
      const rm = room(v.showroomId), c = data().customers.find(x => x.id === v.customerId);
      if (!c) return false;
      if (windowShut(c, new Date())) { toast(c.channel === "messenger" ? "Messenger's 7-day window is closed — call the customer." : "WhatsApp's 24-hour window is closed — send a template instead."); return false; }
      await sendCard(v.customerId, { kind: "Reminder", start: v.start, room: rm?.name ?? "", addr: rm?.address ?? "" });
      if (live) await crmWrite("crm_mark_reminded", { p_appointment: visitId }).catch(() => null);
      setVisit(visitId, x => ({ ...x, remindedAt: new Date().toISOString() }));
      return true;
    },
    async saveQuickReplies(items) {
      const r = await write("crm_save_quick_replies", { p_items: items });
      if (!r.ok) return;
      const saved: CrmQuickReply[] = live ? (r.data as CrmQuickReply[]) : items.filter(i => i.shortcut.trim() && i.message.trim()).map(i => ({ id: uid(), ...i }));
      setData(d => ({ ...d, quickReplies: saved }));
    },
    editQuickReplies: (() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return (items: CrmQuickReply[]) => {
        setData(d => ({ ...d, quickReplies: items }));
        if (!live) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void crmWrite("crm_save_quick_replies", { p_items: items.map(i => ({ shortcut: i.shortcut, message: i.message })) }).then(r => { if (!r.ok) toast(r.error); }); }, 700);
      };
    })(),
    async uploadAutoReplyImage(file) {
      if (!["image/jpeg", "image/png"].includes(file.type)) { toast("Choose a JPG or PNG picture."); return null; }
      if (file.size > 5 * 1024 * 1024) { toast("A picture can be up to 5 MB."); return null; }
      if (!live) return URL.createObjectURL(file);
      const supabase = createClient();
      const path = `${me}/${Date.now()}-${file.name.replace(/[^w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("crm-auto-reply").upload(path, file, { contentType: file.type, upsert: false });
      if (error) { toast("The picture could not be uploaded. Try again."); return null; }
      return supabase.storage.from("crm-auto-reply").getPublicUrl(path).data.publicUrl;
    },
    saveAutoReplies: (() => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      return (set: CrmAutoReplySet) => {
        setData(d => ({ ...d, autoReplies: set }));
        if (!live) return;
        if (timer) clearTimeout(timer);
        // Saved a moment after the last keystroke.
        timer = setTimeout(() => { void crmWrite("crm_save_auto_replies", { p_settings: set }).then(r => { if (!r.ok) toast(r.error); }); }, 700);
      };
    })(),
    readNotifs(keys, all = false) {
      setData(d => ({ ...d, notifRead: all ? [] : [...new Set([...d.notifRead, ...keys])], notifsSeenAt: all ? new Date().toISOString() : d.notifsSeenAt }));
      if (live) void crmWrite("crm_read_notifs", { p_keys: keys, p_all: all });
    },
    async invite(kind, customerId, to) {
      const r = await write("crm_invite", { p_kind: kind, p_contact: customerId, p_to: to });
      if (!r.ok) return false;
      const c = data().customers.find(x => x.id === customerId);
      const row = r.data as { id?: string } | null;
      setData(d => ({ ...d, invites: [{ id: row?.id ?? uid(), kind, customerId, customerName: c?.name ?? "", from: me, to, state: "pending", createdAt: new Date().toISOString(), decidedAt: null }, ...d.invites] }));
      return true;
    },
    async answerInvite(inviteId, accept) {
      if (!(await write("crm_answer_invite", { p_invite: inviteId, p_accept: accept })).ok) return;
      setData(d => ({ ...d, invites: d.invites.map(i => (i.id === inviteId ? { ...i, state: accept ? "accepted" : "declined", decidedAt: new Date().toISOString() } : i)) }));
    },
    async loadTemplates() {
      // Demo: the switched-on WhatsApp templates of the demo data, as the live read gives them (rev 1011).
      if (!live) return (data().templates ?? []).filter(t => t.ch === "whatsapp" && t.st === "approved" && t.on && t.metaName).map(t => {
        const text = t.body.replace(/\{name\}/g, "{{1}}");
        return { name: t.metaName!, label: t.name, language: t.language, category: "MARKETING", text, params: text.includes("{{1}}") ? 1 : 0 };
      });
      const r = await fetchCrmTemplates();
      if (!r.ok) { toast(r.error); return null; }
      return r.templates;
    },
    async sendTemplate(customerId, t, params) {
      if (!live) { addMessage(customerId, { id: uid(), from: "me", kind: "template", text: t.text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? ""), at: new Date().toISOString(), status: "sent", by: me }); return true; }
      const tempId = `sending-${uid()}`;
      addMessage(customerId, { id: tempId, from: "me", kind: "template", text: t.text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => params[Number(n) - 1] ?? ""), at: new Date().toISOString(), status: "sending", by: me });
      const r = await inTurn(customerId, () => sendCrmTemplate(customerId, t, params));
      if (!r.ok) { swapMessage(customerId, tempId, null); toast(r.error); return false; }
      swapMessage(customerId, tempId, r.message);
      return true;
    },
    async sendMedia(customerId, file, caption) {
      // Photos, videos and voice notes (2026-10-13): shown at once from the phone itself, then put in the private bucket
      // crm-media straight from the browser (no 4 MB Server Action), then sent by the server from there.
      if (file.size > 25 * 1024 * 1024) { toast("A photo, video or file can be up to 25 MB."); return false; }
      const mime = (file.type || "application/octet-stream").split(";")[0];
      const kind = mediaKindOf(mime), shown = kind === "document" ? "file" : kind;
      const local = typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "";
      const draft: CrmChatMessage = { id: `sending-${uid()}`, from: "me", kind, text: kind === "document" ? file.name : caption, at: new Date().toISOString(), status: live ? "sending" : "sent", by: me,
        ...(local ? { media: { kind: shown, url: local, ...(shown === "file" ? { name: file.name, mime: file.type } : {}) } } : {}) };
      addMessage(customerId, draft);
      if (!live) return true;
      const r = await inTurn(customerId, async () => {
        const path = mediaPath(customerId, file.name || "file", mime);
        const up = await createClient().storage.from("crm-media").upload(path, file, { contentType: mime, upsert: false });
        if (up.error) return { ok: false as const, error: "The file could not be uploaded. Check the connection and try again." };
        return sendCrmMedia({ contact: customerId, path, name: file.name || "file", mime, caption });
      });
      if (!r.ok) { swapMessage(customerId, draft.id, null); toast(r.error); return false; }
      // Keep showing the phone's own copy, through every later read too (shared/pending.ts) — no second download.
      if (r.message.media && local) rememberLocalMedia(r.message.id, local);
      swapMessage(customerId, draft.id, r.message.media && local ? { ...r.message, media: { ...r.message.media, url: local } } : r.message);
      return true;
    },
    async slotCounts(roomId, from, to) {
      if (!live) {
        const out: Record<string, number> = {};
        for (const v of data().visits) if (v.showroomId === roomId && v.state === "booked") out[new Date(v.start).toISOString()] = (out[new Date(v.start).toISOString()] ?? 0) + 1;
        return out;
      }
      const r = await crmWrite("crm_slot_counts", { p_showroom: roomId, p_from: from.toISOString(), p_to: to.toISOString() });
      if (!r.ok) return {};
      return Object.fromEntries(((r.data ?? []) as { start_at: string; booked: number }[]).map(x => [new Date(x.start_at).toISOString(), x.booked]));
    },
  };
}
