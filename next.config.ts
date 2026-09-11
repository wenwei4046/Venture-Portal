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
