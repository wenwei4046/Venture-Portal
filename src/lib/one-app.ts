import { isHrView } from '@/lib/hr-view'
import { isFinanceShell, type ShellViewer } from '@/lib/finance-view'
import { can, type PermissionHolder } from '@/lib/permissions'

/**
 * ONE app for everybody (2026-10-11 — the user: "他们都是一个 app … 我要的就是
 * portal app"): the portal, the Revenue app and the HR app are faces of the same
 * install (public/manifest.webmanifest, start_url `/`). Which face opens:
 * - a Revenue member: the Revenue app (`/member`), on every screen;
 * - HR's view on a PHONE: the HR app (`/hr-app`). The portal's other HR pages
 *   (Payroll, People, Director Salary, the Revenue Department …) are for the
 *   computer — the user: "这些页面只在电脑用";
 * - Finance's view on a PHONE (2026-10-16): the Finance app (`/fin-app`) —
 *   every Finance page is an app screen, the user: "我不要再用那种 portal 的
 *   手机版了，把它全部转成 native app";
 * - the Principal's own view on a PHONE (2026-10-17): the Finance app too, with
 *   an Approvals tab of its own — the user: "the mobile use the same view with
 *   finance app … just add on then tab for approval tab";
 * - everybody else: the portal.
 * A view switcher moves the Principal between them all (setViewAs).
 */

/** A phone — not a tablet, not a computer — by its browser's own words. */
export function isPhone(userAgent: string | null | undefined): boolean {
  if (!userAgent || /iPad|Tablet/i.test(userAgent)) return false
  return /iPhone|iPod|Windows Phone/i.test(userAgent) || (/Android/i.test(userAgent) && /Mobile/i.test(userAgent))
}

/** Somebody the HR app opens for: a holder of one of HR's own areas (Hiring, Documentation, member requests). */
export function opensHrApp(user: PermissionHolder | null | undefined): boolean {
  return can(user, 'hiring', 'documentation', 'member_requests_manage')
}

/**
 * Does the app open as the HR app for them on a phone: HR's view (or an account
 * wholly on its title's template) with a part of the HR app open to them. Without
 * one, the portal stays — the HR app would have nothing to show and send them back.
 */
export function opensHrAppOnPhone(user: (PermissionHolder & { role: string }) | null | undefined): boolean {
  return !!user && (isHrView(user.role) || user.role === 'staff') && opensHrApp(user)
}

/**
 * Somebody the Finance app (`/fin-app`, 2026-10-15 — the Finance revamp v2's
 * phone) opens for: whoever wears Finance's shell — the finance kind, the
 * Principal's Finance lens, and the Principal's own view (2026-10-17,
 * `isFinanceShell`). Its screens each ask the page they stand for, as the
 * portal's would.
 */
export function opensFinApp(user: ShellViewer): boolean {
  return isFinanceShell(user)
}
