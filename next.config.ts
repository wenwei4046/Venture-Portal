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

  async redirects() {
    return [
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
