import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { reviewPageFromRow } from '@/lib/marketing/chat-review'
import type { ChatMessage } from '@/lib/marketing/chat'

// A chat opened on a complaint (⑦-3b): its older messages, on the person's own session from the browser — under the
// record they made, within the hour (the database asks, and says so when it is past).

const db = () => createClient() as unknown as SupabaseClient

export async function readChatReviewMore(review: number, before: number): Promise<{ messages: ChatMessage[]; more: boolean } | { reason: string }> {
  try {
    const { data, error } = await db().rpc('mkt_chat_review_more', { p_review: review, p_before: before })
    if (error) return { reason: error.message || 'The earlier messages could not be read.' }
    return reviewPageFromRow(data)
  } catch {
    return { reason: 'The earlier messages could not be read.' }
  }
}
