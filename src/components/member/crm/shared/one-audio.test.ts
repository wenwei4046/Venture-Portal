import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { VoiceNote } from "./voice-note";
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

// notes/13 (CRM v4): a scrub on a voice note's waveform starts it through the play button's path (takeTurn), so the
// note playing stops — and only on the release; pressing down on B leaves A playing.
describe("drag-to-scrub keeps one note playing", () => {
  it("A playing → scrub-release on B → A paused, B is the one playing", () => {
    onlyOneAudio();
    const playing = new Set<HTMLMediaElement>();
    const paused = vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(function (this: HTMLMediaElement) { return !playing.has(this); });
    const dur = vi.spyOn(HTMLMediaElement.prototype, "duration", "get").mockReturnValue(20);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { playing.add(this); this.dispatchEvent(new Event("play")); return Promise.resolve(); });
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) { playing.delete(this); this.dispatchEvent(new Event("pause")); });
    try {
      const { container } = render(createElement("div", null, createElement(VoiceNote, { src: "/a.ogg" }), createElement(VoiceNote, { src: "/b.ogg" })));
      const [a, b] = Array.from(container.querySelectorAll("audio"));
      act(() => { fireEvent.loadedMetadata(a); fireEvent.loadedMetadata(b); });
      act(() => { fireEvent.click(container.querySelectorAll("button[aria-label=Play]")[0]); });
      expect(playing.has(a)).toBe(true);
      expect(nowPlaying()).toBe(a);
      const trackB = container.querySelectorAll("[data-voice-track]")[1] as HTMLElement;
      act(() => { fireEvent.pointerDown(trackB, { pointerId: 7, clientX: 0, button: 0, pointerType: "touch" }); });
      // Pressing down on B does not stop A.
      expect(playing.has(a)).toBe(true);
      act(() => { fireEvent.pointerUp(trackB, { pointerId: 7, clientX: 0, pointerType: "touch" }); });
      expect(playing.has(a)).toBe(false);
      expect(playing.has(b)).toBe(true);
      expect(nowPlaying()).toBe(b);
    } finally { paused.mockRestore(); dur.mockRestore(); play.mockRestore(); pause.mockRestore(); }
  });
});
