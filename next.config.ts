import type { NextConfig } from 'next'

// The build's own name (2026-10-06). An installed app is resumed from memory,
// not reloaded, so a phone could run last week's build for days — and Next
// recalculates every Server Action's id per build, so that old copy's reads
// start failing the moment a release lands. The name is baked into the
// browser's bundle (NEXT_PUBLIC_APP_VERSION) and answered on /sw.js
// (X-App-Version, below); components/pwa/UpdatePrompt compares the two and
// offers the new one. Empty off Vercel: a local or CI build never prompts.
const APP_VERSION = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || ''

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  // Next 16 (2026-10-21) type-checks the build with the TypeScript CLI, which reads every file the tsconfig names —
  // the tests too, whose errors Next 15's own check skipped (`*.test.*`, `*.spec.*`, `__tests__`, `__mocks__`).
  // tsconfig.build.json is tsconfig.json less exactly those, so the build checks what it checked before; the editor
  // still reads tsconfig.json.
  typescript: {
    tsconfigPath: 'tsconfig.build.json',
  },
  experimental: {
    // Voucher attachments (transfer slips / invoices / scanned PDFs) are sent
    // through the Server Action body. The default cap is 1 MB — a scanned PDF
    // easily exceeds it and the upload fails with "An unexpected response was
    // received from the server". 4 MB stays safely under Vercel's ~4.5 MB
    // serverless request-body limit. Larger files would need a direct
    // browser→Supabase-Storage upload (not yet built); the client guards on it.
    serverActions: {
      bodySizeLimit: '4mb',
    },
    // The client router's memory. `dynamic`: a page visited in the last five
    // minutes (from its last visit) opens again from memory — no server round
    // trip; `static`: a page warmed on hover or while the portal sat idle
    // (lib/nav-warm.ts), or by the phone tab bar, is reused for five minutes.
    // 30 s until 2026-10-08 (user: 切换到另外一个 tab 都非常的慢), when a page shown
    // from memory started being read again behind itself
    // (components/layout/RouteFreshener.tsx): it is on screen at once, and the
    // server's new render swaps in a moment later — memory makes it instant,
    // the refresh keeps it current. A Server Action that revalidates a path or
    // sets a cookie still throws the whole memory away, and every write in the
    // portal does one or the other before it redirects (checked 2026-09-26) —
    // so your own edits always show at once.
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },

  // The service worker must never be served from a cache, or a fix to it
  // reaches phones days late. (public/sw.js, the installable app.) It also
  // says which build is live — never cached, and every deployment's own copy
  // — which is what UpdatePrompt asks with a HEAD request.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          ...(APP_VERSION ? [{ key: 'X-App-Version', value: APP_VERSION }] : []),
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }],
      },
      // The guest link's page (2026-10-11, the security review's N4). Its
      // address carries the link's code — the only key a guest needs — so the
      // page sends no Referer (a font or a file it loads would otherwise learn
      // the code), no other site may frame it, and nothing keeps a copy.
      {
        source: '/g/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      // The PIC's link (2026-10-24, Marketing ⑤-1): the same — its address carries the project's code.
      {
        source: '/t/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      // A Library share link (2026-10-24, Marketing ⑥-3): the same — its address carries the link's code, and so do
      // the addresses its files are fetched from (/l/<code>/f/<id>).
      {
        source: '/l/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },

  // Resolve old bookmarks before rendering any page.
  async redirects() {
    return [
      // There is only one login page; no legacy page component is needed.
      {
        source: '/member/login',
        destination: '/login',
        permanent: true,
      },
      // Staff moved out of HR Costing into the Team module. Deep links to a
      // person, the edit form and the InfoTech import were all in use, so the
      // old tree keeps resolving.
      {
        source: '/hr-costing/staff/:path*',
        destination: '/team/people/:path*',
        permanent: false,
      },
      // Commission left HR Costing for its own Departments group on
      // 2026-09-01 (`/revenue/<sub-department>`). A bookmark cannot know which
      // sub-department it meant, so everything lands on /revenue, which sends
      // on to the first one.
      {
        source: '/hr-costing/commission',
        destination: '/revenue',
        permanent: false,
      },
      {
        source: '/hr-costing/commission/:path*',
        destination: '/revenue',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
