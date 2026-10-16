/**
 * What the Control panel changes, on top of everything a chat does (the
 * Principal and the Director reply and book too): send an Organic Lead,
 * move a customer, undo either, the ad rules and full-time allocation, the
 * showrooms, and which notifications are read. Saved first, as everywhere.
 */
import { crmWrite, refreshCrmTemplates, submitCrmTemplate } from "@/app/(member)/member/crm-actions";
import type { CrmData, CrmRoom, CrmTemplate } from "@/lib/member/crm-data";
import type { SalesActions } from "../sales/actions";
import { teamOf } from "../shared/people";
import type { Dispatch, SetStateAction } from "react";

export interface PanelActions extends SalesActions {
  sendTo(customerId: string, staffId: string | null): Promise<boolean>;
  /** Saved: how many leads waiting Over the limit for this ad the database dealt at once (rev 1011 §6.6); false: not saved. */
  /** Names an ad (crm_name_ad, CRM · Manage); an empty name takes the given name off. */
  nameAd(ad: string, name: string): Promise<boolean>;
  saveAdRule(ad: string, label: string, rule: { mode: "even" | "split" | null; split: Record<string, number>; pm: "cnt" | "pct"; pp: Record<string, number>; tm?: Record<string, "even" | "pct" | "cnt"> }): Promise<false | { dealt: number }>;
  saveFtRule(tlId: string, mode: "cnt" | "pct" | "turns", days: number[], vals: Record<string, Record<string, number>>): Promise<boolean>;
  /** Member work type (rev 1011): full time or part time; part time clears their ticked Full time days. */
  setFullTime(staffId: string, on: boolean): Promise<boolean>;
  /** Cold lead templates (rev 1011): save a draft, or save and submit a WhatsApp one for Meta's review. */
  saveTemplate(t: { id: string | null; name: string; ch: CrmTemplate["ch"]; body: string }, submit: boolean): Promise<CrmTemplate | false>;
  templateOn(id: string, on: boolean): Promise<boolean>;
  deleteTemplate(id: string): Promise<boolean>;
  /** Meta's review brought in (on opening the page); the changes arrive with the next read. */
  refreshTemplates(): Promise<void>;
  readNotifs(keys: string[], all?: boolean): void;
  saveRoom(room: Omit<CrmRoom, "id"> & { id: string | null }): Promise<boolean>;
  removeRoom(id: string): Promise<boolean>;
}

export function makePanelActions(base: SalesActions, { live, data, setData }: { live: boolean; data: () => CrmData; setData: Dispatch<SetStateAction<CrmData>> }): PanelActions {
  const write = async (name: Parameters<typeof crmWrite>[0], args: Record<string, unknown>) => {
    if (!live) return { ok: true as const, data: null as unknown };
    const r = await crmWrite(name, args);
    if (!r.ok) { base.toast(r.error); return null; }
    return r;
  };
  return {
    ...base,
    async sendTo(customerId, staffId) {
      if (!(await write("crm_send_to", { p_contact: customerId, p_staff: staffId }))) return false;
      const team = staffId ? teamOf(staffId, data().people)?.id ?? null : null;
      setData(d => ({ ...d, customers: d.customers.map(c => (c.id === customerId ? { ...c, assignedTo: staffId, teamId: team } : c)) }));
      return true;
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
    async saveAdRule(ad, label, rule) {
      const tm = rule.mode === "split" ? rule.tm ?? {} : {};
      const r = await write("crm_save_ad_assign", { p_ad: ad, p_label: label, p_mode: rule.mode, p_team_split: rule.split, p_people_mode: rule.pm, p_people: rule.pp, p_team_modes: tm });
      if (!r) return false;
      setData(d => ({
        ...d,
        adRules: [...d.adRules.filter(r => r.adId !== ad),
          ...(rule.mode ? [{ adId: ad, label, mode: rule.mode, split: rule.split, pm: rule.pm, pp: rule.pp, tm, startedAt: d.adRules.find(r => r.adId === ad)?.startedAt ?? new Date().toISOString() }] : [])],
      }));
      // The leads it dealt arrive with the next read (every 5 s); the toast says how many.
      return { dealt: Number((r.data as { dealt?: number } | null)?.dealt ?? 0) };
    },
    async saveFtRule(tlId, mode, days, vals) {
      if (!(await write("crm_save_fulltime", { p_tl: tlId, p_mode: mode, p_days: days, p_vals: vals }))) return false;
      setData(d => ({ ...d, ftRules: [...d.ftRules.filter(r => r.tlId !== tlId), { tlId, mode, days, vals }] }));
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
      return true;
    },
    // Delete = closed for good: off every booking list; its past visits keep their showroom.
    async removeRoom(id) {
      const room = data().rooms.find(r => r.id === id);
      if (!room) return false;
      if (!(await write("crm_save_showroom_full", { p_id: id, p_name: room.name, p_address: room.address, p_slots: room.slots, p_cap: room.cap, p_weekly: room.weekly, p_blocks: room.blocks, p_active: false }))) return false;
      setData(d => ({ ...d, rooms: d.rooms.map(r => (r.id === id ? { ...r, active: false } : r)) }));
      return true;
    },
  };
}
