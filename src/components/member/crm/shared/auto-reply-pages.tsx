"use client";
/**
 * Mine › Profile › Auto-reply, one page at a time (the owner, 2026-10-24: "auto reply 做成分頁式，像showroom一樣 … 輸入框的部分
 * 不好用，換成整頁後輸入框更大，記得要有save"): ‹ 1 / 3 › Welcome · After hours · Keywords, each with a big message box, its
 * picture and its switch; nothing is kept until Save (Cancel puts the page back as saved). Viewing somebody: theirs, read only.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { CrmAutoReplySet } from "@/lib/member/crm-data";
import { PHONE_TYPE, typePx } from "./type";
import { Ic } from "./icons4a";

const fs = (px: number) => typePx(Math.round((px / PHONE_TYPE) * 100) / 100);
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN = { border: 0, background: "transparent", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" } as const;
const ROUND: CSSProperties = { ...BTN, width: "34px", height: "34px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" };
const BOX: CSSProperties = { display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--crm-line)", borderRadius: "12px", background: "#fff", outline: "none", resize: "none", font: "inherit", fontSize: fs(14), lineHeight: 1.5, color: "var(--crm-ink)" };
/** A field label: small, above it. */
const LBL: CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, fontSize: fs(12), color: "var(--crm-muted)" };
/** The field a time or a date shows in. */
const FIELD: CSSProperties = { ...BTN, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", width: "100%", minWidth: 0, boxSizing: "border-box", height: "40px", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "12px", background: "#fff", fontSize: fs(14), color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" };
const pad2 = (n: number) => String(n).padStart(2, "0");
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`; };
const PAGES = [["welcome", "Welcome reply", "Sent once, on a customer's first message"], ["after", "Outside opening hours", "Sent when a customer writes outside these hours"], ["away", "Away / holiday", "Sent to everyone who writes between these times, in place of the after-hours reply"], ["kws", "Keyword replies", "Sent when a message has one of the words"]] as const;
const N = PAGES.length;

function Switch({ on, flip, off }: { on: boolean; flip: () => void; off?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={off} onClick={flip} style={{ ...BTN, flex: "none", position: "relative", width: "44px", height: "26px", borderRadius: "13px", background: on ? "var(--crm-brown)" : "var(--crm-line)", opacity: off ? 0.6 : 1 }}>
      <span style={{ position: "absolute", top: "3px", left: on ? "21px" : "3px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.25)", transition: "left 160ms" }} />
    </button>
  );
}
/**
 * A time, picked from a grid instead of the phone's wheel (the owner, 2026-10-24: "時間表改一下，好醜"): the hours as
 * 24 chips, the minutes as 00 · 15 · 30 · 45; a minute closes it. "08:00".
 */
export function TimePick({ value, set, open, toggle, off }: { value: string; set: (v: string) => void; open: boolean; toggle: () => void; off: boolean }) {
  const [h, m] = /^\d{2}:\d{2}$/.test(value) ? value.split(":") : ["", ""];
  const mins = ["00", "15", "30", "45"]; if (m && !mins.includes(m)) mins.push(m);
  const chip = (on: boolean): CSSProperties => ({ ...BTN, height: "32px", borderRadius: "10px", fontSize: fs(13), fontWeight: 500, fontVariantNumeric: "tabular-nums",
    background: on ? "var(--crm-ink)" : "var(--crm-field)", color: on ? "#fff" : "var(--crm-ink)" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
      <button type="button" disabled={off} onClick={toggle} aria-expanded={open} style={{ ...FIELD, borderColor: open ? "var(--crm-ink)" : "var(--crm-line)" }}>
        <span>{value || "—"}</span><span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="clock" size={14} /></span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px", border: "1px solid var(--crm-line)", borderRadius: "12px", background: "#fff" }}>
          <span style={{ fontSize: fs(11.5), color: "var(--crm-muted)" }}>Hour</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "5px" }}>
            {Array.from({ length: 24 }, (_, i) => pad2(i)).map(x => <button key={x} type="button" onClick={() => set(`${x}:${m || "00"}`)} style={chip(x === h)}>{x}</button>)}
          </div>
          <span style={{ fontSize: fs(11.5), color: "var(--crm-muted)" }}>Minute</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "5px" }}>
            {mins.map(x => <button key={x} type="button" onClick={() => { set(`${h || "00"}:${x}`); toggle(); }} style={chip(x === m)}>{x}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
function Picture({ img, name, set, upload, off }: { img?: string | null; name?: string; set: (img: string | null, name: string) => void; upload: (f: File) => Promise<string | null>; off: boolean }) {
  if (img) return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px", border: "1px solid var(--crm-line)", borderRadius: "12px" }}>
      <span style={{ width: "44px", height: "44px", borderRadius: "8px", background: `var(--crm-field) url(${img}) center/cover` }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: fs(13), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name || "Picture"}</span>
      {!off && <button type="button" onClick={() => set(null, "")} style={{ ...BTN, fontSize: fs(13), fontWeight: 500, color: "var(--crm-oxblood)" }}>Remove</button>}
    </div>
  );
  return off ? null : (
    <label style={{ height: "40px", border: "1px dashed var(--crm-line)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: fs(13), fontWeight: 500, color: "var(--crm-rust)", cursor: "pointer" }}>
      <Ic name="image" size={15} />Add image
      <input type="file" accept="image/jpeg,image/png" style={{ display: "none" }} onChange={async e => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const url = await upload(f); if (url) set(url, f.name); }} />
    </label>
  );
}

export function Phone4aAutoReply({ a }: { a: { ar: CrmAutoReplySet; readOnly: boolean; who: string; save: (s: CrmAutoReplySet) => void; upload: (f: File) => Promise<string | null> } }) {
  const [page, setPage] = useState(0), [d, setD] = useState<CrmAutoReplySet>(a.ar), [tp, setTp] = useState("");
  const tog = (k: string) => setTp(x => (x === k ? "" : k));
  const saved = JSON.stringify(a.ar), dirty = JSON.stringify(d) !== saved;
  // A save elsewhere, or another person viewed: start from what is saved.
  useEffect(() => { setD(JSON.parse(saved) as CrmAutoReplySet); }, [saved]);
  const off = a.readOnly, [key, title, sub] = PAGES[page];
  const put = (f: (x: CrmAutoReplySet) => CrmAutoReplySet) => { if (!off) setD(x => f(x)); };
  const msg = (value: string, set: (v: string) => void, ph: string, rows = 9) =>
    <textarea value={value} onChange={e => set(e.target.value)} readOnly={off} placeholder={ph} rows={rows} style={{ ...BOX, minHeight: `${rows * 21}px` }} />;
  const head = (on: boolean, flip: () => void) => (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
        <span style={{ fontFamily: TIGHT, fontSize: fs(17), fontWeight: 500, color: "var(--crm-ink)" }}>{title}</span>
        <span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>{sub}</span>
      </span>
      <Switch on={on} flip={flip} off={off} />
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", paddingBottom: dirty ? "78px" : "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <h1 style={{ flex: 1, margin: 0, fontFamily: TIGHT, fontSize: fs(26), fontWeight: 500, letterSpacing: "-0.02em", color: "var(--crm-ink)" }}>Auto-reply</h1>
        <button type="button" aria-label="Previous" onClick={() => setPage((page + N - 1) % N)} style={ROUND}><Ic name="chevron-left" size={15} /></button>
        <span style={{ minWidth: "34px", textAlign: "center", fontSize: fs(14), fontVariantNumeric: "tabular-nums" }}>{page + 1} / {N}</span>
        <button type="button" aria-label="Next" onClick={() => setPage((page + 1) % N)} style={ROUND}><Ic name="chevron-right" size={15} /></button>
      </div>
      <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "20px", background: "var(--crm-field)" }}>
        {PAGES.map(([k, , ], i) => <button key={k} type="button" onClick={() => setPage(i)} aria-pressed={page === i} style={{ ...BTN, flex: 1, height: "32px", borderRadius: "16px", fontSize: fs(12.5), fontWeight: 500,
          background: page === i ? "#fff" : "transparent", boxShadow: page === i ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: page === i ? "var(--crm-ink)" : "var(--crm-muted)" }}>{k === "welcome" ? "Welcome" : k === "after" ? "After hours" : k === "away" ? "Away" : "Keywords"}</button>)}
      </div>
      {off && <span style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "10px", background: "var(--crm-sel)", fontSize: fs(12), color: "var(--crm-muted)" }}><Ic name="lock" size={12} />{a.who}&apos;s auto-reply · read only</span>}

      {key === "welcome" && (<>
        {head(d.welcome.on, () => put(x => ({ ...x, welcome: { ...x.welcome, on: !x.welcome.on } })))}
        {msg(d.welcome.text, v => put(x => ({ ...x, welcome: { ...x.welcome, text: v } })), "Message for a customer's first message", 12)}
        <Picture img={d.welcome.img} name={d.welcome.imgName} off={off} upload={a.upload} set={(img, imgName) => put(x => ({ ...x, welcome: { ...x.welcome, img, imgName } }))} />
      </>)}
      {key === "after" && (<>
        {head(d.after.on, () => put(x => ({ ...x, after: { ...x.after, on: !x.after.on } })))}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "8px", alignItems: "start" }}>
          <span style={LBL}>Opens<TimePick value={d.after.from} off={off} open={tp === "af"} toggle={() => tog("af")} set={v => put(x => ({ ...x, after: { ...x.after, from: v } }))} /></span>
          <span style={LBL}>Closes<TimePick value={d.after.to} off={off} open={tp === "at"} toggle={() => tog("at")} set={v => put(x => ({ ...x, after: { ...x.after, to: v } }))} /></span>
        </div>
        {msg(d.after.text, v => put(x => ({ ...x, after: { ...x.after, text: v } })), "Message sent outside these hours", 10)}
        <Picture img={d.after.img} name={d.after.imgName} off={off} upload={a.upload} set={(img, imgName) => put(x => ({ ...x, after: { ...x.after, img, imgName } }))} />
      </>)}
      {key === "away" && (() => { const w = d.away ?? { on: false, text: "", from: "", to: "" }, upA = (p: Partial<typeof w>) => put(x => ({ ...x, away: { ...w, ...(x.away ?? {}), ...p } }));
        const ends = w.from && w.to && w.to <= w.from;
        return (<>
          {head(w.on, () => upA({ on: !w.on }))}
          {(["from", "to"] as const).map(k => { const [dd, tt] = (w[k] || "").split("T"), at = (x: string, y: string) => upA({ [k]: x ? `${x}T${y || "00:00"}` : "" });
            return (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "8px", alignItems: "start" }}>
                <span style={LBL}>{k === "from" ? "From" : "Until"}
                  <input type="date" value={dd ?? ""} readOnly={off} onChange={e => at(e.target.value, tt ?? "")} style={{ ...FIELD, WebkitAppearance: "none", appearance: "none", textAlign: "left" }} /></span>
                <span style={LBL}>Time<TimePick value={tt ?? ""} off={off} open={tp === "w" + k} toggle={() => tog("w" + k)} set={v => at(dd || todayIso(), v)} /></span>
              </div>); })}
          {ends && <span style={{ fontSize: fs(12), color: "var(--crm-oxblood)" }}>Until must be after From.</span>}
          {msg(w.text, v => upA({ text: v }), "e.g. We're on holiday until 2 Jan — we'll reply as soon as we're back.", 10)}
          <Picture img={w.img} name={w.imgName} off={off} upload={a.upload} set={(img, imgName) => upA({ img, imgName })} />
        </>); })()}
      {key === "kws" && (<>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontFamily: TIGHT, fontSize: fs(17), fontWeight: 500 }}>{title}</span>
          <span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>{sub}. Separate words with commas.</span>
        </div>
        {!d.kws.length && <span style={{ padding: "8px 0", fontSize: fs(13), color: "var(--crm-faint)" }}>No keyword replies yet.</span>}
        {d.kws.map((k, i) => {
          const up = (p: Partial<typeof k>) => put(x => ({ ...x, kws: x.kws.map(y => (y.id === k.id ? { ...y, ...p } : y)) }));
          return (
            <div key={k.id} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", border: "1px solid var(--crm-line)", borderRadius: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)" }}>#{i + 1}</span>
                <input value={k.words} readOnly={off} onChange={e => up({ words: e.target.value })} placeholder="price, promotion, harga" style={{ ...BOX, flex: 1, padding: "8px 12px" }} />
                <Switch on={k.on} flip={() => up({ on: !k.on })} off={off} />
              </div>
              {msg(k.text, v => up({ text: v }), "The reply", 5)}
              <Picture img={k.img} name={k.imgName} off={off} upload={a.upload} set={(img, imgName) => up({ img, imgName })} />
              {!off && <button type="button" onClick={() => put(x => ({ ...x, kws: x.kws.filter(y => y.id !== k.id) }))} style={{ ...BTN, alignSelf: "flex-start", fontSize: fs(13), fontWeight: 500, color: "var(--crm-oxblood)" }}>Remove</button>}
            </div>);
        })}
        {!off && <button type="button" onClick={() => put(x => ({ ...x, kws: [...x.kws, { id: String(Date.now()), on: true, words: "", text: "" }] }))} style={{ ...BTN, height: "42px", border: "1px dashed var(--crm-line)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: fs(13.5), fontWeight: 500, color: "var(--crm-rust)" }}><Ic name="plus" size={14} />Add keyword reply</button>}
      </>)}

      {dirty && !off && (
        <div style={{ position: "sticky", bottom: 0, display: "flex", gap: "10px", margin: "0 -20px", padding: "12px 20px calc(12px + var(--safe-bottom, 0px))", background: "#fff", borderTop: "1px solid var(--crm-rule)" }}>
          <button type="button" onClick={() => setD(JSON.parse(saved) as CrmAutoReplySet)} style={{ ...BTN, flex: 1, height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", fontSize: fs(14), fontWeight: 500 }}>Cancel</button>
          <button type="button" onClick={() => a.save(d)} style={{ ...BTN, flex: 2, height: "44px", borderRadius: "22px", background: "var(--crm-rust)", color: "#fff", fontSize: fs(14), fontWeight: 600 }}>Save</button>
        </div>
      )}
    </div>
  );
}
