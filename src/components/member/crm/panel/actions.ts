/**
 * What the Control panel changes, on top of everything a chat does (the
 * Principal and the Director reply and book too): send an Organic Lead,
 * move a customer, undo either, the ad rules and full-time allocation, the
 * showrooms, and which notifications are read. Saved first, as everywhere.
 */
import { crmWrite } from "@/app/(member)/member/crm-actions";
import type { CrmData, CrmRoom } from "@/lib/member/crm-data";
import type { SalesActions } from "../sales/actions";
import { teamOf } from "../shared/people";
import type { Dispatch, SetStateAction } from "react";

export interface PanelActions extends SalesActions {
  sendTo(customerId: string, staffId: string | null): Promise<boolean>;
  saveAdRule(ad: string, label: string, rule: { mode: "even" | "split" | "people" | null; split: Record<string, number>; pm: "cnt" | "pct"; pp: Record<string, number>; tm?: Record<string, "even" | "pct" | "cnt"> }): Promise<boolean>;
  saveFtRule(tlId: string, mode: "cnt" | "pct" | "turns", days: number[], vals: Record<string, Record<string, number>>): Promise<boolean>;
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
    async saveAdRule(ad, label, rule) {
      if (!(await write("crm_save_ad_assign", { p_ad: ad, p_label: label, p_mode: rule.mode, p_team_split: rule.split, p_people_mode: rule.pm, p_people: rule.pp }))) return false;
      setData(d => ({
        ...d,
        adRules: [...d.adRules.filter(r => r.adId !== ad),
          ...(rule.mode ? [{ adId: ad, label, mode: rule.mode, split: rule.split, pm: rule.pm, pp: rule.pp, startedAt: d.adRules.find(r => r.adId === ad)?.startedAt ?? new Date().toISOString() }] : [])],
      }));
      return true;
    },
    async saveFtRule(tlId, mode, days, vals) {
      if (!(await write("crm_save_fulltime", { p_tl: tlId, p_mode: mode, p_days: days, p_vals: vals }))) return false;
      setData(d => ({ ...d, ftRules: [...d.ftRules.filter(r => r.tlId !== tlId), { tlId, mode, days, vals }] }));
      return true;
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
