import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Q7 (2026-10-09): a page decides by the viewer's cells (lib/surfaces.ts,
// canDo), never by their account's KIND (`user.role`) — the kind is a
// template's hidden base_role, and a custom template's cells need not agree
// with it. The kind is still read where IT is the point; every such file is
// listed here with why. A new `user.role` anywhere else fails this test:
// reach for a rule in lib/surfaces.ts (or canDo) instead.

const SRC = path.resolve(__dirname, '..')

const KIND_IS_THE_POINT: Record<string, string> = {
  'app/page.tsx': 'which app the account belongs to: the Revenue app or the portal',
  'app/(portal)/layout.tsx': 'which app the account belongs to: the Revenue app or the portal',
  'app/(portal)/approvals/page.tsx': "canSetDefault — the shared table layout, kept by kind in the database (table_layout_defaults_set)",
  'app/(portal)/payments/_components/VoucherLedger.tsx': "canSetDefault — the shared table layout, kept by kind in the database (table_layout_defaults_set)",
  'app/(portal)/hr-costing/payroll/[period]/page.tsx': "reopening a Total-Closed month — the Principal's own power (payroll_reopen_month)",
  'lib/approval-domains.ts': 'the owner kind — the Principal may decide what they raised themselves (approver_may)',
  'lib/view-as.ts': "the view-as switch — the Principal's mask is a kind",
  'lib/auth.ts': 'loading the account and its view-as mask; requireRole for the dept_manager row policies',
  'components/layout/PortalFrame.tsx': "the phone's tab bar and the switcher's value — presentation by kind",
  'components/layout/MoreSheet.tsx': 'labels and the tab bar it mirrors — presentation',
  'components/layout/TopBar.tsx': 'the role label and the view-as switcher — presentation',
  'test/with-actions.ts': 'test helper: a mocked untemplated account',
}

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && !/database\.types/.test(e.name) ? [p] : []
  })
}

describe('pages decide by cells, not by the account kind', () => {
  it('no user.role outside the files where the kind is the point', () => {
    const offenders: string[] = []
    for (const file of files(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/')
      if (rel in KIND_IS_THE_POINT) continue
      const src = fs.readFileSync(file, 'utf8')
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        if (/\buser\??\.role\b|\buserRole\b/.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('every file on the list still reads the kind (a stale entry is a hole)', () => {
    const stale = Object.keys(KIND_IS_THE_POINT).filter(rel => {
      const p = path.join(SRC, rel)
      return !fs.existsSync(p) || !/\b(user|viewer|v|row|profile)\??\.(role|actualRole)\b|role=\{|\brole\b/.test(fs.readFileSync(p, 'utf8'))
    })
    expect(stale).toEqual([])
  })
})
