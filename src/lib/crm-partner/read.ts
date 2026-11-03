import 'server-only'
import { guestClient } from '@/lib/guest/client'
import { isPartnerCode, pageFromRow, type PartnerPage } from './model'

/** What /b/<code> draws — closed for a code that is not a partner's, or while its link is off (mig 20261029190000). */
export async function readPartnerPage(code: string): Promise<PartnerPage> {
  if (!isPartnerCode(code)) return { on: false }
  const { data, error } = await guestClient().rpc('crm_partner_page', { p_code: code })
  return error ? { on: false } : pageFromRow(data)
}
