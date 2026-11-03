"use client";
/**
 * Whose CRM to view (View as a team member and the viewing strip's Switch, 2026-10-29): a search, then the people grouped by
 * their title — no avatar circles (the owner: "不需要前面的圈圈"), the name and a short line, the one on screen ticked.
 */
import { useState, type CSSProperties } from "react";
import { Ic } from "../shared/icons4a";

export type ViewAsPerson = { id: string; name: string; title: string };
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", margin: 0, padding: 0, boxSizing: "border-box", textAlign: "left" };

export function ViewAsList({ people, pick, current, style }: { people: ViewAsPerson[]; pick: (id: string) => void; current?: string; style?: CSSProperties }) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase(), list = people.filter(p => !n || `${p.name} ${p.title}`.toLowerCase().includes(n));
  // By title, in the order they first come (the Director, then each leader's line).
  const groups = list.reduce<[string, ViewAsPerson[]][]>((g, p) => { const at = g.find(x => x[0] === p.title); if (at) at[1].push(p); else g.push([p.title, [p]]); return g; }, []);
  return (
    <div role="dialog" aria-label="View as a team member" style={{ width: "300px", maxHeight: "440px", display: "flex", flexDirection: "column", boxSizing: "border-box", background: "#fff", borderRadius: "12px", boxShadow: "0 16px 40px rgba(42,22,12,.2)", overflow: "hidden", ...style }}>
      <div style={{ flex: "none", padding: "12px 12px 8px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
        <div style={{ font: "600 13px Inter, sans-serif", color: "var(--crm-ink)", marginBottom: "8px" }}>View as a team member</div>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 10px", borderRadius: "8px", background: "var(--crm-field)", color: "var(--crm-faint)" }}>
          <Ic name="search" size={13} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or title" aria-label="Search name or title"
            style={{ flex: 1, minWidth: 0, border: 0, outline: "none", padding: 0, background: "transparent", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }} />
        </label>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "4px 6px 8px" }}>
        {groups.map(([title, ps]) => (
          <div key={title} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 8px 4px", font: "600 10px Inter, sans-serif", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{title}</div>
            {ps.map(p => { const on = p.id === current; return (
              <button key={p.id} type="button" onClick={() => pick(p.id)} aria-current={on || undefined}
                style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", minHeight: "34px", padding: "6px 10px", borderRadius: "8px", background: on ? "var(--crm-sel)" : "transparent",
                  boxShadow: on ? "inset 3px 0 0 var(--crm-rust)" : "none" }} className="crm4a-row">
                <span style={{ flex: 1, minWidth: 0, font: `${on ? 600 : 500} 13px Inter, sans-serif`, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                {on ? <span style={{ display: "flex", color: "var(--crm-rust)" }}><Ic name="check" size={14} /></span> : <span style={{ display: "flex", color: "var(--crm-faint-2)" }}><Ic name="chevron-right" size={13} /></span>}
              </button>); })}
          </div>
        ))}
        {!list.length && <div style={{ padding: "16px 10px", font: "400 12.5px Inter, sans-serif", color: "var(--crm-faint)" }}>Nobody matches.</div>}
      </div>
    </div>
  );
}
