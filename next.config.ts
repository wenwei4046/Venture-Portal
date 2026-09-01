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

  // Staff moved out of HR Costing into the Team module on 2026-09-01. Deep
  // links to a person, the edit form and the InfoTech import were all in use,
  // so the old tree keeps resolving. Temporary rather than permanent: a 308 is
  // cached by the browser forever, and this path may yet be reused.
  async redirects() {
    return [
      {
        source: '/hr-costing/staff/:path*',
        destination: '/team/people/:path*',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
