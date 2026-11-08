import { describe, expect, it } from "vitest";
import { nowPlaying, onlyOneAudio } from "./one-audio";

// docs/design_handoff_crm/fixes/voice-and-dates.md §1: two voice notes started one after the other — the first stops.
describe("only one voice note plays at a time", () => {
  it("a note that starts pauses the one playing", () => {
    onlyOneAudio();
    const a = document.createElement("audio"), b = document.createElement("audio");
    document.body.append(a, b);
    let aPlaying = true;
    Object.defineProperty(a, "paused", { get: () => !aPlaying });
    a.pause = () => { aPlaying = false; };
    a.dispatchEvent(new Event("play"));
    expect(nowPlaying()).toBe(a);
    Object.defineProperty(b, "paused", { get: () => false });
    b.dispatchEvent(new Event("play"));
    expect(aPlaying).toBe(false);
    expect(nowPlaying()).toBe(b);
  });
});
