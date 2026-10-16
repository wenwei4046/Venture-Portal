// scripts/push-auth-email.mjs
//
// The invite email Supabase Auth sends for the portal — who it comes from and
// what it says — kept in this repo and pushed to production's Auth settings
// (2026-10-16, the user: "当 send invitation link 的时候，在 email 那边收到它显示的是
// 148B，我要它显示是我们的 email。 and icon. email hello@houzsventure.com").
//
// Production's Auth settings live in Supabase, not here, and `supabase config
// push` would push the whole of config.toml over them (a localhost Site URL, no
// SMTP) — never run it. This script sends only the fields `wanted()` names,
// through the Management API, and shows what would change first:
//
//   node scripts/push-auth-email.mjs                      what would change; nothing is sent
//   node scripts/push-auth-email.mjs --apply              the invite's subject and template
//   SMTP_PASS=… node scripts/push-auth-email.mjs --apply  …and the sender, HOUZS Venture
//                                                         <hello@houzsventure.com>, through
//                                                         Google Workspace's SMTP
//
// SUPABASE_ACCESS_TOKEN (a personal access token, or the Supabase CLI's) must be
// in the environment; SMTP_PASS is hello@houzsventure.com's Google app password.
// Neither is ever printed.

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_REF = 'gixpptmfuryskbwkmiwz'

/** Who the portal's email comes from: the company's own address, the one its documents print. */
export const SENDER = { name: 'HOUZS Venture', email: 'hello@houzsventure.com' }

/** Google Workspace's SMTP (the domain's mail is Google's), signed in as the sender. The API takes the port as text. */
export const SMTP = { host: 'smtp.gmail.com', port: '465', user: SENDER.email }

/** Emails an hour once the sender is ours: Supabase's own starting figure for an SMTP of one's own (its built-in sender allows 2). */
export const EMAILS_PER_HOUR = 30

/** The invite: its subject and its body, a Go template (`{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Data.name }}`). */
export const INVITE = { subject: 'Your HOUZS Venture account', file: 'supabase/templates/invite.html' }

/** With LF line ends, whichever checkout it is sent from (Windows' writes CRLF). */
export function inviteTemplate() {
  return readFileSync(join(ROOT, INVITE.file), 'utf8').replace(/\r\n/g, '\n')
}

/**
 * The fields to send. The sender goes only with its password, and then whole:
 * Supabase takes an SMTP as one setting, and a sender without one would leave
 * the invite on Supabase's own address. Google shows an app password in groups
 * of four; the spaces are not part of it.
 */
export function wanted({ smtpPass = '' } = {}) {
  const fields = {
    mailer_subjects_invite: INVITE.subject,
    mailer_templates_invite_content: inviteTemplate(),
  }
  const pass = smtpPass.replace(/\s+/g, '')
  if (!pass) return fields
  return {
    ...fields,
    smtp_host: SMTP.host,
    smtp_port: SMTP.port,
    smtp_user: SMTP.user,
    smtp_pass: pass,
    smtp_admin_email: SENDER.email,
    smtp_sender_name: SENDER.name,
    rate_limit_email_sent: EMAILS_PER_HOUR,
  }
}

const SECRET = new Set(['smtp_pass'])
const short = (text) => createHash('md5').update(text).digest('hex').slice(0, 8)

function show(key, value) {
  if (value === null || value === undefined || value === '') return '(empty)'
  if (SECRET.has(key)) return '(set)'
  if (key.startsWith('mailer_templates_')) return `${String(value).length} chars, md5 ${short(String(value))}…`
  return JSON.stringify(value)
}

/** A secret cannot be read back to compare, so it is always sent when given. */
const differs = (current, key, value) => SECRET.has(key) || String(current[key] ?? '') !== String(value)

async function main() {
  const apply = process.argv.includes('--apply')
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.error('✗ SUPABASE_ACCESS_TOKEN is not set.')
    process.exit(1)
  }
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const read = async () => {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Reading the Auth settings answered ${res.status}: ${await res.text()}`)
    return res.json()
  }

  const current = await read()
  const fields = wanted({ smtpPass: process.env.SMTP_PASS ?? '' })
  const changes = Object.entries(fields).filter(([key, value]) => differs(current, key, value))

  console.log(`Supabase Auth · ${PROJECT_REF}`)
  for (const [key, value] of Object.entries(fields)) {
    const line = differs(current, key, value) ? `${show(key, current[key])} → ${show(key, value)}` : `${show(key, value)} (as it is)`
    console.log(`  ${key.padEnd(34)} ${line}`)
  }
  if (!('smtp_pass' in fields)) {
    const sender = current.smtp_admin_email
      ? `${current.smtp_sender_name ?? ''} <${current.smtp_admin_email}>`
      : 'Supabase’s own (noreply@mail.app.supabase.io)'
    console.log(`  The sender stays ${sender} — SMTP_PASS is not set.`)
  }
  if (changes.length === 0) {
    console.log('Nothing to change.')
    return
  }
  if (!apply) {
    console.log(`Nothing sent. Run again with --apply to send ${changes.length} field(s).`)
    return
  }

  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(Object.fromEntries(changes)) })
  if (!res.ok) throw new Error(`Saving the Auth settings answered ${res.status}: ${await res.text()}`)
  const after = await read()
  const missed = changes.filter(([key, value]) => !SECRET.has(key) && String(after[key] ?? '') !== String(value)).map(([key]) => key)
  if (missed.length > 0) throw new Error(`Saved, but these read back differently: ${missed.join(', ')}`)
  console.log(`✓ Sent ${changes.length} field(s); production reads them back as sent.`)
}

// Run only as a script — the test imports the settings above.
if ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('/scripts/push-auth-email.mjs')) {
  main().catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  })
}
