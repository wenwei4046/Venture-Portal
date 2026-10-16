import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPANY_NAME } from './company'
import { welcomeLink } from './invite'
import { EMAILS_PER_HOUR, INVITE, SENDER, wanted } from '../../scripts/push-auth-email.mjs'

// The invite email (2026-10-16, the user: "在 email 那边收到它显示的是 148B，我要它显示是我们的
// email。 and icon. email hello@houzsventure.com"). Supabase sends it; its body is
// supabase/templates/invite.html and scripts/push-auth-email.mjs puts that file, its
// subject and our sender into production's Auth settings. Nothing in the app reads
// the file, so these checks are all that stand between a slip in it and staff who
// cannot activate their account.

// Vitest runs from the repository root.
const ROOT = process.cwd()
const html = readFileSync(join(ROOT, INVITE.file), 'utf8').replace(/\r\n/g, '\n')
const LINK = '{{ .SiteURL }}/welcome?token_hash={{ .TokenHash }}&type=invite'

describe('the invite email', () => {
  it('opens our /welcome with the token hash, the address HR copies when Supabase does not email it', () => {
    const toWelcome = [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]).filter(href => href.includes('/welcome'))
    expect(toWelcome).toEqual([LINK, LINK])
    expect(welcomeLink('venture-portal-chi.vercel.app', 'abc123')).toBe(
      LINK.replace('{{ .SiteURL }}', 'https://venture-portal-chi.vercel.app').replace('{{ .TokenHash }}', 'abc123'),
    )
  })

  it('never carries Supabase’s own link — opening it spends the token, as a mail scanner would', () => {
    expect(html).not.toMatch(/ConfirmationURL|RedirectTo|\.Token\b/)
  })

  it('uses only the values Supabase hands an invite, every {{ if }} closed', () => {
    const actions = [...html.matchAll(/\{\{\s*(.*?)\s*\}\}/g)].map(m => m[1])
    const known = new Set(['.SiteURL', '.TokenHash', 'if .Data.name', '.Data.name', 'else', 'end'])
    expect(actions.filter(action => !known.has(action))).toEqual([])
    expect(actions.filter(action => action.startsWith('if ')).length).toBe(actions.filter(action => action === 'end').length)
    expect(html.replace(/\{\{.*?\}\}/g, '')).not.toMatch(/\{\{|\}\}/)
  })

  it('draws its logo from a PNG the portal serves — mail apps show no SVG', () => {
    const sources = [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map(m => m[1])
    expect(sources).not.toHaveLength(0)
    for (const src of sources) {
      expect(src).toMatch(/^\{\{ \.SiteURL \}\}\/[\w./-]+\.png$/)
      expect(existsSync(join(ROOT, 'public', src.replace('{{ .SiteURL }}/', '')))).toBe(true)
    }
  })

  it('loads nothing else from outside', () => {
    expect(html).not.toMatch(/<link|<script|@import|url\(/i)
  })

  it('is signed by the company, with the address it comes from — the one its documents print', () => {
    expect(html).toContain(COMPANY_NAME)
    expect(html).toContain(`mailto:${SENDER.email}`)
    const printed = readFileSync(join(ROOT, 'src/lib/export/doc-sheet.tsx'), 'utf8').match(/email: '([^']+)'/)?.[1]
    expect(printed).toBe(SENDER.email)
  })
})

describe('what scripts/push-auth-email.mjs sends', () => {
  it('is what a local Supabase sends too', () => {
    const local = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8').match(/\[auth\.email\.template\.invite\]\s*\nsubject = "([^"]*)"\s*\ncontent_path = "\.\/([^"]*)"/)
    expect(local?.slice(1)).toEqual([INVITE.subject, INVITE.file])
  })

  it('without the app password, the subject and the body only — never half an SMTP', () => {
    expect(wanted()).toEqual({ mailer_subjects_invite: INVITE.subject, mailer_templates_invite_content: html })
    expect(wanted({ smtpPass: '   ' })).toEqual(wanted())
  })

  it('with it, the sender whole: HOUZS Venture <hello@houzsventure.com> through Google Workspace', () => {
    expect(wanted({ smtpPass: 'abcd efgh ijkl mnop' })).toEqual({
      mailer_subjects_invite: INVITE.subject,
      mailer_templates_invite_content: html,
      smtp_host: 'smtp.gmail.com',
      smtp_port: '465',
      smtp_user: 'hello@houzsventure.com',
      smtp_pass: 'abcdefghijklmnop',
      smtp_admin_email: 'hello@houzsventure.com',
      smtp_sender_name: 'HOUZS Venture',
      rate_limit_email_sent: EMAILS_PER_HOUR,
    })
  })
})
