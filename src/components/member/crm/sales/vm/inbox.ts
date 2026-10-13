/**
 * Inbox (design 3b): search, the chip row (All · Attention · statuses · Cold
 * leads · labels in use), the ad filter sheet, and the rows — channel badge,
 * last-chat time, ad in green, preview, urgency, labels; pinned first, then
 * newest message. Swipe a row left for More (Pin, Mute, Contact info, Label,
 * Block).
 */
import type { ChangeEvent, MouseEvent } from "react";
import { DEFAULT_LABELS, LABEL_SWATCHES, type CrmCustomer, type CrmLabel } from "@/lib/member/crm-data";
import { BORDER, CHANNEL, dayLabel, firstName, ini, INK, isCold, lastChat, lastReal, STATUS_LABEL, stop, timeLabel, urgencyOf, type PEvent, type SalesCtx } from "./common";
import type { InboxFilter } from "../ui";
import { isNewChat } from "../../shared/new-chat";

/** One row's preview: a card we sent reads as what it was; ours start "You: ". */
export function previewOf(c: CrmCustomer): string {
  const m = lastReal(c);
  if (!m) return "";
  if (m.card) return `You: ${m.card.kind === "Reminder" ? "Reminder" : "Calendar invite"} · ${dayLabel(new Date(m.card.start))}, ${timeLabel(new Date(m.card.start))}`;
  return (m.from === "me" ? "You: " : "") + m.text.replace(/\*([^*\n]+)\*/g, "$1");
}

/** The time of the newest message (customer's or ours) — the Inbox's order. */
export const lastAt = (c: CrmCustomer) => {
  const m = lastReal(c);
  return m ? new Date(m.at).getTime() : new Date(c.createdAt).getTime();
};

const OWNER_COLORS = ["#2F6FB5", "#8E4B6E", "#A46312", "#387557", "#3E5C7A"];

