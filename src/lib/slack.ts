/**
 * Slack webhook notification helper.
 *
 * Configure via treasury_config key 'slack_webhook_url'.
 * If not configured, notifications are silently skipped (no error).
 *
 * Events:
 * - New approval request submitted
 * - Approval decision (approved/rejected)
 * - Overdue detected
 * - Statement issued/paid
 * - Director salary calculated
 */

import { createClient } from '@/lib/supabase/server'

interface SlackMessage {
  text: string
  blocks?: Array<{
    type: string
    text?: { type: string; text: string }
    fields?: Array<{ type: string; text: string }>
  }>
}

async function getWebhookUrl(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('treasury_config')
      .select('config_value')
      .eq('config_key', 'slack_webhook_url')
      .maybeSingle()
    // config_value is decimal type, but we store the URL as a text config
    // For now, check a separate table or env var
    return process.env.SLACK_WEBHOOK_URL ?? null
  } catch {
    return null
  }
}

async function send(message: SlackMessage): Promise<void> {
  const url = await getWebhookUrl()
  if (!url) return // silently skip if not configured

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })
  } catch {
    // Non-blocking — notification failure should never break the app
    console.error('[slack] Failed to send notification')
  }
}

export async function notifyNewApproval(type: string, description: string, amount: number, submittedBy: string) {
  await send({
    text: `🔔 New approval: ${type}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*New Approval Request*\n${description}` },
        fields: [
          { type: 'mrkdwn', text: `*Type:*\n${type.replace('_', ' ')}` },
          { type: 'mrkdwn', text: `*Amount:*\nRM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}` },
          { type: 'mrkdwn', text: `*Submitted by:*\n${submittedBy}` },
        ],
      },
    ],
  })
}

export async function notifyApprovalDecision(type: string, status: 'approved' | 'rejected', description: string, decidedBy: string) {
  const emoji = status === 'approved' ? '✅' : '❌'
  await send({
    text: `${emoji} Approval ${status}: ${type}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Approval ${status.charAt(0).toUpperCase() + status.slice(1)}* ${emoji}\n${description}` },
        fields: [
          { type: 'mrkdwn', text: `*Type:*\n${type.replace('_', ' ')}` },
          { type: 'mrkdwn', text: `*Decided by:*\n${decidedBy}` },
        ],
      },
    ],
  })
}

export async function notifyOverdueDetected(companyName: string, days: number, amount: number) {
  await send({
    text: `⚠️ Overdue: ${companyName} — ${days} days`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Overdue Detected*\n${companyName} is ${days} days overdue` },
        fields: [
          { type: 'mrkdwn', text: `*Penalty:*\nRM ${amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}` },
        ],
      },
    ],
  })
}

export async function notifyStatementIssued(companyName: string, period: string, netAmount: number) {
  await send({
    text: `📄 Statement issued: ${companyName} — ${period}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Statement Issued*\n${companyName} — ${period}` },
        fields: [
          { type: 'mrkdwn', text: `*Net Amount:*\nRM ${netAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}` },
        ],
      },
    ],
  })
}

export async function notifyDirectorSalaryCalculated(period: string, directorCount: number, totalSaving: number) {
  await send({
    text: `💰 Director salary calculated: ${period}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Director Salary Calculated*\n${period}` },
        fields: [
          { type: 'mrkdwn', text: `*Directors:*\n${directorCount}` },
          { type: 'mrkdwn', text: `*5% Saving:*\nRM ${totalSaving.toLocaleString('en-MY', { minimumFractionDigits: 2 })}` },
        ],
      },
    ],
  })
}
