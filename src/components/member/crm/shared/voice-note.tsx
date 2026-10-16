"use client";

import { useEffect, useRef, useState } from "react";
import { typePx } from "./type";

/**
 * A voice note drawn as WhatsApp draws one (the owner, 2026-10-14, WhatsApp's voice message beside our audio player):
 * the speaker's round picture with a small mic, a play button, a waveform that fills as it plays (a tap on it jumps
 * there), the time under it. The waveform is a fixed pattern from the note's address — the file is not decoded only to
 * draw it. Later the same day ("語音可以加速播放 1X, 1.25X, 1.5X, 2X"; "畫面改小一點", then "語音氣泡可以稍微大一點點" — 236 px): once it has played the
 * picture becomes the speed — 1× · 1.25× · 1.5× · 2×, a tap for the next — as WhatsApp's does; the speed is kept for the
 * next note. 2026-10-15 ("看起來上下的 ratio 調一下"): the duration sits at the end of the waveform's row, so every part
 * centres on the waveform's line and the time (with "Sent by …") is the bubble's one row under it — it was three rows
 * when somebody else sent it: the controls, the duration alone, then the time.
 */
const BARS = 28;
export const SPEEDS = [1, 1.25, 1.5, 2] as const;
let lastSpeed: number = 1;
function bars(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Array.from({ length: BARS }, () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return 0.25 + ((h >>> 0) % 1000) / 1333; });
}
const clock = (s: number) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
export const nextSpeed = (s: number) => SPEEDS[(SPEEDS.indexOf(s as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
export const speedLabel = (s: number) => `${s}×`;

export function VoiceNote({ src, mine }: { src: string; mine?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [at, setAt] = useState(0);
  const [dur, setDur] = useState(0);
  const [speed, setSpeed] = useState(lastSpeed);
  const shape = useRef(bars(src));
  useEffect(() => { shape.current = bars(src); }, [src]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    a.playbackRate = speed;
    if (a.paused) { setStarted(true); void a.play().catch(() => {}); } else a.pause();
  };
  const faster = () => { const s = nextSpeed(speed); lastSpeed = s; setSpeed(s); };
  const seek = (e: React.MouseEvent<HTMLSpanElement>) => {
    const a = audio.current, r = e.currentTarget.getBoundingClientRect();
    if (!a || !dur) return;
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
    setAt(a.currentTime);
  };
  const done = dur ? at / dur : 0;
  // On your own bubble — the brand's orange since 2026-10-15 (shared/chat-media.ts › MINE_BG) — the controls are white.
  const ink = mine ? "#fff" : "#6B7B8C", dim = mine ? "rgba(255,255,255,.42)" : "rgba(107,123,140,.35)";

  return (
    // WhatsApp's layout (the owner, 2026-10-15, WhatsApp's voice bubble beside ours: "人 icon 至中（較大），語音 bar 也至中"):
    // play on the left, the waveform in the middle with its duration under it, the speaker's 52px picture on the right
    // centred on the whole bubble (the speed takes its place once played); the bubble's time sits on the duration's line,
    // left of the picture (`mediaOf` › audio: `timeTop` −18px, `inPad` 62px on the right).
    <span style={{ display: "flex", alignItems: "center", gap: "8px", width: "248px", maxWidth: "100%", minHeight: "56px", padding: "2px 0" }}>
      <audio ref={audio} src={src} preload="metadata"
        onLoadedMetadata={e => { const d = e.currentTarget.duration; e.currentTarget.playbackRate = speed; if (Number.isFinite(d)) setDur(d); }}
        onDurationChange={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) setDur(d); }}
        onTimeUpdate={e => setAt(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setAt(0); }} style={{ display: "none" }} />
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} style={{ flex: "none", width: "36px", height: "36px", borderRadius: "18px", border: 0, background: "transparent", color: ink, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">{playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}</svg>
      </button>
      <span style={{ flex: "1", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "3px", paddingTop: "12px" }}>
        <span onClick={seek} style={{ position: "relative", height: "28px", display: "flex", alignItems: "center", gap: "2px", cursor: "pointer" }}>
          {shape.current.map((v, i) => (
            <span key={i} style={{ flex: "1", height: `${Math.round(v * 100)}%`, minHeight: "3px", borderRadius: "2px", background: i / BARS < done ? ink : dim }} />
          ))}
          <span style={{ position: "absolute", left: `calc(${done * 100}% - 5px)`, top: "50%", width: "10px", height: "10px", marginTop: "-5px", borderRadius: "5px", background: ink }} />
        </span>
        <span style={{ height: "14px", fontSize: typePx(11), lineHeight: "14px", color: ink, fontVariantNumeric: "tabular-nums" }}>{clock(playing || at ? at : dur)}</span>
      </span>
      {started
        ? <button type="button" onClick={faster} aria-label={`Speed ${speedLabel(speed)}`} title="Playback speed"
            style={{ flex: "none", width: "52px", height: "30px", borderRadius: "15px", border: 0, background: mine ? "rgba(255,255,255,.24)" : "#6B7B8C", color: "#fff", fontSize: typePx(12), fontWeight: 700, display: "grid", placeItems: "center", cursor: "pointer", padding: 0, fontVariantNumeric: "tabular-nums" }}>{speedLabel(speed)}</button>
        : <span style={{ position: "relative", flex: "none", width: "52px", height: "52px", borderRadius: "26px", background: mine ? "#F3B9A0" : "#D9E2EA", display: "grid", placeItems: "center", color: mine ? "#B2452A" : "#4E6478" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0v1H5v-1Z" /></svg>
            <span style={{ position: "absolute", left: "-5px", bottom: "-1px", color: ink, display: "grid" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke={mine ? "#BD4A19" : "#fff"} strokeWidth="1.2"><path d="M12 2.5a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0v-6a3 3 0 0 0-3-3Z" /><path d="M18 11a6 6 0 0 1-12 0M12 17v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
          </span>}
    </span>
  );
}
