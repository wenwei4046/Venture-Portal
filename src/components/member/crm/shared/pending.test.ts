import { describe, expect, it } from "vitest";
import type { CrmData } from "@/lib/member/crm-data";
import { keepSending } from "./pending";

const data = (msgs: { id: string; status?: string }[]) => ({ customers: [{ id: "c1", messages: msgs }] }) as unknown as CrmData;

describe("a fresh read keeps what is still being sent", () => {
  it("adds this screen's sending messages to the end of their chat", () => {
    const prev = data([{ id: "a" }, { id: "sending-1", status: "sending" }]);
    const next = data([{ id: "a" }, { id: "b" }]);
    expect(keepSending(prev, next).customers[0].messages.map(m => m.id)).toEqual(["a", "b", "sending-1"]);
  });
  it("leaves the read alone when nothing is being sent", () => {
    const next = data([{ id: "a" }]);
    expect(keepSending(data([{ id: "a", status: "sent" }]), next)).toBe(next);
    expect(keepSending(null, next)).toBe(next);
  });
});
