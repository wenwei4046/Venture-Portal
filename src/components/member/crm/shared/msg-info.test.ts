import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { forwardChats, messageInfo } from "./msg-info";

const cust = (id: string, name: string, at: string, channel: "whatsapp" | "messenger" = "whatsapp") =>
  ({ id, name, channel, assignedTo: "s1", createdAt: at, messages: [{ id: id + "m", from: "lead", kind: "text", text: "hi", at }] }) as unknown as CrmCustomer;

describe("the message menu's Info and Forward (2026-10-14)", () => {
  it("says when a message went, by whom and how far it got", () => {
    const rows = messageInfo({ id: "a", from: "me", kind: "text", text: "hi", at: "2026-10-14T03:45:00Z", status: "read", by: "s1" }, { name: "Kaiyee", channel: "whatsapp", assignedTo: "s1" }, () => "PETER");
    expect(rows.find(r => r[0] === "Status")?.[1]).toBe("Read ✓✓");
    expect(rows.find(r => r[0] === "Sent by")?.[1]).toBe("PETER");
    expect(rows.find(r => r[0] === "Channel")?.[1]).toBe("WhatsApp");
    const failed = messageInfo({ id: "b", from: "me", kind: "video", text: "", at: "2026-10-14T03:45:00Z", status: "failed", error: "131053 Media upload error", media: { kind: "video", url: "/m" } }, { name: "K", channel: "whatsapp", assignedTo: null }, () => "");
    expect(failed.find(r => r[0] === "Status")?.[1]).toBe("Not delivered · 131053 Media upload error");
    expect(failed.find(r => r[0] === "Type")?.[1]).toBe("Video");
    expect(messageInfo({ id: "c", from: "lead", kind: "text", text: "yo", at: "2026-10-14T03:45:00Z" }, { name: "Lim", channel: "messenger", assignedTo: null }, () => "")[1]).toEqual(["From", "Lim"]);
  });
  it("offers every other chat to forward to, newest first", () => {
    const list = forwardChats([cust("a", "Ann", "2026-10-13T00:00:00Z"), cust("b", "Ben", "2026-10-14T00:00:00Z", "messenger"), cust("c", "Cat", "2026-10-12T00:00:00Z")], "a", () => "PETER");
    expect(list.map(c => c.name)).toEqual(["Ben", "Cat"]);
    expect(list[0].sub).toBe("Messenger · PETER");
  });
});
