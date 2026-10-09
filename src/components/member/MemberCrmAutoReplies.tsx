"use client";

import type { CrmAutoReplySettings } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";

/**
 * Auto-reply settings: a welcome for a new customer, a note outside opening
 * hours, and keyword answers. An auto-reply answers at once but does not count
 * as the salesperson's reply — the customer still waits for a person.
 */
export default function MemberCrmAutoReplies({ settings, onChange }: {
  settings: CrmAutoReplySettings;
  onChange: (next: CrmAutoReplySettings) => void;
}) {
  const setKeyword = (id: string, patch: Partial<CrmAutoReplySettings["keywords"][number]>) =>
    onChange({ ...settings, keywords: settings.keywords.map(k => (k.id === id ? { ...k, ...patch } : k)) });

  return (
    <section className={s.card} aria-label="Auto-replies">
      <h2>Auto-replies</h2>
      <p className={s.caption}>Sent straight away. The customer still counts as waiting until you reply yourself.</p>

      <Rule title="Welcome a new customer" hint="Their first message" on={settings.welcome.on} text={settings.welcome.text}
        onToggle={on => onChange({ ...settings, welcome: { ...settings.welcome, on } })}
        onText={text => onChange({ ...settings, welcome: { ...settings.welcome, text } })} />
      <Rule title="Outside opening hours" hint="8pm – 8am" on={settings.afterHours.on} text={settings.afterHours.text}
        onToggle={on => onChange({ ...settings, afterHours: { ...settings.afterHours, on } })}
        onText={text => onChange({ ...settings, afterHours: { ...settings.afterHours, text } })} />

      <h3 className={c.subHead}>Keyword replies</h3>
      {settings.keywords.map(k => (
        <div key={k.id} className={c.rule}>
          <div className={c.ruleTop}>
            <label className={c.switch}><input type="checkbox" checked={k.on} onChange={e => setKeyword(k.id, { on: e.target.checked })} /><span>{k.on ? "On" : "Off"}</span></label>
            <button className={c.linkDanger} onClick={() => onChange({ ...settings, keywords: settings.keywords.filter(x => x.id !== k.id) })}>Remove</button>
          </div>
          <label className={s.field}><span>When the message contains (comma-separated)</span>
            <input value={k.words} onChange={e => setKeyword(k.id, { words: e.target.value })} />
          </label>
          <label className={s.field}><span>Reply</span>
            <textarea rows={2} value={k.text} onChange={e => setKeyword(k.id, { text: e.target.value })} />
          </label>
        </div>
      ))}
      <button className={`${s.button} ${s.full}`} onClick={() => onChange({ ...settings, keywords: [...settings.keywords, { id: crypto.randomUUID(), on: true, words: "", text: "" }] })}>
        <Icon name="list" size={16} /> Add a keyword reply
      </button>
    </section>
  );
}

function Rule({ title, hint, on, text, onToggle, onText }: {
  title: string; hint: string; on: boolean; text: string; onToggle: (on: boolean) => void; onText: (text: string) => void;
}) {
  return (
    <div className={c.rule}>
      <div className={c.ruleTop}>
        <span><strong>{title}</strong> <span className={s.caption}>· {hint}</span></span>
        <label className={c.switch}><input type="checkbox" checked={on} onChange={e => onToggle(e.target.checked)} /><span>{on ? "On" : "Off"}</span></label>
      </div>
      <label className={s.field}><span className={c.srOnly}>{title} message</span>
        <textarea rows={2} value={text} disabled={!on} onChange={e => onText(e.target.value)} />
      </label>
    </div>
  );
}
