"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * A chat's + sheet (the owner, 2026-10-14: "在 + 號中的功能，相冊（用於選照片，影片）、document / file、quick reply、auto
 * reply"): Photos & videos · Document · Quick replies · Auto replies — the same in the Team chat (whose + picked any
 * file and sent it at once) and, for the two lists, Mine's chat. A quick reply or an auto reply goes into the reply box,
 * to be read and sent. Mounted once by CrmApp.
 * Later the same day ("有幾個功能是重複的"): **Camera** (a photo or a video, the camera itself) · **Photos** (pick photos /
 * videos) · **Document** (files only — `DOC_ACCEPT` names no photo or video type, so the iPhone opens Files straight
 * away instead of offering Take Photo and Photo Library again).
 */
/**
 * Where the hidden Photos / Document pickers sit: invisible, just above the + button. The iPhone's own menu (Photo
 * Library · Take Photo or Video · Choose Files) cannot be skipped by a web page, but it opens beside the picker — hidden
 * with display: none it floated over the middle of the chat (the owner, 2026-10-14: "Photo 功能鍵會漂浮").
 */
export const PICKER_AT = { position: "fixed", left: "28px", bottom: "calc(var(--safe-bottom, 0px) + 64px)", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" } as const;
/** What Document picks: documents, never photos or videos (those are Camera's and Photos'). */
export const DOC_ACCEPT = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".ods", ".csv", ".ppt", ".pptx", ".odp", ".odt", ".rtf", ".txt", ".md",
  ".json", ".xml", ".log", ".zip", ".rar", ".7z", ".pages", ".numbers", ".key",
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "text/plain", "text/csv",
].join(",");
export type TextChoice = { label: string; text: string };
export type AttachSheet = {
  camera?: () => void; photos?: () => void; document?: () => void;
  quick: TextChoice[]; auto: TextChoice[]; pick: (text: string) => void;
  view?: "" | "quick" | "auto";
};

let state: AttachSheet | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export function openAttach(s: AttachSheet) { state = s; emit(); }
const close = () => { state = null; emit(); };

const TILE = [
  ["camera", "Camera", "M3 8h4l2-3h6l2 3h4v12H3V8Zm9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "#C8402A"],
  ["photos", "Photos", "M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01", "#2F8FD8"],
  ["document", "Document", "M7 3h7l5 5v13H7V3Zm7 0v5h5", "#BD4A19"],
  ["quick", "Quick replies", "M13 2 4 14h7l-1 8 9-12h-7l1-8Z", "#A46312"],
  ["auto", "Auto replies", "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "#387557"],
] as const;

/** The person's own auto replies as choices: welcome, after hours, each keyword reply — the ones with words. */
export function autoChoices(set: { welcome?: { text?: string }; after?: { text?: string }; kws?: { words?: string; text?: string }[] } | null | undefined): TextChoice[] {
  if (!set) return [];
  return [
    ...(set.welcome?.text?.trim() ? [{ label: "Welcome", text: set.welcome.text }] : []),
    ...(set.after?.text?.trim() ? [{ label: "After hours", text: set.after.text }] : []),
    ...(set.kws ?? []).filter(k => k.text?.trim()).map(k => ({ label: k.words?.trim() ? `Keyword · ${k.words}` : "Keyword reply", text: k.text! })),
  ];
}

export function AttachSheetHost() {
  const s = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => null);
  const [view, setView] = useState<"" | "quick" | "auto">("");
  useEffect(() => { setView(s?.view ?? ""); }, [s]);
  if (!s || typeof document === "undefined") return null;
  const list = view === "quick" ? s.quick : view === "auto" ? s.auto : null;
  return createPortal(
    <div onClick={close} role="dialog" aria-modal="true" aria-label="Attach" style={{ position: "fixed", inset: 0, zIndex: 2147480000, background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", animation: "fadeIn 200ms ease-out" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 16px calc(var(--safe-bottom, 0px) + 18px)", maxHeight: "75vh", display: "flex", flexDirection: "column", gap: "10px", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)" }}>
        <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }} />
        {!list ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", padding: "6px 0 4px" }}>
            {TILE.filter(([k]) => (k === "camera" ? !!s.camera : k === "photos" ? !!s.photos : k === "document" ? !!s.document : true)).map(([k, label, icon, color]) => (
              <button key={k} type="button" onClick={() => { if (k === "quick" || k === "auto") { setView(k); return; } close(); (k === "camera" ? s.camera : k === "photos" ? s.photos : s.document)?.(); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "7px", border: 0, background: "transparent", cursor: "pointer", padding: "4px 0", color: "#3F2B22", fontSize: "12px", fontWeight: 600 }}>
                <span style={{ width: "54px", height: "54px", borderRadius: "27px", background: color, color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                </span>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button type="button" onClick={() => setView("")} aria-label="Back" style={{ border: 0, background: "transparent", color: "#806B60", fontSize: "20px", cursor: "pointer", padding: "0 4px" }}>‹</button>
              <strong style={{ flex: "1", fontSize: "17px", color: "#3F2B22" }}>{view === "quick" ? "Quick replies" : "Auto replies"}</strong>
            </div>
            <div style={{ overflowY: "auto", minHeight: 0 }}>
              {!list.length && <p style={{ margin: "6px 2px 12px", color: "#806B60", fontSize: "14px", lineHeight: 1.45 }}>{view === "quick" ? "No quick replies yet. Add them in Profile › Quick replies." : "No auto replies with words yet. Set them in Profile › Auto-reply."}</p>}
              {list.map((c, i) => (
                <button key={i} type="button" onClick={() => { close(); s.pick(c.text); }}
                  style={{ width: "100%", display: "flex", flexDirection: "column", gap: "3px", padding: "11px 4px", border: 0, borderTop: i ? "1px solid #F3E9E1" : 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
                  <strong style={{ fontSize: "13px", fontWeight: 650, color: "#BD4A19" }}>{c.label}</strong>
                  <span style={{ fontSize: "14px", color: "#3F2B22", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap" }}>{c.text}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
