'use client'

import { reportPushTrouble } from '@/lib/push/actions'
import PushAsk from './PushAsk'
import { PORTAL_PUSH_APP, PORTAL_PUSH_BODY, savePushFromBrowser } from './portal-push'

/**
 * The first open's question on the portal's phone face (2026-10-16), as the HR app and the Revenue app ask it: once
 * per phone, *Turn on notifications?*; and every open signs a phone that said yes up again — from the browser, and
 * without telling the server on its own what went wrong (a press still does). PortalFrame shows it on a phone only,
 * never while viewing as a person.
 */
export default function PortalPushAsk() {
  return <PushAsk app={PORTAL_PUSH_APP} save={savePushFromBrowser} trouble={reportPushTrouble} body={PORTAL_PUSH_BODY} reportOpen={false} />
}