export function inboxVM(ctx: SalesCtx) {
  const { ui, set, patch, data, now, mine, refs, act, owner, nameOf } = ctx;
  const labelsOf = (c: CrmCustomer) => (data.customerLabels[c.id] ?? []).map(id => data.labels.find(l => l.id === id)).filter((l): l is CrmLabel => !!l);
  const warm = mine.filter(c => !isCold(c, now));
  const f = ui.filter;
  const match = (c: CrmCustomer) => {
    const cold = isCold(c, now);
    if (f?.type === "cold") return cold;
    if (cold) return false;
    if (!f) return true;
    if (f.type === "status") return STATUS_LABEL[c.status] === f.v;
    if (f.type === "urgency") return urgencyOf(c, now).level !== "none";
    if (f.type === "new") return isNewChat(c);
    return labelsOf(c).some(l => l.name === f.v);
  };
  const usedLabels = data.labels.filter(l => mine.some(c => (data.customerLabels[c.id] ?? []).includes(l.id)));
  const chipDefs: [string, NonNullable<InboxFilter>["type"] | null, string | null, number][] = [
    ["All", null, null, warm.length],
    // New (2026-10-13): not answered by them since it came or was handed to them — shared/new-chat.ts.
    ["New", "new", "#BD4A19", warm.filter(isNewChat).length],
    ["Attention", "urgency", "#A3371A", warm.filter(c => urgencyOf(c, now).level !== "none").length],
    ...([["Follow up", "#A46312"], ["Appointment", "#387557"], ["Won", "#2F6FB5"], ["Lost", "#806B60"]] as const)
      .map(([s, dot]): [string, "status", string, number] => [s, "status", dot, warm.filter(c => STATUS_LABEL[c.status] === s).length]),
    ["Cold leads", "cold", "#3E5C7A", mine.filter(c => isCold(c, now)).length],
    ...usedLabels.map((l): [string, "label", string, number] => [l.name, "label", l.color, warm.filter(c => labelsOf(c).some(x => x.id === l.id)).length]),
  ];
  const chips3b = chipDefs.map(([label, type, dot, n]) => {
    const on = type ? !!f && f.type === type && f.v === label : !f;
    return { label, n, dot, bg: on ? "#BD4A19" : "#fff", fg: on ? "#fff" : INK, border: on ? "#BD4A19" : BORDER, weight: on ? 650 : 500,
      pick: () => patch({ filter: type ? { type, v: label } : null }) };
  });

  // Ad filter: pick one or more ads, Save applies.
  const ads = [...new Set(mine.map(c => c.ad))];
  const draft = ui.adSheet ? ui.adSheet.sel : ui.adSel;
  const nSel = mine.filter(c => !isCold(c, now) && (!draft.length || draft.includes(c.ad))).length;
  const q = ui.q.trim().toLowerCase();
  const pinned = (c: CrmCustomer) => !!data.prefs[c.id]?.pinned;
  const view = mine
    .filter(c => (!ui.adSel.length || ui.adSel.includes(c.ad)) && match(c) && (!q || `${c.name} ${previewOf(c)} ${c.ad}`.toLowerCase().includes(q)))
    .sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || lastAt(b) - lastAt(a));

  const ownerColor = new Map<string, string>();
  const leadsView = view.map((c, n) => {
    const p = data.prefs[c.id], mu = !!p?.muted, pi = !!p?.pinned, cold = isCold(c, now), u = urgencyOf(c, now), ch = CHANNEL[c.channel];
    const shared = c.assignedTo && c.assignedTo !== owner.id;
    if (shared && !ownerColor.has(c.assignedTo!)) ownerColor.set(c.assignedTo!, OWNER_COLORS[ownerColor.size % OWNER_COLORS.length]);
    const firstMarked = ctx.data.visits.filter(v => v.customerId === c.id && (v.state === "attended" || v.state === "no_show")).sort((a, b) => a.start.localeCompare(b.start))[0];
    const open = () => { set(u2 => ({ ...u2, chat: c.id, swipe: null })); act.openChat(c.id); };
    return {
      name: c.name, ini: ini(c.name), ad: c.ad, preview: previewOf(c), when: lastChat(new Date(lastAt(c)).toISOString(), now),
      unread: c.unread, chanName: ch.name, chanFg: ch.fg, chanIcon: ch.icon, cold,
      ownerTag: shared ? firstName(nameOf(c.assignedTo)) : "", ownerC: shared ? ownerColor.get(c.assignedTo!)! : "#806B60",
      urgShow: !cold && u.level !== "none", urg: u.label, urg3b: u.color,
      firstVisit: firstMarked ? `${dayLabel(new Date(firstMarked.start))}, ${timeLabel(new Date(firstMarked.start))}` : "",
      tags: labelsOf(c).map(l => ({ t: l.name, c: l.color })),
      rule: n ? `1px solid ${BORDER}` : "0", isMuted: mu, isPinned: pi, iconRight: c.unread ? "28px" : "0px", padR: `${32 + (mu ? 22 : 0) + (pi ? 22 : 0)}px`,
      // Swipe left reveals More; a tap opens the chat (or closes an open swipe).
      tx: ui.swipe === c.id ? "-84px" : "0px", moreOp: ui.swipe === c.id ? 1 : 0,
      // A long press opens More (user 2026-10-13: "按久久跳出功能鍵"), where Assign to is for whoever may assign.
      down: (e: PEvent) => {
        refs.ls = { x: e.clientX, y: e.clientY };
        clearTimeout(refs.lp);
        refs.lp = setTimeout(() => { refs.ls = null; refs.lsT = Date.now(); navigator.vibrate?.(10); patch({ swipe: null, moreLead: c.id, moreView: "main" }); }, 500);
      },
      cancel: () => { clearTimeout(refs.lp); refs.ls = null; },
      noMenu: (e: MouseEvent) => e.preventDefault(),
      up: (e: PEvent) => {
        clearTimeout(refs.lp);
        const s = refs.ls; refs.ls = null; if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) { refs.lsT = Date.now(); patch({ swipe: dx < 0 ? c.id : null }); }
      },
      open: () => { if (refs.lsT && Date.now() - refs.lsT < 300) return; if (ui.swipe != null) { patch({ swipe: null }); return; } open(); },
      more: (e: PEvent | MouseEvent) => { e.stopPropagation(); patch({ swipe: null, moreLead: c.id, moreView: "main" }); },
    };
  });

  // More sheet + labels.
  const ml = ui.moreLead ? mine.find(c => c.id === ui.moreLead) : undefined;
  const mp = ml ? data.prefs[ml.id] : undefined;
  const closeMore = () => patch({ moreLead: null, moreView: "main" });
  // The design's four labels until the person keeps a list of their own.
  const labelList: { id: string | null; name: string; color: string }[] = data.labels.length ? data.labels : DEFAULT_LABELS.map(l => ({ id: null, ...l }));
  const mine2 = ml ? labelsOf(ml).map(l => l.name) : [];
  const keyOf = (l: { id: string | null; name: string }) => l.id ?? `name:${l.name}`;
  const fm = ui.labelForm ?? { key: null, name: "", color: LABEL_SWATCHES[0] };
  const okName = !!fm.name.trim() && !labelList.some(l => keyOf(l) !== fm.key && l.name.toLowerCase() === fm.name.trim().toLowerCase());
  /** Labels exist in the database before one goes on a customer. */
  const ensure = async () => (data.labels.length ? data.labels : await act.saveLabels(labelList.map(l => ({ name: l.name, color: l.color }))));
  const togglePref = (k: "pinned" | "muted") => async () => { if (!ml) return; closeMore(); await act.setPref(ml.id, { [k]: !mp?.[k] }); };

  return {
    q: ui.q, setQ: (e: ChangeEvent<HTMLInputElement>) => patch({ q: e.target.value }), clearQ: () => patch({ q: "" }),
    inboxToast: !ui.chat && ui.toast ? ui.toast : "",
    chips3b, leadsView, stop,
    adLabel: !ui.adSel.length ? "All ads" : ui.adSel.length === 1 ? ui.adSel[0].split(" · ")[0] : `${ui.adSel.length} ads`,
    adOpen: !!ui.adSheet, openAd: () => patch({ adSheet: { sel: ui.adSel } }), closeAd: () => patch({ adSheet: null }),
    adClear: () => patch({ adSheet: { sel: [] } }),
    adList: ads.map((a, k) => {
      const on = draft.includes(a), first = mine.find(c => c.ad === a), cnt = mine.filter(c => c.ad === a && !isCold(c, now)).length, cc = mine.filter(c => c.ad === a && isCold(c, now)).length;
      return { name: a, chan: first ? CHANNEL[first.channel].name : "", chanFg: first ? CHANNEL[first.channel].fg : "#806B60", n: cnt, s: cnt === 1 ? "" : "s", coldNote: cc ? ` · ${cc} cold` : "", on,
        rule: k ? "1px solid #EBDDD2" : "0", ring: on ? "#BD4A19" : "#D9C7BA", fill: on ? "#BD4A19" : "transparent",
        toggle: () => patch({ adSheet: { sel: on ? draft.filter(x => x !== a) : [...draft, a] } }) };
    }),
    adSaveLabel: draft.length ? `Save · show ${nSel} lead${nSel === 1 ? "" : "s"}` : "Save · all ads",
    adSave: () => patch({ adSel: draft, adSheet: null }),
    moreOpen: !!ml, closeMore, moreLead: ml ? { name: ml.name, ini: ini(ml.name) } : { name: "", ini: "" },
    moreMain: ui.moreView === "main", moreLabels: ui.moreView === "labels", moreLabelEdit: ui.moreView === "labelEdit",
    moreBackMain: () => patch({ moreView: "main" }),
    moreItems: ([
      [mp?.pinned ? "Unpin" : "Pin", "M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z", togglePref("pinned")],
      [mp?.muted ? "Unmute" : "Mute", "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4M3 3l18 18", togglePref("muted")],
      // Opens the chat on its Customer info sheet.
      ["Contact info", "M12 16v-4M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", () => { if (!ml) return; set(u => ({ ...u, moreLead: null, moreView: "main", chat: ml.id, hm: { info: true } })); act.openChat(ml.id); }],
      [mine2.length ? `Label · ${mine2.join(", ")}` : "Label", "M3 12V4h8l10 10-8 8L3 12Zm5-4h.01", () => patch({ moreView: "labels" })],
      // Assign to (user 2026-10-13): for whoever may assign (the Principal / Director in someone's CRM) — the chat's own
      // Assign to sheet, opened over the chat.
      ...(ctx.embedded?.assignTo ? [["Assign to", "M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3", () => { if (!ml) return; set(u => ({ ...u, moreLead: null, moreView: "main", chat: ml.id, hm: { assign: true, sel: null } })); act.openChat(ml.id); }] as [string, string, () => void]] : []),
    ] as [string, string, () => void][]).map(([label, icon, go], k) => ({ label, icon, go, rule: k ? "1px solid #EBDDD2" : "0" })),
    // Block: off this person's Inbox and Contacts (the customer stays in the CRM; WhatsApp itself is not told).
    moreBlockLabel: ml ? `Block ${ml.name}` : "",
    moreBlock: async () => { if (!ml) return; const name = ml.name; closeMore(); await act.setPref(ml.id, { blocked: true, hidden: true }); act.toast(`${name} blocked · removed from your Inbox`); },
    labelItems: labelList.map((l, k) => {
      const on = mine2.includes(l.name);
      return { label: l.name, dot: l.color, rule: k ? "1px solid #EBDDD2" : "0", on, ring: on ? "#BD4A19" : "#D9C7BA", fill: on ? "#BD4A19" : "transparent",
        edit: (e: MouseEvent) => { e.stopPropagation(); patch({ moreView: "labelEdit", labelForm: { key: keyOf(l), name: l.name, color: l.color } }); },
        go: async () => {
          if (!ml) return;
          const saved = await ensure();
          const lab = saved?.find(x => x.name.toLowerCase() === l.name.toLowerCase());
          if (lab) await act.setLabel(ml.id, lab.id, !on);
        } };
    }),
    labelNew: () => patch({ moreView: "labelEdit", labelForm: { key: null, name: "", color: LABEL_SWATCHES[0] } }),
    labelFormBack: () => patch({ moreView: "labels" }),
    labelFormTitle: fm.key == null ? "New label" : "Edit label",
    labelFormName: fm.name, labelCanDelete: fm.key != null,
    labelSetName: (e: ChangeEvent<HTMLInputElement>) => patch({ labelForm: { ...fm, name: e.target.value } }),
    labelSwatches: LABEL_SWATCHES.map(c => ({ c, ring: c === fm.color ? "#fff" : c, pick: () => patch({ labelForm: { ...fm, color: c } }) })),
    labelSaveBg: okName ? "#BD4A19" : "#D9C7BA", labelSaveCur: okName ? "pointer" : "default",
    labelSave: okName ? async () => {
      const nm = fm.name.trim();
      const next = fm.key == null ? [...labelList.map(l => ({ id: l.id, name: l.name, color: l.color })), { id: null, name: nm, color: fm.color }]
        : labelList.map(l => (keyOf(l) === fm.key ? { id: l.id, name: nm, color: fm.color } : { id: l.id, name: l.name, color: l.color }));
      if (await act.saveLabels(next)) patch({ moreView: "labels", labelForm: null });
    } : undefined,
    labelDelete: async () => {
      if (fm.key == null) return;
      if (await act.saveLabels(labelList.filter(l => keyOf(l) !== fm.key).map(l => ({ id: l.id, name: l.name, color: l.color })))) patch({ moreView: "labels", labelForm: null });
    },
  };
}
export type InboxVM = ReturnType<typeof inboxVM>;
