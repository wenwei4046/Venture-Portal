// DORMANT — nothing loads this file (src/lib/no-active-middleware.test.ts). It was middleware.ts at the repo root, which
// Next 15 never loaded while the app lives in src/; Next 16's Turbopack build does, so it was renamed on 2026-10-21 to
// keep the portal as it ran. Switching it on (as src/proxy.ts, Next 16's name) refreshes the session and redirects every
// request it matches — the guest link (/g/…), a PIC's link (/t/…) and an invitation (/welcome) included, which it does not exclude: its own
// decision, with those paths added to the matcher first.
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export async function middleware(request: NextRequest) {
  // Machine scheduler requests are authenticated with a dedicated secret by
  // this exact endpoint. They must not be redirected to an interactive login.
  if (request.nextUrl.pathname === '/api/member-queue') {
    return NextResponse.next({ request })
  }
  // The development preview contains synthetic data only. Never bypass auth
  // for the real member workspace or for a production preview.
  if (process.env.NODE_ENV === 'development' && request.nextUrl.pathname === '/member/preview') {
    return NextResponse.next({ request })
  }
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session and establish who is calling — before any redirect
  // check. `getClaims()` verifies the JWT's signature locally against the
  // project's cached public keys (ES256), so unlike `getUser()` it costs no
  // round trip to the auth server on every request (2026-09-11). An expired
  // session is still refreshed through the cookies exactly as before.
  const { data: verified } = await supabase.auth.getClaims()
  const user = verified?.claims ?? null

  const isLoginPage = request.nextUrl.pathname === '/login'

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isLoginPage) {
    // `user` is the verified JWT's claims, so the account id is `sub` — there
    // is no `id` on it (that was the shape `getUser()` returned).
    const { data: profile } = await supabase.from('users').select('role, is_active').eq('id', user.sub).maybeSingle()
    if (!profile?.is_active) {
      // This device only — the default ('global') ends the account everywhere.
      await supabase.auth.signOut({ scope: 'local' })
      return supabaseResponse
    }
    const url = request.nextUrl.clone()
    url.pathname = profile.role === 'revenue_member' ? '/member' : '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // /api/erp/* is the ERP live feed: a database calling in with a shared
    // secret, no session to refresh and nothing to redirect. It authenticates
    // itself (src/lib/erp-sync/auth.ts) and must never be bounced to /login.
    // /api/whatsapp/* is Meta's WhatsApp webhook, the same kind of caller: it
    // proves itself with Meta's signature (src/lib/whatsapp/webhook.ts), and so
    // does /api/messenger/* — the same Meta app, for our Facebook Pages.
    // The installable-app files are public too: the browser fetches the
    // manifest without cookies, and the service worker and its offline page
    // must load when nobody is signed in.
    '/((?!api/erp/|api/whatsapp/|api/messenger/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
