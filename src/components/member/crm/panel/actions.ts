/**
 * What the Control panel changes, on top of everything a chat does (the
 * Principal and the Director reply and book too): send an Organic Lead,
 * move a customer, undo either, the ad rules and full-time allocation, the
 * showrooms, and which notifications are read. Saved first, as everywhere.
 */
import type { ApptType } from "@/lib/member/crm-data";
import { crmWrite, fetchMetaAds, refreshCrmTemplates, submitCrmTemplate } from "@/app/(member)/member/crm-actions";
import type { MetaAdRow } from "@/lib/member/crm-ad-names-meta";
import { adToSync } from "@/lib/member/crm-ad-running";
import type { CrmData, CrmReplyItem, CrmRoom, CrmTemplate, CrmSettings } from "@/lib/member/crm-data";
import type { SalesActions } from "../sales/actions";
import { teamOf } from "../shared/people";
import type { Dispatch, SetStateAction } from "react";

export interface PanelActions extends SalesActions {
  sendTo(customerId: string, staffId: string | null): Promise<boolean>;
  /** Saved: how many leads waiting Over the limit for this ad the database dealt at once (rev 1011 §6.6); false: not saved. */
  /** Names an ad (crm_name_ad, CRM · Manage); an empty name takes the given name off. */
  nameAd(ad: string, name: string): Promise<boolean>;
  /** Take an ad off Ads performance, or put it back (crm_hide_ad); its leads stay. */
  hideAd(ad: string, on: boolean): Promise<boolean>;
  /** Showrooms › Appointment types, saved whole (crm_save_appt_types). */
  saveApptTypes(types: ApptType[]): Promise<boolean>;
  /** Adds an ad before its first lead (crm_add_ad, CRM · Manage; 2026-10-22): it joins Ads to teams with its run. */
  addAd(ad: { id: string; name: string; status: string; start: string | null; end: string | null; page?: string | null; pageName?: string | null }): Promise<boolean>;
  /** Meta's ads in the connected ad accounts; also adds, by itself, every one running or about to run (`sync`). */
  metaAds(sync: boolean): Promise<MetaAdRow[] | null>;
  /** Settings › General (crm_save_settings, CRM · Manage): the reply lines, the template button, auto-assign. */
  saveSettings(s: CrmSettings): Promise<boolean>;
  /** Settings › Reply library (crm_save_reply_library, CRM · Manage; 2026-10-29): the whole library, in its order. */
  saveReplyLibrary(items: CrmReplyItem[]): Promise<boolean>;
  /** A partner's booking link (mig 20261029190000, CRM · Manage): on / off, or a new address. */
  setPartnerLink(id: string, on: boolean | null, newCode: boolean): Promise<boolean>;
  /** Cancel a booking a partner made through its link. */
  cancelPartnerBooking(id: string): Promise<boolean>;
  /** Save, this ad only; `together`: whether it is still counted with the together ads (saved with anything changed, it leaves them). */
  saveAdRule(ad: string, label: string, rule: { mode: "even" | "split" | null; split: Record<string, number>; pm: "cnt" | "pct"; pp: Record<string, number>; tm?: Record<string, "even" | "pct" | "cnt"> }): Promise<false | { dealt: number; together: boolean }>;
  /** Save and apply to all's window (crm_save_ads, 2026-10-24): this setting on the ads ticked, each counting its own leads
   *  (Standard) or all of them together — then they are the together ads, and one together before and not ticked counts on
   *  its own. How many ads it saved, waiting leads it dealt and ads that left the together ads; or false. */
  saveAds(ads: { id: string; label: string }[], together: boolean, rule: { mode: "even" | "split"; split: Record<string, number>; pm: "cnt" | "pct"; pp: Record<string, number>; tm?: Record<string, "even" | "pct" | "cnt"> }): Promise<false | { saved: number; dealt: number; left: number }>;
  saveFtRule(tlId: string, mode: "cnt" | "pct" | "turns", days: number[], vals: Record<string, Record<string, number>>): Promise<boolean>;
  /** Member work type (rev 1011): full time or part time; part time clears their ticked Full time days. */
  setFullTime(staffId: string, on: boolean): Promise<boolean>;
  /** Lock a member out of the dealing for now, or back in (crm_set_locked, CRM · Manage). */
  setLocked(staffId: string, on: boolean): Promise<boolean>;
  /** A member's leave (mig 20261029220000, CRM · Manage): add or change one; remove one. */
  saveLeave(leave: { id: string | null; staffId: string; from: string; to: string; note: string }): Promise<boolean>;
  deleteLeave(id: string): Promise<boolean>;
  /** Cold lead templates (rev 1011): save a draft, or save and submit a WhatsApp one for Meta's review. */
  saveTemplate(t: { id: string | null; name: string; ch: CrmTemplate["ch"]; body: string }, submit: boolean): Promise<CrmTemplate | false>;
  templateOn(id: string, on: boolean): Promise<boolean>;
  deleteTemplate(id: string): Promise<boolean>;
  /** Meta's review brought in (on opening the page); the changes arrive with the next read. */
  refreshTemplates(): Promise<void>;
  readNotifs(keys: string[], all?: boolean): void;
  /** The saved showroom's id, or false. */
  saveRoom(room: Omit<CrmRoom, "id"> & { id: string | null }): Promise<string | false>;
  removeRoom(id: string): Promise<boolean>;
  /** v3 T07: a showroom's staff-only remarks (crm_save_showroom_remarks), as the desktop's frame 07. */
  saveRoomRemarks(id: string, remarks: string): Promise<boolean>;
  /** A showroom hands the unit's key over, or not (crm_set_showroom_keys, the owner 2026-10-29). */
  setRoomKeys(id: string, on: boolean): Promise<boolean>;
  /** The showrooms in this order (crm_set_showroom_order): every list and picker follows it. */
  orderRooms(ids: string[]): Promise<boolean>;
}

