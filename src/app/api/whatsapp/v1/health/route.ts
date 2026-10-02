import { NextResponse } from 'next/server'

/**
 * GET /api/whatsapp/v1/health — what the CRM's Settings › WhatsApp card shows:
 * which settings are in place. Yes/no only — never a value, never a length.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  const set = (name: string) => Boolean(process.env[name]?.trim())
  return NextResponse.json({
    verifyToken: set('WHATSAPP_VERIFY_TOKEN'),
    appSecret: set('META_APP_SECRET'),
    accessToken: set('META_SYSTEM_USER_TOKEN'),
    phoneNumberId: set('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccountId: set('WHATSAPP_BUSINESS_ACCOUNT_ID'),
  })
}
