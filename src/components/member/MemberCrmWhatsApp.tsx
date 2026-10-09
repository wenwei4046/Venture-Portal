"use client";

import { useEffect, useState } from "react";
import { callbackUrl, reachableByMeta } from "@/lib/whatsapp/callback";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";
import { Icon } from "./MemberUI";

interface Health {
  verifyToken: boolean;
  appSecret: boolean;
  accessToken: boolean;
  phoneNumberId: boolean;
  businessAccountId: boolean;
}

const ROWS: { key: keyof Health; label: string; where: string }[] = [
  { key: "verifyToken", label: "Verify Token", where: "WHATSAPP_VERIFY_TOKEN in .env.local — the same text goes into Meta's Verify token box" },
  { key: "appSecret", label: "App secret", where: "META_APP_SECRET — App Dashboard › App settings › Basic" },
  { key: "accessToken", label: "Access token", where: "META_SYSTEM_USER_TOKEN — System User RevTeam CRM, with the WhatsApp permissions" },
  { key: "phoneNumberId", label: "Phone number ID", where: "WHATSAPP_PHONE_NUMBER_ID — App Dashboard › WhatsApp › API Setup" },
  { key: "businessAccountId", label: "WhatsApp Business Account ID", where: "WHATSAPP_BUSINESS_ACCOUNT_ID — same page" },
];

/**
 * Settings › WhatsApp: the Callback URL to paste into Meta, and which settings
 * the site has. Yes / no only — no value, length or hint of one ever reaches
 * the page.
 */
export default function MemberCrmWhatsApp() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/whatsapp/v1/health", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);

  const url = origin ? callbackUrl(origin) : "";
  const reachable = origin ? reachableByMeta(origin) : true;
  const ready = health && Object.values(health).every(Boolean);

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* the field is selectable */ }
  }

  return (
    <section className={s.card} aria-label="WhatsApp">
      <div className={c.cardTop}>
        <h2>WhatsApp</h2>
        <span className={c.status} data-status={ready ? "won" : "new"}>{ready ? "Ready to connect" : "Setup needed"}</span>
      </div>
      <p className={s.caption}>Receive and reply to WhatsApp messages in this CRM, through the WhatsApp Cloud API.</p>

      <h3 className={c.subHead}>1. Callback URL</h3>
      <div className={c.copyRow}>
        <input readOnly value={url} aria-label="Callback URL" onFocus={e => e.currentTarget.select()} />
        <button className={s.button} onClick={copy} disabled={!url}>{copied ? "Copied" : "Copy"}</button>
      </div>
      {!reachable && <p className={c.warnNote}><Icon name="info" size={14} /> Meta cannot reach this address (it is on your computer). Use the temporary tunnel address — or the live site once deployed — then copy the Callback URL from there.</p>}

      <h3 className={c.subHead}>2. Settings on the site</h3>
      {failed && <p className={c.warnNote}>Could not check the settings — is the site running?</p>}
      {!health && !failed && <p className={s.caption}>Checking…</p>}
      {health && <ul className={c.checkList}>
        {ROWS.map(r => (
          <li key={r.key} data-ok={health[r.key]}>
            <span aria-hidden="true">{health[r.key] ? "✓" : "✗"}</span>
            <div><strong>{r.label}</strong> <em>{health[r.key] ? "set" : "not set"}</em><small>{r.where}</small></div>
          </li>
        ))}
      </ul>}

      <h3 className={c.subHead}>3. In Meta</h3>
      <ol className={c.steps}>
        <li>developers.facebook.com › <strong>Houzs Revenue Team CRM</strong> › <strong>WhatsApp › Configuration</strong></li>
        <li>Under <strong>Webhook</strong>, press <strong>Edit</strong>: paste the <strong>Callback URL</strong> above, and type the same <strong>Verify token</strong> as WHATSAPP_VERIFY_TOKEN in .env.local</li>
        <li>Press <strong>Verify and save</strong> — Meta calls this site, and it answers only if the token matches</li>
        <li>Under <strong>Webhook fields</strong>, subscribe to <strong>messages</strong></li>
      </ol>
      <p className={s.caption}>The Verify Token is never shown here. Open .env.local to copy it.</p>
    </section>
  );
}
