'use client'

import { useRouter } from 'next/navigation'
import { Card, Cards, HvPage, PageHead, SectHead } from '@/components/hrv/kit'
import { rate, type LeadInsight, type TallyRow } from '@/lib/leads/insight'
import type { LeadPeriod } from '@/lib/leads/period'
import s from './lead.module.css'

/**
 * Lead View › Insight (the canvas's "Insight" board): the phone rate is the KPI (the user: 客服的 KPI 更多是在
 * 拿到電話號碼); handed, booked and came for reference — by brand, by ad, and by who handed the leads over.
 * Test conversations are left out. Reply times and the AI's share join with Meta and the AI agent.
 */
export default function InsightView({ insight, onlyTests = false, period, months }: { insight: LeadInsight; onlyTests?: boolean; period: LeadPeriod; months: LeadPeriod[] }) {
  const router = useRouter()
  const t = insight.total
  return (
    <HvPage>
      <PageHead eyebrow="Lead View" title="Insight" right={
        <select className={s.select} aria-label="Month" value={period.month} onChange={e => router.push(`/leads/insight?m=${e.target.value}`)}>
          {months.map(m => <option key={m.month} value={m.month}>{m.label}</option>)}
        </select>
      } />
      {onlyTests ? <div className={s.note} style={{ margin: '0 0 14px' }}>目前只有測試資料（Meta 還沒串接），以下數字是測試資料算出來的。</div> : null}
      <Cards count={4} label="This month">
        <Card label="拿電話率 Phone rate" value={rate(t.phones, t.conversations) == null ? '—' : `${rate(t.phones, t.conversations)}%`} note={`${t.phones} / ${t.conversations} 個對話`} tone="primary" />
        <Card label="已轉交 Handed" value={String(t.handed)} note={`${rate(t.handed, t.phones) ?? '—'}% of phones`} />
        <Card label="轉交後預約 Booked" value={String(t.booked)} note={`${rate(t.booked, t.handed) ?? '—'}% of handed · 參考`} />
        <Card label="到店 Came" value={String(t.came)} note="參考 reference" />
      </Cards>

      <div style={{ marginTop: 22 }}>
        <SectHead title="按客服 By who handed over" />
        <Table rows={insight.byPerson} first="客服 CS" empty="這個月還沒有轉交。" />
      </div>
      <div className={s.twoCol} style={{ marginTop: 22 }}>
        <div>
          <SectHead title="按品牌 By brand" />
          <Table rows={insight.byBrand} first="品牌 Brand" empty="—" />
        </div>
        <div>
          <SectHead title="按廣告 By ad" />
          <Table rows={insight.byAd} first="廣告 Ad" empty="這個月還沒有對話。" />
        </div>
      </div>
    </HvPage>
  )
}

function Table({ rows, first, empty }: { rows: TallyRow[]; first: string; empty: string }) {
  return (
    <div className={s.tableBox}>
      <table className={s.table}>
        <thead>
          <tr><th>{first}</th><th className={s.num}>對話</th><th className={s.num}>電話</th><th>拿電話率</th><th className={s.num}>轉交</th><th className={s.num}>預約</th><th className={s.num}>到店</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className={s.muted} style={{ textAlign: 'center', padding: 22 }}>{empty}</td></tr>
          ) : rows.map(r => {
            const pct = rate(r.phones, r.conversations)
            return (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td className={s.num}>{r.conversations}</td>
                <td className={s.num}>{r.phones}</td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={s.bar}><span className={s.barFill} style={{ width: `${pct ?? 0}%` }} /></span>
                    <span className={s.mono}>{pct == null ? '—' : `${pct}%`}</span>
                  </span>
                </td>
                <td className={s.num}>{r.handed}</td>
                <td className={s.num}>{r.booked}</td>
                <td className={s.num}>{r.came}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
