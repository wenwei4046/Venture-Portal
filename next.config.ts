import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
    // The client router's memory (2026-09-26). `dynamic`: a page visited in
    // the last 30 s opens again from memory — no server round trip — the way
    // the Houzs ERP's 30 s query cache makes a revisit instant. `static`: a
    // page warmed on hover (lib/nav-warm.ts), or by the phone tab bar, is
    // reused for 30 s rather than Next's default 5 minutes, so nothing shown
    // from memory is older than half a minute. A Server Action that
    // revalidates a path or sets a cookie throws the whole memory away, and
    // every write in the portal does one or the other before it redirects
    // (checked 2026-09-26) — so your own edits always show at once.
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
  },

  // The service worker must never be served from a cache, or a fix to it
  // reaches phones days late. (public/sw.js, the installable app.)
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }],
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
