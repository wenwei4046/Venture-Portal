/**
 * The owner, 2026-11-09, after #984: "聊天室还是无法显示 miss call" — the card was imported into the chats but its markup never
 * reached them (chat-media.cjs is CRLF and the insertion missed). Every chat must draw it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(__dirname, p), "utf8");
describe("every chat draws a missed call", () => {
  it.each(["sales/SalesChat.tsx", "panel/PanelApp.tsx", "desk/DeskApp.tsx"])("%s", f => {
    expect(read(f)).toContain("{!!(m.call) && (<CallCard c={m.call} />)}");
  });
});