/** The same keys with the same values — as the database compares two saved settings (jsonb: a key missing ≠ a key at 0). */
const sameValues = (a: Record<string, unknown> = {}, b: Record<string, unknown> = {}) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].every(k => a[k] === b[k]);

export function makePanelActions(base: SalesActions, { live, data, setData }: { live: boolean; data: () => CrmData; setData: Dispatch<SetStateAction<CrmData>> }): PanelActions {
  const write = async (name: Parameters<typeof crmWrite>[0], args: Record<string, unknown>) => {
    if (!live) return { ok: true as const, data: null as unknown };
    const r = await crmWrite(name, args);
    if (!r.ok) { base.toast(r.error); return null; }
    return r;
  };
  const api: PanelActions = {
    ...base,
    async sendTo(customerId, staffId) {
      if (!(await write("crm_send_to", { p_contact: customerId, p_staff: staffId }))) return false;
      const team = staffId ? teamOf(staffId, data().people)?.id ?? null : null;
      setData(d => ({ ...d, customers: d.customers.map(c => (c.id === customerId ? { ...c, assignedTo: staffId, teamId: team } : c)) }));
      return true;
    },
    async saveSettings(st) {
      if (!(await write("crm_save_settings", { p_soon: st.replySoonH, p_urgent: st.replyUrgentH, p_overdue: st.replyOverdueH, p_suggest: st.suggestTemplate, p_auto: st.autoAssign, p_push: st.pushMessages, p_reminders: st.reminders, p_team_alerts: st.teamAlerts, p_send_auto: st.sendAutoReply }))) return false;
      setData(d => ({ ...d, settings: st }));
      return true;
    },
    async saveReplyLibrary(items) {
      const r = await write("crm_save_reply_library", { p_items: items.map(i => ({ id: i.id, title: i.title, category: i.category, body: i.body, keywords: i.keywords })) });
      if (!r) return false;
      // The database answers the library as saved (new rows with their ids); the demo keeps what was sent.
      const saved = Array.isArray(r.data) ? (r.data as CrmReplyItem[]).map(x => ({ ...x, category: x.category ?? "", keywords: x.keywords ?? [] })) : items;
      setData(d => ({ ...d, replyLibrary: saved }));
      return true;
    },
    async setPartnerLink(id, on, newCode) {
      const r = await write("crm_partner_link_set", { p_id: id, p_on: on, p_new_code: newCode });
      if (!r) return false;
      const l = r.data as { id: string; name: string; code: string; on: boolean } | null;
      setData(d => ({ ...d, partnerLinks: (d.partnerLinks ?? []).map(x => (x.id === id ? (l ?? { ...x, on: on ?? x.on }) : x)) }));
      return true;
    },
    async cancelPartnerBooking(id) {
      if (!(await write("crm_partner_booking_cancel", { p_id: id }))) return false;
      setData(d => ({ ...d, partnerBookings: (d.partnerBookings ?? []).map(b => (b.id === id ? { ...b, state: "cancelled" as const } : b)) }));
      return true;
    },
    async addAd(ad) {
      if (!(await write("crm_add_ad", { p_ad: ad.id, p_name: ad.name, p_status: ad.status || null, p_start: ad.start, p_end: ad.end, p_page: ad.page ?? null, p_page_name: ad.pageName ?? null }))) return false;
      setData(d => {
        const cur = d.adNames?.[ad.id];
        return { ...d, adNames: { ...(d.adNames ?? {}), [ad.id]: { name: cur?.source === "manual" ? cur.name : ad.name || cur?.name || `Ad ${ad.id}`, source: cur?.source ?? "meta",
          status: ad.status || cur?.status || null, statusAt: new Date().toISOString(), added: true, startAt: ad.start ?? cur?.startAt ?? null, endAt: ad.end, pageId: ad.page ?? cur?.pageId ?? null, pageName: ad.pageName ?? cur?.pageName ?? null } } };
      });
      return true;
    },
    async metaAds(sync) {
      if (!live) return null;
      const r = await fetchMetaAds();
      if (!r.ok) return null;
      if (sync) {
        const now = new Date(), have = data().adNames ?? {};
        for (const a of r.ads) {
          const h = have[a.id];
          if (!adToSync(a, now) || (h?.added && h.status === a.status && (h.startAt ?? null) === a.start && (h.endAt ?? null) === a.end && (h.pageId ?? null) === a.page)) continue;
          await api.addAd(a);
        }
      }
      return r.ads;
    },
    async nameAd(ad, name) {
      const nm = name.trim();
      if (!(await write("crm_name_ad", { p_ad: ad, p_name: nm }))) return false;
      // The screen follows at once: the names, and every customer from that ad (their `ad`), back to Meta's headline when cleared.
      setData(d => {
        const names = { ...(d.adNames ?? {}) };
        if (nm) names[ad] = { name: nm, source: "manual" }; else delete names[ad];
        return { ...d, adNames: names, customers: d.customers.map(c => (c.adId === ad ? { ...c, ad: nm || c.adHeadline || `Ad ${ad}` } : c)) };
      });
      return true;
    },
    async saveApptTypes(types) {
      if (!(await write("crm_save_appt_types", { p_types: types }))) return false;
      setData(d => ({ ...d, apptTypes: types }));
      return true;
    },
    async hideAd(ad, on) {
      if (!(await write("crm_hide_ad", { p_ad: ad, p_on: on }))) return false;
      setData(d => {
        const names = { ...(d.adNames ?? {}) }, cur = names[ad] ?? { name: d.customers.find(c => c.adId === ad)?.ad ?? `Ad ${ad}`, source: "manual" as const };
        names[ad] = { ...cur, hidden: on || undefined };
        return { ...d, adNames: names };
      });
      return true;
    },
    async saveAdRule(ad, label, rule) {
      const tm = rule.mode === "split" ? rule.tm ?? {} : {};
      const r = await write("crm_save_ad_assign", { p_ad: ad, p_label: label, p_mode: rule.mode, p_team_split: rule.split, p_people_mode: rule.pm, p_people: rule.pp, p_team_modes: tm });
      if (!r) return false;
      // The saved row: an ad saved on its own with anything changed has left the ads counted together (mig 20261025121500);
      // the demo, which saves nothing, asks the same of the rule it had.
      const row = r.data as { dealt?: number; together?: boolean } | null, old = data().adRules.find(x => x.adId === ad);
      const together = live ? !!row?.together
        : !!old?.together && old.mode === rule.mode && old.pm === rule.pm && sameValues(old.split, rule.split) && sameValues(old.pp, rule.pp) && sameValues(old.tm, tm);
      setData(d => ({
        ...d,
        adRules: [...d.adRules.filter(r => r.adId !== ad),
          ...(rule.mode ? [{ adId: ad, label, mode: rule.mode, split: rule.split, pm: rule.pm, pp: rule.pp, tm, startedAt: d.adRules.find(r => r.adId === ad)?.startedAt ?? new Date().toISOString(), ...(together ? { together: true } : {}) }] : [])],
      }));
      // The leads it dealt arrive with the next read (every 5 s); the toast says how many.
      return { dealt: Number(row?.dealt ?? 0), together };
    },
    async saveAds(ads, together, rule) {
      const tm = rule.mode === "split" ? rule.tm ?? {} : {};
      const r = await write("crm_save_ads", { p_ads: Object.fromEntries(ads.map(a => [a.id, a.label])), p_together: together, p_mode: rule.mode, p_team_split: rule.split, p_people_mode: rule.pm, p_people: rule.pp, p_team_modes: tm });
      if (!r) return false;
      // The ads ticked hold this setting; counted together, they are the together ads and one together before counts alone.
      // A new mode starts a new count, and so does joining the together ads or leaving them (the database does the same).
      const ids = ads.map(a => a.id), at = new Date().toISOString(), before = data().adRules;
      const left = together ? before.filter(x => x.together && !ids.includes(x.adId)).length : 0;
      setData(d => ({
        ...d,
        adRules: [...d.adRules.filter(x => !ids.includes(x.adId)).map(x => (together && x.together ? { ...x, together: false, startedAt: at } : x)), ...ids.map(id => {
          const old = d.adRules.find(x => x.adId === id);
          return { adId: id, label: ads.find(a => a.id === id)?.label ?? old?.label ?? "", mode: rule.mode, split: rule.split, pm: rule.pm, pp: rule.pp, tm,
            startedAt: old && old.mode === rule.mode && !!old.together === together ? old.startedAt : at, ...(together ? { together: true } : {}) };
        })],
      }));
      const got = r.data as { saved?: number; dealt?: number; left?: number } | null;
      return { saved: Number(got?.saved ?? ids.length), dealt: Number(got?.dealt ?? 0), left: Number(got?.left ?? left) };
    },
    async saveFtRule(tlId, mode, days, vals) {
      if (!(await write("crm_save_fulltime", { p_tl: tlId, p_mode: mode, p_days: days, p_vals: vals }))) return false;
      setData(d => ({ ...d, ftRules: [...d.ftRules.filter(r => r.tlId !== tlId), { tlId, mode, days, vals }] }));
      return true;
    },
    async setLocked(staffId, on) {
      if (!(await write("crm_set_locked", { p_staff: staffId, p_locked: on }))) return false;
      setData(d => ({ ...d, lockedStaff: on ? [...new Set([...(d.lockedStaff ?? []), staffId])] : (d.lockedStaff ?? []).filter(id => id !== staffId) }));
      return true;
    },
    async saveLeave(l) {
      const r = await write("crm_save_leave", { p_id: l.id, p_staff: l.staffId, p_from: l.from, p_to: l.to, p_note: l.note });
      if (!r) return false;
      const id = typeof r.data === "string" ? r.data : l.id ?? `local-${Date.now()}`;
      setData(d => ({ ...d, leaves: [...(d.leaves ?? []).filter(x => x.id !== l.id), { id, staffId: l.staffId, from: l.from, to: l.to, note: l.note }].sort((a, b) => a.from.localeCompare(b.from)) }));
      return true;
    },
    async deleteLeave(id) {
      if (!(await write("crm_delete_leave", { p_id: id }))) return false;
      setData(d => ({ ...d, leaves: (d.leaves ?? []).filter(x => x.id !== id) }));
      return true;
    },
    async setFullTime(staffId, on) {
      if (!(await write("crm_set_full_time", { p_staff: staffId, p_full_time: on }))) return false;
      setData(d => ({
        ...d,
        people: d.people.map(p => (p.id === staffId ? { ...p, fullTime: on } : p)),
        // Part time leaves Full time lead allocation: the database cleared their ticked days; so does the screen.
        ftRules: on ? d.ftRules : d.ftRules.map(r => { const { [staffId]: _gone, ...vals } = r.vals; return { ...r, vals }; }),
      }));
      return true;
    },
    async saveTemplate(t, submit) {
      const putT = (x: CrmTemplate) => setData(d => ({ ...d, templates: (d.templates ?? []).some(y => y.id === x.id) ? (d.templates ?? []).map(y => (y.id === x.id ? x : y)) : [...(d.templates ?? []), x] }));
      if (submit && t.ch !== "whatsapp") { base.toast("Messenger templates are not connected yet — save it as a draft."); return false; }
      if (!live) {
        const was = (data().templates ?? []).find(y => y.id === t.id);
        const x: CrmTemplate = { id: t.id ?? `t${Date.now()}`, name: t.name.trim(), ch: t.ch, body: t.body.trim(), st: submit ? "review" : "draft", on: false, metaName: was?.metaName ?? null, language: "en", reason: null };
        putT(x);
        return x;
      }
      const r = await write("crm_save_template", { p_id: t.id, p_name: t.name, p_channel: t.ch, p_body: t.body });
      if (!r) return false;
      const row = r.data as { id: string; name: string; channel: CrmTemplate["ch"]; body: string; status: CrmTemplate["st"]; is_on: boolean; meta_name: string | null; language: string; reject_reason: string | null };
      let x: CrmTemplate = { id: row.id, name: row.name, ch: row.channel, body: row.body, st: row.status, on: row.is_on, metaName: row.meta_name, language: row.language, reason: row.reject_reason };
      putT(x);
      // Unchanged and already with Meta (In review / Approved): nothing to submit again.
      if (!submit || (x.st !== "draft" && x.st !== "rejected")) return x;
      const s = await submitCrmTemplate(x.id);
      if (!s.ok) { base.toast(s.error); return false; }
      x = { ...x, st: s.status, on: false, metaName: s.metaName, reason: null };
      putT(x);
      return x;
    },
    async templateOn(id, on) {
      if (!(await write("crm_template_on", { p_id: id, p_on: on }))) return false;
      setData(d => ({ ...d, templates: (d.templates ?? []).map(y => (y.id === id ? { ...y, on } : y)) }));
      return true;
    },
    async deleteTemplate(id) {
      if (!(await write("crm_delete_template", { p_id: id }))) return false;
      setData(d => ({ ...d, templates: (d.templates ?? []).filter(y => y.id !== id) }));
      return true;
    },
    async refreshTemplates() {
      if (!live) return;
      const r = await refreshCrmTemplates();
      if (!r.ok) base.toast(r.error);
    },
    readNotifs(keys, all = false) {
      setData(d => ({ ...d, notifRead: all ? [] : [...new Set([...d.notifRead, ...keys])], notifsSeenAt: all ? new Date().toISOString() : d.notifsSeenAt }));
      if (live) void crmWrite("crm_read_notifs", { p_keys: keys, p_all: all });
    },
    async saveRoom(room) {
      const r = await write("crm_save_showroom_full", { p_id: room.id, p_name: room.name, p_address: room.address, p_slots: room.slots, p_cap: room.cap, p_weekly: room.weekly, p_blocks: room.blocks, p_active: room.active });
      if (!r) return false;
      const saved = r.data as { id: string } | null;
      const next: CrmRoom = { ...room, id: saved?.id ?? room.id ?? `r${Date.now()}` };
      setData(d => ({ ...d, rooms: d.rooms.some(x => x.id === next.id) ? d.rooms.map(x => (x.id === next.id ? next : x)) : [...d.rooms, next] }));
      return next.id;
    },
    async saveRoomRemarks(id, remarks) {
      if (!(await write("crm_save_showroom_remarks", { p_id: id, p_remarks: remarks }))) return false;
      setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === id ? { ...r, remarks } : r)) }));
      return true;
    },
    async setRoomKeys(id, on) {
      if (!(await write("crm_set_showroom_keys", { p_id: id, p_on: on }))) return false;
      setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === id ? { ...r, keys: on } : r)) }));
      return true;
    },
    async orderRooms(ids) {
      // On screen at once; put back if the database refuses.
      const before = data().rooms, rank = new Map(ids.map((id, i) => [id, i]));
      setData(d => ({ ...d, rooms: [...d.rooms].sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6)) }));
      if (await write("crm_set_showroom_order", { p_ids: ids })) return true;
      setData(d => ({ ...d, rooms: before }));
      return false;
    },
    // Delete = gone from the lists, its past visits keep their showroom; refused while visits are upcoming (crm_delete_showroom,
    // the desktop's rule — v3 T07 links the two).
    async removeRoom(id) {
      if (!data().rooms.some(r => r.id === id)) return false;
      if (!(await write("crm_delete_showroom", { p_id: id }))) return false;
      setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === id ? { ...r, active: false, deleted: true } : r)) }));
      return true;
    },
  };
  return api;
}
