import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPANY_NAME } from './company'
import { RECOVERY, SENDER, wanted } from '../../scripts/push-auth-email.mjs'

// The reset-password email (2026-11-14): the sign-in's *Forgot password?* has Supabase send it;
// its body is supabase/templates/recovery.html, put into production by scripts/push-auth-email.mjs.
// Nothing in the app reads the file, so these checks stand between a slip in it and staff locked out.

const ROOT = process.cwd()
const html = readFileSync(join(ROOT, RECOVERY.file), 'utf8').replace(/\r\n/g, '\n')
const LINK = '{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery'

describe('the reset-password email', () => {
  it('opens our /reset-password with the token hash — the button and the copy-paste line', () => {
    const links = [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]).filter(href => href.includes('/reset-password'))
    expect(links).toEqual([LINK, LINK])
  })

  it('never carries Supabase’s own link — opening it spends the token, as a mail scanner would', () => {
    expect(html).not.toMatch(/ConfirmationURL|RedirectTo|\.Token\b/)
  })

  it('uses only the values Supabase hands a recovery email', () => {
    const actions = [...html.matchAll(/\{\{\s*(.*?)\s*\}\}/g)].map(m => m[1])
    const known = new Set(['.SiteURL', '.TokenHash', '.Email'])
    expect(actions.filter(action => !known.has(action))).toEqual([])
    expect(html.replace(/\{\{.*?\}\}/g, '')).not.toMatch(/\{\{|\}\}/)
  })

  it('is signed by the company, and sent with its subject', () => {
    expect(html).toContain(COMPANY_NAME)
    expect(html).toContain(`mailto:${SENDER.email}`)
    expect(wanted()).toMatchObject({ mailer_subjects_recovery: RECOVERY.subject, mailer_templates_recovery_content: html })
  })

  it('is what a local Supabase sends too', () => {
    const local = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8').match(/\[auth\.email\.template\.recovery\]\s*\nsubject = "([^"]*)"\s*\ncontent_path = "\.\/([^"]*)"/)
    expect(local?.slice(1)).toEqual([RECOVERY.subject, RECOVERY.file])
  })
})
