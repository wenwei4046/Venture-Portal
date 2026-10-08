import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function POST(request:NextRequest) {
  const origin=request.headers.get('origin')
  if (!origin || new URL(origin).host!==request.nextUrl.host) return new NextResponse('Forbidden',{status:403})
  const supabase=await createClient()
  // This device only — the default ('global') ends the account everywhere.
  await supabase.auth.signOut({ scope: 'local' })
  return NextResponse.redirect(new URL('/login',request.url),303)
}
