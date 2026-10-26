import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { chatListFromRow, chatThreadFromRow, type ChatList, type ChatThread } from '@/lib/marketing/chat'

// The chat's reads (⑦-3), on the person's own session from the browser — as the bell reads its list: a thread when it
// opens and while it is in view, the list now and then. Never a Server Action fired on its own. Null when it cannot be.

const db = () => createClient() as unknown as SupabaseClient

export async function readChatThread(withWhom: string, before: number | null = null): Promise<ChatThread | null> {
  try {
    const { data, error } = await db().rpc('mkt_chat_thread', { p_with: withWhom, p_before: before })
    return error ? null : chatThreadFromRow(data)
  } catch {
    return null
  }
}

export async function readChatListNow(): Promise<ChatList | null> {
  try {
    const { data, error } = await db().rpc('mkt_chat_list')
    return error ? null : chatListFromRow(data)
  } catch {
    return null
  }
}
