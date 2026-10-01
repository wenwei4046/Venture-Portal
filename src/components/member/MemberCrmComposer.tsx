"use client";

import { useEffect, useRef, useState } from "react";
import { clipLength, type CrmAttachment } from "@/lib/member/crm";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";

const EMOJIS = ["😊", "😄", "🙏", "👍", "👌", "🙌", "👏", "💪", "😍", "🥰", "😅", "🤔", "😢", "🎉", "❤️", "🔥",
  "✅", "📅", "📍", "📞", "🏠", "🛏️", "🛋️", "🚚", "💰", "🎁", "⭐", "👋", "🤝", "😉", "🙂", "👀"];

/**
 * The chat's input bar, laid out like WhatsApp: ＋ (a photo or video from the
 * library), the rounded text box with an emoji button inside, 📷 the camera,
 * and a round 🎤 for a voice message that turns into Send once you type.
 * Voice: tap to record, the arrow sends it, × throws it away.
 */
export default function MemberCrmComposer({ placeholder, onText, onAttachment }: {
  placeholder: string;
  onText: (text: string) => void;
  onAttachment: (attachment: CrmAttachment) => void;
}) {
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState("");
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(true);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(tick);
  }, [recording]);

  // Never leave the microphone on when the chat closes.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach(t => t.stop()), []);

  const send = () => { const text = draft.trim(); if (text) { onText(text); setDraft(""); setEmojiOpen(false); } };

  /** Put the emoji where the cursor is, not always at the end. */
  function addEmoji(emoji: string) {
    const el = textRef.current;
    const at = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? at;
    setDraft(draft.slice(0, at) + emoji + draft.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + emoji.length, at + emoji.length); });
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) { setProblem("Only photos and videos can be sent."); return; }
    setProblem("");
    onAttachment({ kind, url: URL.createObjectURL(file), name: file.name });
  }

  async function startRecording() {
    setProblem("");
    setEmojiOpen(false);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setProblem("This browser cannot record voice messages.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      keep.current = true;
      rec.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const length = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
        if (keep.current && chunks.current.length) {
          const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
          onAttachment({ kind: "audio", url: URL.createObjectURL(blob), seconds: length });
        }
        setRecording(false);
        setSeconds(0);
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      rec.start();
      setRecording(true);
    } catch {
      setProblem("Microphone access was blocked. Allow it in the browser to record.");
    }
  }

  function stopRecording(sendIt: boolean) {
    keep.current = sendIt;
    recorder.current?.stop();
  }

  return (
    <div className={c.composerWrap}>
      {problem && <p className={c.composerProblem} role="alert">{problem}</p>}
      {emojiOpen && !recording && <div className={c.emojiTray} role="group" aria-label="Emoji">
        {EMOJIS.map(e => <button key={e} onClick={() => addEmoji(e)} aria-label={`Add ${e}`}>{e}</button>)}
      </div>}
      <input ref={galleryRef} type="file" accept="image/*,video/*" hidden onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*,video/*" capture="environment" hidden onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />

      <div className={c.waBar}>
        {recording ? (
          <>
            <button className={c.waIcon} onClick={() => stopRecording(false)} aria-label="Discard recording"><Icon name="close" size={24} /></button>
            <div className={`${c.waField} ${c.waRecording}`}>
              <span className={c.recDot} aria-hidden="true" />
              <span className={c.recTime} aria-live="polite">Recording {clipLength(seconds)}</span>
            </div>
            <button className={c.waRound} onClick={() => stopRecording(true)} aria-label="Send voice message"><Icon name="arrow" size={22} /></button>
          </>
        ) : (
          <>
            <button className={c.waIcon} onClick={() => galleryRef.current?.click()} aria-label="Send a photo or video"><Icon name="plus" size={26} /></button>
            <div className={c.waField}>
              <input ref={textRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }}
                placeholder={placeholder} aria-label="Reply" />
              <button className={c.waInside} onClick={() => setEmojiOpen(v => !v)} aria-label="Emoji" aria-expanded={emojiOpen}><Icon name={emojiOpen ? "close" : "smile"} size={22} /></button>
            </div>
            <button className={c.waIcon} onClick={() => cameraRef.current?.click()} aria-label="Take a photo or video"><Icon name="camera" size={24} /></button>
            {draft.trim()
              ? <button className={c.waRound} onClick={send} aria-label="Send"><Icon name="arrow" size={22} /></button>
              : <button className={c.waRound} onClick={startRecording} aria-label="Record a voice message"><Icon name="mic" size={22} /></button>}
          </>
        )}
      </div>
    </div>
  );
}
