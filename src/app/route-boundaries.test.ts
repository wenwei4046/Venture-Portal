import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every portal navigation must cross a FRESH loading boundary (2026-09-26).
//
// Next keeps the page you are leaving on screen until the next one has
// rendered — unless the part of the tree that changes sits under a
// `loading.tsx` of its own. The boundary that matters is the one in the
// deepest folder the two URLs SHARE: /team/people → /team/hierarchy changes
// the child of `team`, so `team/loading.tsx` is the one that lets the click
// commit at once. Without it the nearest boundary is the portal's, which is
// already showing a page, and React holds that page frozen until the server
// answers: 0.2–1.4 s of a dead click, measured on production, for nearly
// every navigation inside a section (list → record, record → edit, one
// Revenue view to the next).
//
// So every route folder that can be that shared folder — two or more child
// routes, counting its own page, or a dynamic child ([id] → another [id]) —
// needs a loading.tsx, and it must be the shared RouteSkeleton.

// Vitest runs from the repository root.
const PORTAL_DIR = resolve(process.cwd(), 'src/app/(portal)')

const isRouteFolder = (name: string) => !name.startsWith('_') && !name.startsWith('.')

function hasPage(dir: string): boolean {
  if (existsSync(join(dir, 'page.tsx'))) return true
  return readdirSync(dir).some((name) => {
    const path = join(dir, name)
    return isRouteFolder(name) && statSync(path).isDirectory() && hasPage(path)
  })
}

interface Folder {
  route: string
  path: string
  children: string[]
}

function folders(dir: string, route = ''): Folder[] {
  const subfolders = readdirSync(dir).filter((name) => {
    const path = join(dir, name)
    return isRouteFolder(name) && statSync(path).isDirectory() && hasPage(path)
  })
  const children = [...(existsSync(join(dir, 'page.tsx')) ? ['(page)'] : []), ...subfolders]
  return [
    { route: route || '/', path: dir, children },
    ...subfolders.flatMap((name) => folders(join(dir, name), `${route}/${name}`)),
  ]
}

const branching = folders(PORTAL_DIR).filter(
  (folder) => folder.children.length >= 2 || folder.children.some((child) => child.startsWith('[')),
)

describe('portal loading boundaries', () => {
  it('finds the section folders (the scan itself works)', () => {
    const routes = branching.map((folder) => folder.route)
    expect(routes).toContain('/')
    expect(routes).toContain('/team')
    expect(routes).toContain('/fund-in/[id]')
    expect(routes).toContain('/revenue/[sub]/[period]')
    expect(branching.length).toBeGreaterThan(30)
  })

  it.each(branching.map((folder) => [folder.route, folder]))(
    '%s has a loading.tsx that renders the RouteSkeleton',
    (_route, folder) => {
      const loading = join((folder as Folder).path, 'loading.tsx')
      expect(existsSync(loading), `${relative(PORTAL_DIR, loading)} is missing`).toBe(true)
      expect(readFileSync(loading, 'utf8')).toContain('RouteSkeleton')
    },
  )
})
