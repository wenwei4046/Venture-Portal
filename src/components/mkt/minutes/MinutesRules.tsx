'use client'

import { RULE_GROUPS, RULES, type MinutesRules as Rules } from '@/lib/marketing/minutes'
import m from './minutes.module.css'

// The Completion rules tab (v2): three cards — Before Complete, Linking, After Complete — each rule a switch and its
// name; what a rule does is its tooltip (no lines under them: DESIGN.md). A rule beneath another (Both PICs sign off,
// under PIC signs off) shows only while that one is on, and goes off with it.

export default function MinutesRules({ rules, onRules }: { rules: Rules; onRules: (next: Rules) => void }) {
  const flip = (key: keyof Rules) => {
    const nv = !rules[key]
    const next = { ...rules, [key]: nv }
    if (!nv) for (const r of RULES) if (r.under === key) next[r.key] = false
    onRules(next)
  }
  return (
    <div className={m.groups}>
      {RULE_GROUPS.map((title, g) => (
        <section key={title} className={m.group} aria-label={title}>
          <div className={m.groupHead}>{title}</div>
          {RULES.filter(r => r.group === g && (!r.under || rules[r.under])).map(r => (
            <button
              key={r.key}
              type="button"
              role="switch"
              aria-checked={rules[r.key]}
              aria-label={r.name}
              title={r.hint}
              className={`${m.rule}${r.under ? ` ${m.ruleUnder}` : ''}`}
              onClick={() => flip(r.key)}
            >
              <span className={`${m.sw}${rules[r.key] ? ` ${m.swOn}` : ''}`} aria-hidden="true"><span className={m.knob} /></span>
              <span className={m.ruleName}>{r.name}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}
