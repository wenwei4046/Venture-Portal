/**
 * Profile (design 3b): the card, View my team (only with people below), and
 * the workspace — Notifications, Auto-reply (welcome, outside opening hours
 * with its times, keyword replies, a picture each), Quick replies (shared
 * with the chat's + and "/").
 */
import type { ChangeEvent } from "react";
import { DEFAULT_QUICK_REPLIES, type CrmAutoReplySet } from "@/lib/member/crm-data";
import { downlineOf, jobTitle, titleOf } from "../../shared/people";
import { firstName, ini, stop, type SalesCtx } from "./common";
import { isReadNotif, salesNotifs } from "./notifs";

const swv = (on: boolean) => ({ Bg: on ? "#387557" : "#D9C7BA", X: on ? "21px" : "3px" });
const to12 = (hhmm: string) => { const [H, M] = hhmm.split(":").map(Number); return { h: H % 12 || 12, m: M, ap: (H < 12 ? "AM" : "PM") as "AM" | "PM" }; };
const lbl = (hhmm: string) => { const t = to12(hhmm); return `${t.h}:${String(t.m).padStart(2, "0")} ${t.ap}`; };

export function profileVM(ctx: SalesCtx) {
  const { ui, set, patch, data, owner, viewingOther, act, embedded } = ctx;
  // Unread | Read (rev 1010 §6): an update is read once tapped; an invitation stays unread until answered.
  const notifs = salesNotifs(ctx), isRead = (n: (typeof notifs)[number]) => isReadNotif(n, data);
  const unread = notifs.filter(n => !isRead(n)).length, nTab = ui.nTab;
  const vis = notifs.filter(n => (nTab === "unread") === !isRead(n));
  const team = viewingOther ? [] : downlineOf(owner.id, data.people).map(id => data.people.find(p => p.id === id)!).filter(Boolean);
  const K = { share: ["#BD4A19", "#FFF0E4", "M16 11a4 4 0 1 0-8 0M4 20a8 8 0 0 1 16 0M19 8v6M16 11h6"], move: ["#2F6FB5", "#E4EDF8", "M5 12h14m-5-5 5 5-5 5"] } as const;

  // Quick replies: the person's list, or the design's starters until they keep their own.
  const qrs = data.quickReplies.length ? data.quickReplies : DEFAULT_QUICK_REPLIES.map((q, i) => ({ id: "d" + i, ...q }));
  const setQ = (i: number, p: { shortcut?: string; message?: string }) => act.editQuickReplies(qrs.map((q, j) => (j === i ? { ...q, ...p } : q)));

  // Auto-replies.
  const AR = data.autoReplies;
  const setAR = (f: (a: CrmAutoReplySet) => CrmAutoReplySet) => act.saveAutoReplies(f(AR));
  const imgOf = (o: { img?: string | null; imgName?: string }, put: (p: { img: string | null; imgName: string }) => void) => ({
    img: o.img || "", imgBg: o.img ? `url(${o.img})` : "", imgName: o.imgName || "", noImg: !o.img,
    pickImg: async (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const url = await act.uploadAutoReplyImage(file); if (url) put({ img: url, imgName: file.name }); },
    rmImg: () => put({ img: null, imgName: "" }),
  });
  const W = AR.welcome, A = AR.after;
  const tp = ui.tp, setTp = (p: Partial<NonNullable<typeof ui.tp>>) => set(u => (u.tp ? { ...u, tp: { ...u.tp, ...p } } : u));
  const sel = (on: boolean) => ({ bg: on ? "#4E2F20" : "#F5EBE3", fg: on ? "#fff" : "#3F2B22", weight: on ? 700 : 500 });
  const openTp = (k: "from" | "to") => () => { const t = to12(k === "from" ? A.from : A.to); patch({ tp: { k, ...t, m: [0, 15, 30, 45].includes(t.m) ? t.m : 0 } }); };

  return {
    stop, stopTeam: stop,
    profMain: !ui.profSub, profNotif: ui.profSub === "notif", profAuto: ui.profSub === "auto", profQuick: ui.profSub === "quick",
    meNameX: owner.name, meTitleX: jobTitle(owner), meIniX: ini(owner.name),
    meRankX: owner.role === "rs" ? (owner.fullTime ? "Full time" : "Part time") : "—",
    // No View my team (rev 1010 §7.3): team views live on the Team side.
    hasTeam: false, teamSub: team.map(p => firstName(p.name)).join(", "),
    teamOpen: ui.teamOpen, openTeam: () => patch({ teamOpen: true }), closeTeam: () => patch({ teamOpen: false }),
    teamList: team.map(p => ({ name: p.name, title: titleOf(p), ini: ini(p.name), go: () => { set(u => ({ ...u, teamOpen: false, chat: null, tab: "inbox", filter: null })); embedded?.onSwitch?.(p.id); } })),
    hasNotifBadge: unread > 0, notifBadge: unread ? String(unread) : "",
    openNotif: () => patch({ profSub: "notif", nTab: "unread" }),
    nTabs: ([["unread", "Unread", unread], ["read", "Read", 0]] as const).map(([k, label, n]) => ({
      label, n: n || 0, pick: () => patch({ nTab: k }), bg: nTab === k ? "#fff" : "transparent", fg: nTab === k ? "#3F2B22" : "#806B60", weight: nTab === k ? 650 : 500, shadow: nTab === k ? "0 1px 3px rgba(63,43,34,.12)" : "none" })),
    // Mark all as read: every update, never an invitation still to answer.
    canMarkAll: nTab === "unread" && notifs.some(n => !n.pending && !isRead(n)),
    markAll: () => act.readNotifs(notifs.filter(n => !n.pending && !isRead(n)).map(n => n.id), true),
    nEmpty: !vis.length, nEmptyText: nTab === "unread" ? "You're all caught up." : "Nothing read yet.",
    openAuto: () => patch({ profSub: "auto" }), openQuick: () => patch({ profSub: "quick" }),
    // Pending invitations stay as cards; once answered they move into Updates.
    hasInv: vis.some(n => n.pending),
    notifInv: vis.filter(n => n.pending).map(n => ({
      text: n.text, lead: n.lead, at: n.at, ini: n.ini, c: K[n.kind === "move" ? "move" : "share"][0], bg: K[n.kind === "move" ? "move" : "share"][1], icon: K[n.kind === "move" ? "move" : "share"][2],
      pending: true, done: false, doneLabel: "", doneFg: "", doneBg: "",
      accept: () => { if (n.inviteId) void act.answerInvite(n.inviteId, true); }, decline: () => { if (n.inviteId) void act.answerInvite(n.inviteId, false); },
    })),
    hasUpd: vis.some(n => !n.pending),
    notifUpd: vis.filter(n => !n.pending).map((n, k) => ({
      unread: !isRead(n), weight: isRead(n) ? 500 : 650, fg: isRead(n) ? "#806B60" : "#3F2B22", open: () => { if (!isRead(n)) act.readNotifs([n.id]); },
      text: n.text, meta: n.lead ? `${n.lead} · ${n.at}` : n.at, rule: k ? "1px solid #EBDDD2" : "0",
      c: n.ok ? "#387557" : "#A3371A", bg: n.ok ? "#E4F1E8" : "#FBEAE6", icon: n.ok ? "m5 12 5 5 9-10" : "M6 6l12 12M18 6 6 18",
    })),
    qrRows: qrs.map((q, i) => ({
      title: q.shortcut, text: q.message,
      setTitle: (e: ChangeEvent<HTMLInputElement>) => setQ(i, { shortcut: e.target.value }),
      setText: (e: ChangeEvent<HTMLTextAreaElement>) => setQ(i, { message: e.target.value }),
      remove: () => act.editQuickReplies(qrs.filter((_, j) => j !== i)),
    })),
    qrRowAdd: () => act.editQuickReplies([...qrs, { id: "n" + Date.now(), shortcut: "", message: "" }]),
    arW: { ...imgOf(W, p => setAR(a => ({ ...a, welcome: { ...a.welcome, ...p } }))), text: W.text, op: W.on ? 1 : 0.5, ...swv(W.on),
      toggle: () => setAR(a => ({ ...a, welcome: { ...a.welcome, on: !a.welcome.on } })),
      type: (e: ChangeEvent<HTMLTextAreaElement>) => { const text = e.target.value; setAR(a => ({ ...a, welcome: { ...a.welcome, text } })); } },
    arA: { ...imgOf(A, p => setAR(a => ({ ...a, after: { ...a.after, ...p } }))), text: A.text, op: A.on ? 1 : 0.5, ...swv(A.on),
      fromLbl: lbl(A.from), toLbl: lbl(A.to), openFrom: openTp("from"), openTo: openTp("to"),
      toggle: () => setAR(a => ({ ...a, after: { ...a.after, on: !a.after.on } })),
      type: (e: ChangeEvent<HTMLTextAreaElement>) => { const text = e.target.value; setAR(a => ({ ...a, after: { ...a.after, text } })); } },
    arKws: AR.kws.map(kw => {
      const up = (p: Partial<typeof kw>) => setAR(a => ({ ...a, kws: a.kws.map(x => (x.id === kw.id ? { ...x, ...p } : x)) }));
      return { ...imgOf(kw, p => up(p)), words: kw.words, text: kw.text, state: kw.on ? "On" : "Off", op: kw.on ? 1 : 0.6, onBg: swv(kw.on).Bg, onX: swv(kw.on).X,
        toggle: () => up({ on: !kw.on }),
        typeW: (e: ChangeEvent<HTMLInputElement>) => up({ words: e.target.value }), typeT: (e: ChangeEvent<HTMLTextAreaElement>) => up({ text: e.target.value }),
        remove: () => setAR(a => ({ ...a, kws: a.kws.filter(x => x.id !== kw.id) })) };
    }),
    arAdd: () => setAR(a => ({ ...a, kws: [...a.kws, { id: String(Date.now()), on: true, words: "", text: "" }] })),
    tpOpen: !!tp, tpClose: () => patch({ tp: null }), tpTitle: tp ? (tp.k === "from" ? "Opens at" : "Closes at") : "",
    tpHours: Array.from({ length: 12 }, (_, i) => i + 1).map(v => ({ t: String(v), ...sel(!!tp && tp.h === v), pick: () => setTp({ h: v }) })),
    tpMins: [0, 15, 30, 45].map(v => ({ t: String(v).padStart(2, "0"), ...sel(!!tp && tp.m === v), pick: () => setTp({ m: v }) })),
    tpAps: (["AM", "PM"] as const).map(v => ({ t: v, ...sel(!!tp && tp.ap === v), pick: () => setTp({ ap: v }) })),
    tpPreview: tp ? `${tp.h}:${String(tp.m).padStart(2, "0")} ${tp.ap}` : "",
    tpDone: () => {
      if (!tp) return;
      const H = (tp.h % 12) + (tp.ap === "PM" ? 12 : 0), v = `${String(H).padStart(2, "0")}:${String(tp.m).padStart(2, "0")}`;
      setAR(a => ({ ...a, after: { ...a.after, [tp.k]: v } }));
      patch({ tp: null });
    },
  };
}
export type ProfileVM = ReturnType<typeof profileVM>;
