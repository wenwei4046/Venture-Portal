/**
 * An inbox search finds what was said anywhere in a chat (the owner, 2026-10-28: "输入某些字，聊天记录有聊到的也能被筛选出来").
 */
import { describe, expect, it, vi } from "vitest";
import type { CrmChatMessage, CrmCustomer, CrmData, CrmPerson } from "@/lib/member/crm-data";
import type { DeskCtx } from "../desk/vm/ctx";
import { inboxVM } from "../desk/vm/inbox";
import { saidInChat, snippetAround } from "./chat-search";

const msg = (id: string, from: "lead" | "me", text: string, at: string): CrmChatMessage => ({ id, from, kind: "text", text, at });

describe("saidInChat / snippetAround", () => {
  const c = { messages: [msg("1", "lead", "Astrum Ampang 2R1R", "2026-10-25T01:00:00Z"), msg("2", "me", "OK", "2026-10-25T01:01:00Z"), msg("3", "lead", "我想做 GRR 短租", "2026-10-25T02:00:00Z")] };
  it("finds the newest message holding the words, either side, any case", () => {
    expect(saidInChat(c, "astrum")?.id).toBe("1");
    expect(saidInChat(c, "grr")?.id).toBe("3");
    expect(saidInChat(c, "dual key")).toBeNull();
    expect(saidInChat(c, "")).toBeNull();
  });
  it("cuts a long message round the words", () => {
    const long = `${"a".repeat(60)} 年尾拿钥匙 ${"b".repeat(60)}`;
    const s = snippetAround(long, "年尾拿钥匙", 20);
    expect(s).toContain("年尾拿钥匙");
    expect(s.startsWith("…") && s.endsWith("…")).toBe(true);
    expect(snippetAround("short words", "words")).toBe("short words");
  });
});

describe("the desktop Inbox's search reads the whole chat", () => {
  const ME: CrmPerson = { id: "boss", name: "BOSS", role: "boss", uplineId: null, fullTime: false };
  const customer = (id: string, name: string, messages: CrmChatMessage[]): CrmCustomer => ({
    id, name, phone: "60123456789", channel: "whatsapp", adId: null, ad: "WhatsApp · no ad", status: "follow_up", wonAmount: null,
    assignedTo: "boss", teamId: null, lastCustomerAt: messages.at(-1)?.at ?? null, createdAt: "2026-10-20T02:00:00Z", unread: 0, messages,
    details: { type: "", size: "", loc: "", req: "", budget: "" }, detailsSaved: false,
  });
  const ctxWith = (q: string) => ({
    data: {
      people: [ME], customers: [
        customer("wah", "Wah Leong", [msg("w1", "lead", "我unit 目前做完了defect check，钥匙还没有拿回。", "2026-10-25T01:00:00Z"), msg("w2", "me", "好的，周末见", "2026-10-25T02:00:00Z")]),
        customer("vivi", "vivi", [msg("v1", "lead", "空空", "2026-10-26T01:00:00Z")]),
      ],
      visits: [], shares: [], invites: [], prefs: {}, events: [], notifRead: [], notifsSeenAt: null, notifDeleted: [], can: { viewAll: true, editOwn: true, editAll: true, manage: true },
    } as unknown as CrmData,
    me: ME, now: new Date("2026-10-27T04:00:00Z"), live: true, act: {}, patch: vi.fn(), set: vi.fn(), teams: [], directors: [],
    nameOf: () => "BOSS", ui: { tab: "inbox", inbF: "All", ibQ: q, whoSel: [], pane: "docked", chat: null }, exit: () => {},
  }) as unknown as DeskCtx;

  it("an earlier message's words find the chat, and its row shows that message", () => {
    const rows = inboxVM(ctxWith("钥匙")).list4.rows;
    expect(rows.map(r => r.name)).toEqual(["Wah Leong"]);
    expect(rows[0].msg).toContain("钥匙还没有拿回");
  });
  it("a name still finds it, showing the last message as before", () => {
    const rows = inboxVM(ctxWith("vivi")).list4.rows;
    expect(rows.map(r => [r.name, r.msg])).toEqual([["vivi", "空空"]]);
  });
});
