import { navigationStarted } from '@/lib/nav-progress'

// Next.js runs this file in the browser before the app hydrates, and calls
// `onRouterTransitionStart` synchronously the moment any client navigation
// begins — a <Link> click, router.push / replace, back and forward. The App
// Router has no other navigation-start event; the portal's progress line
// (components/layout/NavProgress.tsx) starts from here. Must stay tiny: it is
// part of every page's first JavaScript.
export function onRouterTransitionStart(): void {
  navigationStarted()
}
