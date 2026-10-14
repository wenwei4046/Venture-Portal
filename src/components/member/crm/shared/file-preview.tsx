"use client";

import { useEffect, useState } from "react";

/**
 * A document other than a PDF, opened in the viewer (the owner, 2026-10-14: "文件功能目前雙方都能打開 pdf，但是其他文件類型
 * 無法打開，是否可以開放打開全部文件"). Read in the browser, nothing sent anywhere:
 * - a spreadsheet (xlsx, xls, csv, ods) through SheetJS — one sheet at a time, its tabs above, the first 500 rows;
 * - a Word document (docx) through mammoth, drawn in a sandboxed frame (no script runs);
 * - plain text (txt, csv already above, json, md, log, xml);
 * - a photo, video or sound sent as a file, as itself.
 * Anything else (PowerPoint, zip …) has no reader a web page can carry; it keeps Download, which hands it to the
 * phone to open in Numbers, Excel, Keynote or Files.
 */
export type PreviewKind = "sheet" | "word" | "text" | "image" | "video" | "audio" | null;

export function previewKind(name = "", mime = ""): PreviewKind {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? "").toLowerCase(), m = mime.toLowerCase();
  if (["xlsx", "xls", "xlsm", "ods", "csv"].includes(ext) || m.includes("spreadsheet") || m.includes("excel") || m === "text/csv") return "sheet";
  if (ext === "docx" || m.includes("wordprocessingml")) return "word";
  if (["txt", "json", "md", "log", "xml"].includes(ext) || m.startsWith("text/") || m === "application/json") return "text";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "image";
  if (m.startsWith("video/") || ["mp4", "mov", "m4v"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ["mp3", "m4a", "ogg", "wav", "aac", "opus"].includes(ext)) return "audio";
  return null;
}

const MAX_ROWS = 500, MAX_COLS = 40;
/** Past this a phone's browser may run out of memory reading it (a customer's spreadsheet with pictures was 76 MB): Download. */
export const PREVIEW_MAX = 20 * 1024 * 1024;

export function FilePreview({ file, kind }: { file: File | null; kind: PreviewKind }) {
  const [sheets, setSheets] = useState<{ name: string; rows: string[][]; more: boolean }[] | null>(null);
  const [at, setAt] = useState(0);
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file || !kind || (file.size > PREVIEW_MAX && kind !== "image" && kind !== "video" && kind !== "audio")) return;
    let on = true;
    setFailed(false);
    (async () => {
      try {
        if (kind === "sheet") {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
          const list = wb.SheetNames.map(name => {
            const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][];
            return { name, rows: all.slice(0, MAX_ROWS).map(r => r.slice(0, MAX_COLS).map(c => String(c ?? ""))), more: all.length > MAX_ROWS };
          });
          if (on) setSheets(list);
        } else if (kind === "word") {
          const mammoth = await import("mammoth");
          const r = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
          if (on) setHtml(r.value);
        } else if (kind === "text") {
          const t = await file.text();
          if (on) setText(t.length > 400_000 ? t.slice(0, 400_000) + "\n…" : t);
        } else {
          const u = URL.createObjectURL(file);
          if (on) setUrl(u); else URL.revokeObjectURL(u);
        }
      } catch { if (on) setFailed(true); }
    })();
    return () => { on = false; };
  }, [file, kind]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  if (file && file.size > PREVIEW_MAX && kind !== "image" && kind !== "video" && kind !== "audio") {
    return <p style={{ color: "#fff", textAlign: "center", marginTop: "40px", fontSize: "15px", padding: "0 24px", lineHeight: 1.5 }}>This file is {Math.round(file.size / 1048576)} MB — too big to open here. Use Download to open it in Numbers, Excel or Files.</p>;
  }
  const wait = <p style={{ color: "#fff", opacity: 0.8, textAlign: "center", marginTop: "40px", fontSize: "15px" }}>Opening…</p>;
  if (failed) return <p style={{ color: "#fff", textAlign: "center", marginTop: "40px", fontSize: "15px", padding: "0 20px" }}>This file could not be opened here. Use Download to open it in another app.</p>;
  const box = { flex: "1", minHeight: 0, overflow: "auto", background: "#fff", color: "#222", touchAction: "pan-x pan-y pinch-zoom", WebkitOverflowScrolling: "touch" } as const;

  if (kind === "sheet") {
    if (!sheets) return wait;
    const s = sheets[at] ?? sheets[0];
    return (
      <div style={{ flex: "1", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {sheets.length > 1 && (
          <div style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", padding: "8px 10px", background: "#2a211d" }}>
            {sheets.map((x, i) => <button key={x.name} type="button" onClick={() => setAt(i)} style={{ flex: "none", height: "30px", padding: "0 12px", borderRadius: "15px", border: 0, background: i === at ? "#fff" : "rgba(255,255,255,.15)", color: i === at ? "#201814" : "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>{x.name}</button>)}
          </div>
        )}
        <div style={box}>
          <table style={{ borderCollapse: "collapse", fontSize: "13px", fontFamily: "Inter, -apple-system, sans-serif" }}>
            <tbody>
              {s?.rows.map((r, i) => (
                <tr key={i} style={{ background: i === 0 ? "#F5EBE3" : i % 2 ? "#fff" : "#FBF7F3" }}>
                  <td style={{ padding: "6px 8px", border: "1px solid #E6DDD5", color: "#A8968B", fontSize: "11px", textAlign: "right", position: "sticky", left: 0, background: "inherit" }}>{i + 1}</td>
                  {r.map((c, j) => <td key={j} style={{ padding: "6px 10px", border: "1px solid #E6DDD5", whiteSpace: "pre-wrap", maxWidth: "260px", fontWeight: i === 0 ? 650 : 400, verticalAlign: "top" }}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {s?.more && <p style={{ margin: "10px", color: "#806B60", fontSize: "13px" }}>Showing the first {MAX_ROWS} rows. Download to see the rest.</p>}
          {!s?.rows.length && <p style={{ margin: "16px", color: "#806B60", fontSize: "14px" }}>This sheet is empty.</p>}
        </div>
      </div>
    );
  }
  if (kind === "word") {
    if (html == null) return wait;
    const doc = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:15px/1.55 -apple-system,Inter,sans-serif;color:#222;margin:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ddd;padding:4px 6px}</style>${html}`;
    // sandbox="" : the document's HTML is drawn, nothing in it can run or reach the app.
    return <iframe title="Document" sandbox="" srcDoc={doc} style={{ flex: "1", minHeight: 0, width: "100%", border: 0, background: "#fff" }} />;
  }
  if (kind === "text") {
    if (text == null) return wait;
    return <div style={box}><pre style={{ margin: 0, padding: "14px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace, Menlo, monospace" }}>{text}</pre></div>;
  }
  if (!url) return wait;
  if (kind === "image") return <div style={{ flex: "1", minHeight: 0, display: "grid", placeItems: "center", overflow: "auto" }}><img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></div>;
  if (kind === "video") return <div style={{ flex: "1", minHeight: 0, display: "grid", placeItems: "center" }}><video src={url} controls playsInline style={{ maxWidth: "100%", maxHeight: "100%" }} /></div>;
  return <div style={{ flex: "1", display: "grid", placeItems: "center" }}><audio src={url} controls /></div>;
}
