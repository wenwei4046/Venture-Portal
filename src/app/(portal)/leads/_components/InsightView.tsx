'use client'

import { useRouter } from 'next/navigation'
import { Card, Cards, HvPage, PageHead, SectHead } from '@/components/hrv/kit'
import { rate, type LeadInsight, type TallyRow } from '@/lib/leads/insight'
import type { LeadPeriod } from '@/lib/leads/period'
import { Bi } from './bits'
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
      {onlyTests ? <div className={s.note} style={{ margin: '0 0 14px' }}><Bi block en="Only test conversations so far (Meta is not connected): these numbers are from tests." zh="目前只有测试资料，以下数字是测试资料算出来的。" /></div> : null}
      <Cards count={4} label="This month">
        <Card label="Phone rate · 拿电话率" value={rate(t.phones, t.conversations) == null ? '—' : `${rate(t.phones, t.conversations)}%`} note={`${t.phones} of ${t.conversations} conversations`} tone="primary" />
        <Card label="Handed · 已转交" value={String(t.handed)} note={`${rate(t.handed, t.phones) ?? '—'}% of phones`} />
        <Card label="Booked · 转交后预约" value={String(t.booked)} note={`${rate(t.booked, t.handed) ?? '—'}% of handed · reference`} />
        <Card label="Came · 到店" value={String(t.came)} note="Reference · 参考" />
      </Cards>

      <div style={{ marginTop: 22 }}>
        <SectHead title="By who handed over · 按客服" />
        <Table rows={insight.byPerson} first="CS · 客服" empty="Nothing handed over this month." />
      </div>
      <div className={s.twoCol} style={{ marginTop: 22 }}>
        <div>
          <SectHead title="By brand · 按品牌" />
          <Table rows={insight.byBrand} first="Brand · 品牌" empty="—" />
        </div>
        <div>
          <SectHead title="By ad · 按广告" />
          <Table rows={insight.byAd} first="Ad · 广告" empty="No conversations this month." />
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
          <tr><th>{first}</th><th className={s.num}>Chats<span className={s.zh}>对话</span></th><th className={s.num}>Phones<span className={s.zh}>电话</span></th><th>Phone rate<span className={s.zh}>拿电话率</span></th><th className={s.num}>Handed<span className={s.zh}>转交</span></th><th className={s.num}>Booked<span className={s.zh}>预约</span></th><th className={s.num}>Came<span className={s.zh}>到店</span></th></tr>
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
