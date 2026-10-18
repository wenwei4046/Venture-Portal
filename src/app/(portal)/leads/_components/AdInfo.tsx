import { adLabel, adsManagerLink } from '@/lib/leads/ads'
import type { LeadContact } from '@/lib/leads/types'
import { Bi, CHANNEL_LABEL } from './bits'
import s from './lead.module.css'

/**
 * Where the customer came from (2026-10-18 — the user: "我要看到廣告名稱，來源，鏈接"): the ad's name (Ads Manager's,
 * or one given on Settings › Ads; else Meta's headline), the channel with its campaign › ad set, and links to the
 * ad's post and to Ads Manager. Organic says so.
 */
export default function AdInfo({ contact }: { contact: LeadContact }) {
  const label = adLabel(contact)
  if (!label) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className={s.label}><Bi en="Source" zh="来源" /></span>
        <span style={{ fontSize: 13 }}>{CHANNEL_LABEL[contact.channel]} · Organic<span className={s.zh}>自然流量</span></span>
      </div>
    )
  }
  const manager = adsManagerLink(contact.adAccount ?? '', contact.adId ?? '')
  const where = [contact.adCampaign, contact.adSet].filter(Boolean).join(' › ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className={s.label}><Bi en="From the ad" zh="广告来源" /></span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      {!contact.adName && contact.adId ? (
        <span className={s.hint}><Bi en="Name not known yet — name it on Settings › Ads, or fetch it from Meta." zh="还不知道广告名称：可在 Settings › Ads 取名或从 Meta 抓取。" /></span>
      ) : null}
      <span className={s.hint}>
        {CHANNEL_LABEL[contact.channel]}{where ? ` · ${where}` : ''}
        {contact.adName && contact.sourceAd && contact.sourceAd !== contact.adName ? ` · "${contact.sourceAd}"` : ''}
      </span>
      {contact.adLink || manager ? (
        <span className={s.tabs} style={{ gap: 12 }}>
          {contact.adLink ? <a href={contact.adLink} target="_blank" rel="noopener noreferrer" className={s.linkBtn}><Bi en="View the ad ↗" zh="查看广告" /></a> : null}
          {manager ? <a href={manager} target="_blank" rel="noopener noreferrer" className={s.linkBtn}><Bi en="Ads Manager ↗" zh="广告管理工具" /></a> : null}
        </span>
      ) : null}
      {contact.adId ? <span className={s.hint} style={{ fontFamily: 'var(--font-mono), monospace' }}>ID {contact.adId}</span> : null}
    </div>
  )
}
