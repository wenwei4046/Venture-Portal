// Settings › General, editable round 1 (2026-10-18, mig 20261018100000; the owner: "可以，照这三项做"): the database's
// answer is checked before the CRM uses it, the urgency lines every screen draws by follow it, and Suggest a template off
// takes the cold chat's template button away.
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CRM_SETTINGS, settingsFrom } from "./crm-data";
import { replyUrgency, setUrgencyThresholds, URGENCY_THRESHOLDS, type CrmLead } from "./crm";
import { composerVM, initialComposer, type ComposerDom, type ComposerIn } from "@/components/member/crm/sales/vm/composer";

describe("settingsFrom", () => {
  it("keeps today's values when the database gave nothing (before the migration)", () => {
    expect(settingsFrom(null)).toEqual({ replySoonH: 3, replyUrgentH: 6, replyOverdueH: 9, suggestTemplate: true, autoAssign: true, pushMessages: true, reminders: true });
    expect(settingsFrom(undefined)).toEqual(DEFAULT_CRM_SETTINGS);
  });
  it("takes saved values", () => {
    expect(settingsFrom({ replySoonH: 2, replyUrgentH: 4, replyOverdueH: 8, suggestTemplate: false, autoAssign: false, pushMessages: false, reminders: false }))
      .toEqual({ replySoonH: 2, replyUrgentH: 4, replyOverdueH: 8, suggestTemplate: false, autoAssign: false, pushMessages: false, reminders: false });
  });
  it("refuses lines that do not rise within 1–24 h, keeping 3 · 6 · 9", () => {
    for (const bad of [{ replySoonH: 6, replyUrgentH: 6, replyOverdueH: 9 }, { replySoonH: 0, replyUrgentH: 6, replyOverdueH: 9 }, { replySoonH: 3, replyUrgentH: 6, replyOverdueH: 25 }, { replySoonH: 2.5, replyUrgentH: 6, replyOverdueH: 9 }])
      expect(settingsFrom(bad)).toMatchObject({ replySoonH: 3, replyUrgentH: 6, replyOverdueH: 9 });
  });
});

describe("the urgency lines follow Settings", () => {
  afterEach(() => setUrgencyThresholds(null));
  const at = (h: number) => new Date(2026, 9, 2, 12 - h);
  const now = new Date(2026, 9, 2, 12);
  const waiting = (h: number): CrmLead => ({ id: "x", name: "x", phone: "", adName: "", campaign: "", status: "new", createdAt: "2026-09-30T02:00:00.000Z", unread: 0,
    messages: [{ id: "m", from: "lead", text: "", at: at(h).toISOString() }] });
  it("3 · 6 · 9 h by default", () => {
    setUrgencyThresholds(undefined);
    expect([2, 3, 6, 9].map(h => replyUrgency(waiting(h), now).level)).toEqual(["none", "soon", "urgent", "overdue"]);
  });
  it("2 · 4 · 8 h once saved", () => {
    setUrgencyThresholds({ replySoonH: 2, replyUrgentH: 4, replyOverdueH: 8 });
    expect(URGENCY_THRESHOLDS).toEqual({ soonMinutes: 120, urgentMinutes: 240, overdueMinutes: 480 });
    expect([1, 2, 4, 8].map(h => replyUrgency(waiting(h), now).level)).toEqual(["none", "soon", "urgent", "overdue"]);
  });
});

describe("Suggest a template", () => {
  const dom = { shown: null, taH: 24, taRef: { current: null }, focusBox: () => {}, blurBox: () => {}, swap: () => {} } as unknown as ComposerDom;
  const input = (tplOn?: boolean) => ({
    key: "c", state: initialComposer(), set: () => {}, placeholder: "", draft: "", setDraft: () => {}, canSend: false, send: () => {},
    warm: false, openTpl: () => {}, tplOn, reply: null, cancelReply: () => {}, slash: null, rec: null, voiceStart: async () => true, voiceStop: () => {},
    camera: () => {}, tile: () => {}, recents: [], saveRecents: () => {},
  }) as unknown as ComposerIn;
  it("on (and unset): a cold chat offers the template button", () => {
    expect(composerVM(input(), dom)).toMatchObject({ chatCold: true, tplOn: true, tplOff: false });
    expect(composerVM(input(true), dom)).toMatchObject({ tplOn: true, tplOff: false });
  });
  it("off: no button, the line saying the window is shut", () => {
    expect(composerVM(input(false), dom)).toMatchObject({ chatCold: true, tplOn: false, tplOff: true });
  });
});
