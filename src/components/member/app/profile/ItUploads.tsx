"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { IT_ACCEPT, IT_LIMITS, fileSize, fileTag, isImage, itFileRefusal, type ItUpload } from "@/lib/it-requests/model";
import { removeItUpload, uploadItFile, type Uploaded } from "@/lib/it-requests/upload";
import ImageAnnotator from "@/components/it-requests/ImageAnnotator";
import { ICON, Svg } from "../icons";
import t from "./it.module.css";

/** One file attached: going up, up, or refused — and the picture's own preview, made on the phone. */
export interface ItAttachment {
  key: string;
  name: string;
  size: number;
  contentType: string;
  state: "up" | "ok" | "err";
  error: string | null;
  upload: ItUpload | null;
  preview: string | null;
}

/** Puts a file in the bucket; the tests and the preview hand their own. */
export type ItUploader = (file: File) => Promise<Uploaded>;

/**
 * The files of a request or a note (IT support, 2026-10-20): each goes up the moment it is picked (or pasted — a
 * screenshot on a computer), so Send waits only for the last of them; × takes one off (and out of the bucket). Ten at a
 * time, 2 GB each — the bucket's own limits.
 */
export function useItUploads(upload: ItUploader = uploadItFile) {
  const [items, setItemsState] = useState<ItAttachment[]>([]);
  // What is on screen, kept beside the state so a second pick in the same moment counts the first.
  const now = useRef<ItAttachment[]>([]);
  const setItems = useCallback((next: (list: ItAttachment[]) => ItAttachment[]) => {
    now.current = next(now.current);
    setItemsState(now.current);
  }, []);
  const live = useRef(true);
  const urls = useRef(new Set<string>());
  useEffect(() => {
    live.current = true;
    const made = urls.current;
    return () => {
      live.current = false;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, []);

  const add = useCallback((files: File[]) => {
    const had = now.current.length;
    const picked = files.slice(0, Math.max(0, IT_LIMITS.files - had)).map((file, i): [ItAttachment, File] => {
      const refused = itFileRefusal(file);
      const preview = !refused && isImage(file.type) && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : null;
      if (preview) urls.current.add(preview);
      return [{ key: `${Date.now()}-${had + i}-${file.name}`, name: file.name || "file", size: file.size, contentType: file.type,
        state: refused ? "err" : "up", error: refused, upload: null, preview }, file];
    });
    setItems(list => [...list, ...picked.map(([item]) => item)]);
    for (const [item, file] of picked) {
      if (item.state !== "up") continue;
      void upload(file).then(res => {
        // Taken off (or the form closed) while it went up: it comes out of the bucket again.
        if (!live.current || !now.current.some(x => x.key === item.key)) {
          if (res.ok) void removeItUpload(res.file.path);
          return;
        }
        setItems(list => list.map(x => (x.key !== item.key ? x
          : res.ok ? { ...x, state: "ok", upload: res.file, error: null } : { ...x, state: "err", error: res.reason })));
      });
    }
  }, [upload, setItems]);

  const remove = useCallback((key: string) => {
    const gone = now.current.find(x => x.key === key);
    if (gone?.upload) void removeItUpload(gone.upload.path);
    setItems(list => list.filter(x => x.key !== key));
  }, [setItems]);

  /** After a send: the files are filed — nothing to remove. */
  const clear = useCallback(() => setItems(() => []), [setItems]);
  /** A form closed unsent: what went up comes out of the bucket again. */
  const discard = useCallback(() => {
    for (const x of now.current) if (x.upload) void removeItUpload(x.upload.path);
    setItems(() => []);
  }, [setItems]);

  /** A screenshot pasted into the box (a computer's ⌘V / Ctrl+V). */
  const paste = useCallback((e: ClipboardEvent) => {
    const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    add(files.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `screenshot-${Date.now()}${i ? `-${i}` : ""}.png`, { type: f.type || "image/png" }))));
  }, [add]);

  const busy = items.some(x => x.state === "up");
  const uploads = items.flatMap(x => (x.state === "ok" && x.upload ? [x.upload] : []));
  const failed = items.some(x => x.state === "err");
  return { items, add, remove, clear, discard, paste, busy, failed, uploads, full: items.length >= IT_LIMITS.files };
}

/** The files, and the button that adds more. */
export function ItFileList({ items, full, disabled, onAdd, onRemove, label = "Add screenshots or files" }: {
  items: ItAttachment[];
  full: boolean;
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [annotating, setAnnotating] = useState<ItAttachment | null>(null);
  return (
    <div className={t.files}>
      {items.map(x => (
        <div key={x.key} className={t.fileRow}>
          <span className={t.fileTile} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- the phone's own copy, never a page asset */}
            {x.preview ? <img src={x.preview} alt="" /> : fileTag(x.name, x.contentType)}
          </span>
          <span className={t.fileText}>
            <span className={t.fileName}>{x.name}</span>
            <span className={`${t.fileMeta} ${x.state === "err" ? t.fileErr : ""}`} role={x.state === "err" ? "alert" : undefined}>
              {x.state === "up" ? "Uploading…" : x.state === "err" ? x.error : fileSize(x.size)}
            </span>
          </span>
          <span className={t.fileActions}>
          {x.preview && <button type="button" className={t.mark} disabled={disabled || full || x.state !== "ok"}
            onClick={() => setAnnotating(x)} aria-label={`Annotate ${x.name}`}>Annotate</button>}
          <button type="button" className={t.fileX} disabled={disabled} onClick={() => onRemove(x.key)} aria-label={`Remove ${x.name}`}>
            <Svg d="M6 6l12 12M18 6 6 18" size={16} sw={2} />
          </button>
          </span>
        </div>
      ))}
      {!full && (
        <button type="button" className={t.attach} onClick={() => input.current?.click()} disabled={disabled}>
          <Svg d={ICON.clip} size={17} sw={1.8} />{label}
        </button>
      )}
      <input ref={input} type="file" multiple accept={IT_ACCEPT} hidden data-testid="it-files"
        disabled={disabled} onChange={e => { if (!disabled) onAdd([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {annotating?.preview && <ImageAnnotator src={annotating.preview} fileName={annotating.name} theme="revenue"
        onClose={() => setAnnotating(null)} onSave={file => { onAdd([file]); setAnnotating(null); }} />}
    </div>
  );
}
