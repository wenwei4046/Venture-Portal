import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// EVERY VIEW SWITCHER LISTS EVERY VIEW (2026-10-27 — the user, the Revenue app's module menu showing four views and
// Marketing's none of Lead View: "我要全部是跟 principal 那种的，它能够显示出来全部的东西"). A switcher that writes its own
// rows drifts the day a view is added, as those two had — so every file that draws one (by its accessible name) reads
// its rows from lib/view-switch.ts, itself or through the module that keeps that face's rows.

const NAMES = /View portal as role|["']Switch module["']|["']Switch view["']/

/** The modules a switcher may read the list through: each reads lib/view-switch.ts itself. */
const THROUGH = [
  "from '@/lib/view-switch'",
  'from "@/lib/view-switch"',
  // The HR app's rows: HR_APP_VIEWS.
  "from '@/lib/hr-app/model'",
  // The Revenue app's rows: MODULES.
  'from "../shell/Chrome"',
]

function files(at: string): string[] {
  const full = path.join(process.cwd(), at)
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(e => {
    const rel = path.join(at, e.name)
    if (e.isDirectory()) return files(rel)
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : []
  })
}

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')
const switchers = files('src').filter(f => NAMES.test(read(f))).map(f => f.replace(/\\/g, '/')).sort()

describe('every view switcher', () => {
  it('is found — the portal’s bars, the Revenue app’s and the CRM’s module menus, the phones’ Switch view', () => {
    expect(switchers).toEqual([
      'src/components/fin-app/ProfileScreen.tsx',
      'src/components/hr-app/HrApp.tsx',
      'src/components/layout/ViewSwitch.tsx',
      'src/components/member/app/profile/ProfileMain.tsx',
      'src/components/member/app/shell/Chrome.tsx',
      'src/components/member/crm/desk/Desk4a.tsx',
    ])
  })

  it('reads its rows from lib/view-switch.ts', () => {
    expect(switchers.filter(f => !THROUGH.some(t => read(f).includes(t)))).toEqual([])
    for (const f of ['src/lib/hr-app/model.ts', 'src/components/member/app/shell/Chrome.tsx']) {
      expect(read(f)).toMatch(/from ['"]@\/lib\/view-switch['"]/)
    }
  })
})
