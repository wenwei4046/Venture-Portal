import { describe, expect, it } from "vitest";
import { oneAtATime } from "./once";

describe("oneAtATime", () => {
  it("drops a second tap while the first is still sending (no double message to the customer)", async () => {
    let sent = 0, release!: () => void;
    const send = () => new Promise<boolean>(r => { sent++; release = () => r(true); });
    const first = oneAtATime("send:c1", send);
    const second = oneAtATime("send:c1", send);
    expect(await second).toBeUndefined();
    release();
    expect(await first).toBe(true);
    expect(sent).toBe(1);
  });

  it("lets the next send through once the first is done, and other chats at any time", async () => {
    expect(await oneAtATime("send:c1", async () => 1)).toBe(1);
    expect(await oneAtATime("send:c1", async () => 2)).toBe(2);
    let release!: () => void;
    const slow = oneAtATime("send:c1", () => new Promise<number>(r => { release = () => r(3); }));
    expect(await oneAtATime("send:c2", async () => 4)).toBe(4);
    release();
    expect(await slow).toBe(3);
  });

  it("frees the key when a send fails", async () => {
    await expect(oneAtATime("book:c1", async () => { throw new Error("refused"); })).rejects.toThrow("refused");
    expect(await oneAtATime("book:c1", async () => true)).toBe(true);
  });
});
