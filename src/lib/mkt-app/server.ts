import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@/types'
import { mayActOn } from '@/lib/auth'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { indexBoard, isSeries, type MktBoard } from '@/lib/marketing/board'
import { calendarEvents } from '@/lib/marketing/calendar'
import type { ChatTask } from '@/lib/marketing/chat'
import { groupTone, toneBg } from '@/lib/marketing/groups'
import { plateColumns, plateOf, weekRows } from '@/lib/marketing/my-space'
import { projectRows } from '@/lib/marketing/projects'
import { readBoard, readChatList, readLobby, readNotices, readPet, readSpace } from '@/lib/marketing/server'
import { initialOf, mktShellFromRow } from '@/lib/marketing/shell'
import { petState, type LobbyPet } from '@/lib/marketing/space'
import { officeToday } from '@/lib/office-time'
import { opensPage } from '@/lib/page-tabs'
import { canDo } from '@/lib/permission-actions'
import { can } from '@/lib/permissions'
import { parseApproval, parseRequests, type ApprovalRead, type PaymentRequest } from '@/lib/payment-requests/model'
import { startRead } from '@/lib/start-read'
import { createClient } from '@/lib/supabase/server'
import type { AppClaims, AppMay, AppParts, MktAppData } from './model'

// The Marketing app's reads (2026-11-28): My Space's — the board, the notices, the space, the pet, the lobby, the chat —
// the sidebar's counts and one's own claims, every one under the viewer's own session and side by side, as the desktop's
// pages read them. Each part asks its page's tab (lib/page-tabs.ts) and its cell; a part closed to the viewer is simply
// empty and the app still draws. A task, a visit and a chat's thread are read from the browser when they are opened —
// the person's own move (lib/mkt-app/read.ts).

const client = async () => (await createClient()) as unknown as SupabaseClient

/** Each part of the app is the portal page it stands for: its tab open, its cell held (the HR app's PART_PAGE). */
export function appParts(user: Pick<User, 'tabs' | 'permissions' | 'actions' | 'viewingAs'>, personal: boolean): AppParts {
  const tabs = user.tabs
  const claims = opensPage(tabs, '/claims') && can(user, 'claims') && personal && !user.viewingAs
  return {
    projects: opensPage(tabs, '/marketing/projects'),
    calendar: opensPage(tabs, '/marketing/calendar'),
    claims,
    claimsApprove: claims && canDo(user, 'claims', 'view', 'dept'),
    library: opensPage(tabs, '/marketing/library'),
    rooms: opensPage(tabs, '/admin/rooms'),
    manager: canDo(user, 'marketing', 'manage') && opensPage(tabs, '/marketing/tracking'),
  }
}

/** The writes behind the buttons, each asked of the pages its action names (`mayActOn`). None while viewing as a person. */
async function appMay(user: Pick<User, 'viewingAs'>): Promise<AppMay> {
  if (user.viewingAs) return { create: false, edit: false, decide: false, manage: false, space: false }
  const [create, edit, approve, manage, space] = await Promise.all([
    mayActOn('/marketing/new', 'marketing', 'create'),
    mayActOn('/marketing/projects/[id]', 'marketing', 'edit'),
    mayActOn('/marketing/projects/[id]', 'marketing', 'approve'),
    mayActOn(['/marketing/projects/[id]', '/marketing/tracking'], 'marketing', 'manage'),
    mayActOn('/marketing', 'marketing', 'edit'),
  ])
  // Being named on a level is what lets somebody decide: Approve, or Edit (decideMktStage asks either).
  return { create, edit, decide: approve || edit, manage, space }
}

/** What a chat message may carry: the board's tasks — never a series' pattern — the latest first (My Space's). */
export function chatTasksOf(board: MktBoard): ChatTask[] {
  return board.projects
    .filter(p => !isSeries(p) && p.trackId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 40)
    .map(p => ({ id: p.id, track: p.trackId, title: p.title }))
}

/** Each pet in the lobby, feeling as its owner's plate and its energy make it (My Space's lobbyOf). */
function lobbyOf(board: MktBoard, pets: LobbyPet[], now: Date) {
  return pets.map(p => ({ ...p, state: petState(plateOf(plateColumns(board, p.staff, now)), p.energy) }))
}

/** One's own claims, and — for a holder of Claim & approve — the department's, as the Claim page reads them. */
async function readClaims(approve: boolean, create: boolean): Promise<AppClaims> {
  const db = await client()
  const [mine, approval] = await Promise.all([
    db.rpc('my_payment_requests'),
    approve ? db.rpc('payment_requests_for_approval') : Promise.resolve(null),
  ])
  const error = mine.error
    ? mine.error.code === '42501' ? mine.error.message : 'Your requests could not be read. Pull down to try again.'
    : null
  const read: ApprovalRead | null = approval && !approval.error ? parseApproval(approval.data) : null
  const rows: PaymentRequest[] = mine.error ? [] : parseRequests(mine.data)
  return { mine: rows, approval: read, canCreate: create, error }
}

export async function loadMktAppData(user: User): Promise<MktAppData> {
  const now = new Date()
  const today = officeToday()
  const personalRead = startRead(user.viewingAs ? Promise.resolve(false) : loginIsPersonal())
  const notices = startRead(readNotices(30))
  const space = startRead(readSpace())
  const pet = startRead(readPet())
  const pets = startRead(readLobby())
  const chat = startRead(readChatList())
  const shell = startRead((async () => {
    const { data, error } = await (await client()).rpc('mkt_shell')
    return error ? null : mktShellFromRow(data)
  })())
  const mayRead = startRead(appMay(user))
  const board = await readBoard()
  const personal = await personalRead
  const parts = appParts(user, personal)
  const claimsRead = parts.claims ? startRead(readClaims(parts.claimsApprove, canDo(user, 'claims', 'create', 'own'))) : null

  const columns = plateColumns(board, board.me, now)
  const me = indexBoard(board).person(board.me)
  const first = me?.first || (user.viewingAs?.name ?? user.name ?? '').split(/\s+/)[0] || 'Marketing'
  const full = me?.full || user.viewingAs?.name || user.name || 'Marketing'
  const sh = await shell
  return {
    today: board.today || today,
    me: {
      staff: board.me,
      first,
      full,
      role: me ? me.role || me.title : null,
      letter: initialOf(first),
      avatarBg: me ? toneBg(groupTone(me.title)) : toneBg('manager'),
    },
    viewingAs: user.viewingAs?.name ?? null,
    personalLogin: personal,
    // The app opens only in Marketing's view (opensMktApp), so that is the row marked *You are here*.
    views: user.canSwitchView && !user.viewingAs ? { current: 'marketing' } : null,
    parts,
    may: await mayRead,
    columns,
    week: weekRows(columns, board.today),
    rows: projectRows(board),
    subs: board.subs,
    events: calendarEvents(board),
    notices: await notices,
    space: await space,
    pet: await pet,
    // A pet lives in the room of somebody on Marketing's roster (not the Principal's shared login — question 37).
    hasPet: !!me,
    plate: plateOf(columns),
    lobby: lobbyOf(board, await pets, now),
    chat: await chat,
    chatTasks: chatTasksOf(board),
    claims: claimsRead ? await claimsRead : null,
    counts: { tracking: sh?.counts.tracking ?? 0, claims: sh?.counts.claims ?? 0 },
  }
}
