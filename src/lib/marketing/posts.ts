// A task's posts (④-2c — the user's answer 15: "a post is a deliverable with a 📣 Post day; done = Scheduled, its owner
// marks it Posted, with its link"): each Post day its stages hold, where it stands, and whether the viewer marks it —
// its owner (the task's, the stage's) or the manager, as mkt_post_mark asks. Pure.

import type { MktPosted } from './board'
import { postState, type CalTone } from './calendar'
import type { MktTaskPage } from './task'

export interface TaskPost {
  /** "<stage idx>:<field>" — the mark's key (mkt_projects.posted). */
  key: string
  stage: number
  stageName: string
  field: string
  day: string
  posted: MktPosted | null
  state: { label: string; tone: CalTone }
  /** The viewer marks it (or takes the mark back). */
  mine: boolean
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** The task's posts, by day: each stage's Post day fields once filled. */
export function taskPosts(page: MktTaskPage, manage: boolean): TaskPost[] {
  const out: TaskPost[] = []
  for (const s of page.stages) {
    for (const f of s.form) {
      if (f.type !== 'Date' || f.cal?.kind !== 'post') continue
      const day = s.work.vals[f.label]
      if (typeof day !== 'string' || !DAY_RE.test(day)) continue
      const key = `${s.idx}:${f.label}`
      const posted = page.project.posted[key] ?? null
      out.push({
        key, stage: s.idx, stageName: s.name, field: f.label, day, posted,
        state: postState(page.project, { day, posted }, page.today),
        mine: manage || (!!page.me && (page.me === page.project.owner || page.me === s.owner)),
      })
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.stage - b.stage)
}

/** A link's place, as a post's line shows it: "instagram.com/p/abc". */
export function linkPlace(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 60)
  } catch {
    return url.slice(0, 60)
  }
}

/** A post's link as mkt_post_mark takes it: http(s), no spaces, at most 500 characters. */
export const postLinkOk = (v: string) => /^https?:\/\/\S+$/i.test(v.trim()) && v.trim().length <= 500
