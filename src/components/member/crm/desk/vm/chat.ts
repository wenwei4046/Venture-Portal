/**
 * A chat in the desktop's pane (CRM Desktop rev 1, C2 / D4): the whole conversation in the design's bubbles (ours
 * #F9D5B8, theirs white, on the chat pattern), day pills, the CRM's own lines (taken over, shared, reminded, won / lost,
 * notes), photos / documents / visit cards, ticks (blue once read), and a reply box that sends — text through the
 * phone's own send (24 h window, Messenger's Human Agent), files through sendMedia. The design draws one bubble and a
 * reply box that cannot be typed in; the rest is filled in its style (BUILD-NOTES.md).
 */
import type { CrmChatMessage, CrmCustomer } from "@/lib/member/crm-data";
import { CRM_LOST_REASONS } from "@/lib/member/crm";
import { first, initials } from "./data";
import type { DeskCtx } from "./ctx";

const DAY = 86_400_000;
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
const dayLabel = (iso: string, now: Date) => { const d = day0(new Date(iso)), T = day0(now);
  return d === T ? "Today" : d === T - DAY ? "Yesterday" : T - d < 7 * DAY ? new Date(iso).toLocaleDateString("en-MY", { weekday: "long" }) : new Date(iso).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" }); };

export interface Msg { day: string; sys: string; bell: boolean; inn: boolean; out: boolean; text: string; time: string; tick: string; hasTick: boolean; media: string; mediaHref: string; failed: boolean }

/** The conversation, oldest first, with the CRM's own lines between the messages. */
export function messagesOf(ctx: DeskCtx, c: CrmCustomer): Msg[] {
  const { data, nameOf, now } = ctx;
  type It = { at: string; m?: CrmChatMessage; sys?: string };
  const its: It[] = [...c.messages.filter(m => !data.hiddenMessages.includes(m.id)).map(m => ({ at: m.at, m })),
    ...data.events.filter(e => e.customerId === c.id).map(e => { const to = nameOf(String(e.data.to ?? e.owner ?? "")), k = e.kind as string;
      const by = e.actor ? nameOf(e.actor) : "";
      const sys = k === "moved" ? `${to} took over this chat` : k === "shared" ? `${to} joined the chat` : k === "won" ? "Marked as won" : k === "assigned" ? `${by ? `${by} assigned the chat` : "Assigned"} to ${to}`
        : k === "lost" ? `Marked as lost · ${e.data.reason === "other" && e.data.note ? String(e.data.note) : CRM_LOST_REASONS.find(r => r.value === e.data.reason)?.label ?? ""}`
          : k === "reminded" ? `${by || "Principal"} sent ${to} a reminder to reply · ${time(e.at)}` : "";
      return { at: e.at, sys }; }).filter(x => !!x.sys),
    ...(data.notes ?? []).filter(n => n.customerId === c.id).map(n => ({ at: n.at, sys: `Note by ${n.by ? nameOf(n.by) : "—"}: ${n.text}` }))]
    .sort((a, b) => a.at.localeCompare(b.at));
  let prev = "";
  return its.map(it => { const d = dayLabel(it.at, now), day = d !== prev ? d : ""; prev = d;
    if (it.sys) return { day, sys: it.sys, bell: it.sys.includes("a reminder to reply"), inn: false, out: false, text: "", time: "", tick: "", hasTick: false, media: "", mediaHref: "", failed: false };
    const m = it.m!, mine = m.from === "me";
    const media = m.media ? (m.media.kind === "image" ? "📷 Photo" : `📄 ${m.media.name ?? "Document"}`) : m.card ? `📅 ${m.card.kind} · ${new Date(m.card.start).toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ${m.card.room}` : "";
    return { day, sys: "", bell: false, inn: !mine, out: mine, text: m.card ? "" : m.text ?? "", time: time(m.at), tick: m.status === "read" ? "#3B8FD9" : "#A8968B", hasTick: mine && m.status !== "failed",
      media, mediaHref: m.media ? `/member/crm-media/${m.id}` : "", failed: m.status === "failed" };
  });
}

/** One chat's bindings: the conversation, the reply box and its buttons (the caller names them for Inbox or Awaiting reply). */
export function chatVM(ctx: DeskCtx, id: string | null) {
  const { ui, set, act, data } = ctx;
  const c = id ? data.customers.find(x => x.id === id) : undefined;
  const draft = c ? ui.draft[c.id] ?? "" : "";
  const setD = (v: string) => { if (c) set(u => ({ ...u, draft: { ...u.draft, [c.id]: v } })); };
  const send = () => { if (!c || !draft.trim()) return; const text = draft; setD("");
    void act.send(c.id, text).then(ok => { if (!ok) setD(text); }); };
  const pick = (accept: string) => { if (!c || typeof document === "undefined") return; const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept;
    inp.onchange = () => { const f = inp.files?.[0]; if (f) void act.sendMedia(c.id, f, draft.trim()).then(ok => { if (ok) setD(""); }); }; inp.click(); };
  return {
    c, msgs: c ? messagesOf(ctx, c) : [], draft,
    setDraft: (e: { target: { value: string } }) => setD(e.target.value),
    draftKey: (e: { key: string; shiftKey: boolean; preventDefault(): void }) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } },
    send, micD: draft.trim() ? "M5 12h14M13 6l6 6-6 6" : "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3",
    attach: () => pick("*/*"), photo: () => pick("image/jpeg,image/png"),
    head: c ? { avatar: initials(c.name), title: c.name, sub: c.ad, subColor: "#387557", menu: true } : null,
    owner: c ? (c.assignedTo ? `${ctx.nameOf(c.assignedTo)}'s customer` : "No one yet's customer") : "", reply: c ? `Reply to ${first(c.name)}…` : "",
  };
}
export type ChatVM = ReturnType<typeof chatVM>;
