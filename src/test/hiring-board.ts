// The handoff's own sample data (Revenue App.dc.html: HIRES, TALENTS, HIRE_FIELDS,
// HIRE_SOURCES, STAFF) as a HiringBoard — the Hiring tests' one board. Instants are
// noon in the office (04:00 UTC) of the prototype's days.
import type { HiringBoard, HiringCandidate, HiringEvent, HiringField, HiringRequest, HiringTalent } from '@/lib/hiring/types'

const MON: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
const iso = (d: string) => {
  const [day, m, y] = d.split(' ')
  return `${y}-${MON[m]}-${day.padStart(2, '0')}T04:00:00.000Z`
}

const PEOPLE = [
  ['anthony', 'Anthony', 'Team Leader'], ['chea', 'Chea Huan', 'Team Leader'], ['lawrence', 'Lawrence', 'Team Leader'], ['stanley', 'Stanley', 'Team Leader'],
  ['limyw', 'Lim Yau Wei', 'Team Assistant'], ['zack', 'Zack', 'Senior Revenue Specialist'], ['adrian', 'Adrian', 'Revenue Specialist'], ['esther', 'Esther', 'Revenue Specialist'],
  ['karjun', 'Kar Jun', 'Team Assistant'], ['louis', 'Louis', 'Revenue Specialist'], ['melvin', 'Melvin Chong', 'Senior Revenue Specialist'], ['marcus', 'Marcus', 'Revenue Specialist'],
].map(([id, name, title]) => ({ id, name, title, department: 'Revenue' }))
const OTHER = [
  { id: 'grace', name: 'Grace Lim', title: 'HR Manager', department: 'HR' }, { id: 'nurul', name: 'Nurul Huda', title: 'HR Executive', department: 'HR' },
  { id: 'jason', name: 'Jason Ong', title: 'Finance Manager', department: 'Finance' }, { id: 'meiling', name: 'Mei Ling', title: 'Accountant', department: 'Finance' },
  { id: 'farah', name: 'Farah Aziz', title: 'Account Executive', department: 'Finance' }, { id: 'kelvin', name: 'Kelvin Tan', title: 'Account Executive', department: 'Finance' },
  { id: 'priya', name: 'Priya Nair', title: 'Account Assistant', department: 'Finance' },
]
const STAFF = [...PEOPLE, ...OTHER]
const nameOf = (id: string) => STAFF.find(p => p.id === id)?.name ?? id
const deptOf = (id: string) => STAFF.find(p => p.id === id)?.department ?? ''

const FIELDS: HiringField[] = [
  { id: 'position', label: 'Position', type: 'text', options: '', required: true, core: true },
  { id: 'dept', label: 'Department', type: 'select', options: 'Revenue · Fair, Revenue · IR, HR, Finance', required: true, core: true },
  { id: 'headcount', label: 'Headcount', type: 'number', options: '', required: true, core: false },
  { id: 'budget', label: 'Budget (RM / month)', type: 'range', options: '', required: true, core: false },
  { id: 'start', label: 'Expected start', type: 'select', options: 'Immediately, Within 1 month, Within 2 months, Within 3 months', required: true, core: false },
  { id: 'emp', label: 'Employment type', type: 'select', options: 'Full-time, Part-time, Contract, Internship', required: false, core: false },
  { id: 'reason', label: 'Reason', type: 'select', options: 'New position, Replacement, Expansion', required: false, core: false },
  { id: 'age', label: 'Age requirement', type: 'range', options: '', required: false, core: false },
  { id: 'gender', label: 'Gender', type: 'select', options: 'Any, Male, Female', required: false, core: false },
  { id: 'race', label: 'Race', type: 'select', options: 'Any, Malay, Chinese, Indian, Others', required: false, core: false },
  { id: 'jd', label: 'Job description', type: 'longtext', options: '', required: true, core: false },
  { id: 'notes', label: 'Special notes', type: 'longtext', options: '', required: false, core: false },
]

type Ev = [string, string, string, string?]
const evs = (list: Ev[]): HiringEvent[] => list.map(([what, when, who, note]) => ({ what, who, note: note ?? '', at: iso(when) }))

interface Raw {
  id: string; by: string; when: string; status: HiringRequest['status']; owner?: string; hired?: string
  a: Record<string, string>; events: Ev[]; cands?: Array<Partial<HiringCandidate> & { talent?: string; file?: string; x?: Record<string, string> }>
}
const RAW: Raw[] = [
  { id: 'HR-205', by: 'karjun', when: '9 Oct 2026', status: 'submitted', a: { position: 'Senior Revenue Specialist', dept: 'Revenue · IR', headcount: '1', budget: '3,200–3,800', start: 'Within 1 month', emp: 'Full-time', reason: 'Expansion', age: '25–40', gender: 'Any', race: 'Any', jd: 'Lead fair sales for IR, coach two juniors and keep the weekly brand targets.', notes: 'Must drive; outstation fairs twice a month.' }, events: [['Submitted', '9 Oct 2026', 'Kar Jun']] },
  { id: 'HR-204', by: 'jason', when: '6 Oct 2026', status: 'submitted', a: { position: 'Account Executive', dept: 'Finance', headcount: '1', budget: '3,300–3,800', start: 'Within 2 months', emp: 'Full-time', reason: 'Replacement', age: '23–35', gender: 'Any', race: 'Any', jd: 'AR/AP, bank reconciliation and month-end close support.', notes: 'Replacing Priya on maternity leave from December.' }, events: [['Submitted', '6 Oct 2026', 'Jason Ong']] },
  { id: 'HR-203', owner: 'grace', by: 'chea', when: '28 Sep 2026', status: 'acknowledged', a: { position: 'Revenue Specialist', dept: 'Revenue · Fair', headcount: '2', budget: '2,800–3,200', start: 'Within 1 month', emp: 'Full-time', reason: 'Expansion', age: '20–35', gender: 'Any', race: 'Any', jd: 'Sell at fairs and roadshows; follow up leads in the Revenue app.', notes: '' }, events: [['Submitted', '28 Sep 2026', 'Chea Huan'], ['Acknowledged', '29 Sep 2026', 'Grace Lim', 'Posting on JobStreet this week'], ['Interview booked', '10 Oct 2026', 'Grace Lim', 'Daniel Lee · Meeting Room 2']],
    cands: [{ id: 'C-1', name: 'Daniel Lee', phone: '016-221 0457', source: 'Applied', stage: 'appointment', file: 'Daniel_Lee_CV.pdf', x: { salary: '3000', avail: '2026-11-01', transport: 'Yes' }, note: 'Referred by Chea Huan. Interviewed 10 Oct, strong on customer follow-up.' }, { id: 'C-2', name: 'Nur Iman', phone: '012-778 4410', source: 'Talent Bank', talent: 'T-104', stage: 'shortlisted', file: 'Nur_Iman_CV.pdf', note: 'Runner-up for HR-202. Prefers a sales role.' }] },
  { id: 'HR-202', owner: 'grace', by: 'stanley', when: '2 Sep 2026', status: 'filled', hired: 'Siti Aisyah', a: { position: 'Team Assistant', dept: 'Revenue · Fair', headcount: '1', budget: '2,800–3,200', start: 'Immediately', emp: 'Full-time', reason: 'New position', age: '22–35', gender: 'Female', race: 'Any', jd: 'Support the Stanley team with rosters, claims and stock checks.', notes: '' }, events: [['Submitted', '2 Sep 2026', 'Stanley'], ['Acknowledged', '3 Sep 2026', 'Grace Lim'], ['Filled', '24 Sep 2026', 'Grace Lim', 'Hired: Siti Aisyah']],
    cands: [{ id: 'C-3', name: 'Siti Aisyah', phone: '019-880 3312', source: 'Applied', stage: 'hired', file: 'Siti_Aisyah_CV.pdf' }, { id: 'C-4', name: 'Nur Iman', phone: '012-778 4410', source: 'Applied', stage: 'rejected', talent: 'T-104', file: 'Nur_Iman_CV.pdf' }] },
  { id: 'HR-201', owner: 'grace', by: 'grace', when: '20 Aug 2026', status: 'cancelled', a: { position: 'HR Executive', dept: 'HR', headcount: '1', budget: '3,000–3,500', start: 'Within 2 months', emp: 'Contract', reason: 'Expansion', age: '', gender: 'Any', race: 'Any', jd: 'Recruitment and onboarding.', notes: '' }, events: [['Submitted', '20 Aug 2026', 'Grace Lim'], ['Acknowledged', '20 Aug 2026', 'Grace Lim'], ['Cancelled', '15 Sep 2026', 'Grace Lim', 'Covered by Nurul Huda']] },
  { id: 'HR-200', owner: 'nurul', by: 'chea', when: '4 Aug 2026', status: 'filled', hired: 'Esther', a: { position: 'Revenue Specialist', dept: 'Revenue · Fair', headcount: '1', budget: '2,600–3,000', start: 'Within 1 month', emp: 'Full-time', reason: 'Replacement', jd: 'Fair sales and lead follow-up.', notes: '' }, events: [['Submitted', '4 Aug 2026', 'Chea Huan'], ['Acknowledged', '5 Aug 2026', 'Grace Lim'], ['Filled', '29 Aug 2026', 'Grace Lim', 'Hired: Esther']] },
  { id: 'HR-199', owner: 'grace', by: 'jason', when: '1 Jul 2026', status: 'filled', hired: 'Priya Nair', a: { position: 'Account Assistant', dept: 'Finance', headcount: '1', budget: '2,400–2,800', start: 'Within 2 months', emp: 'Full-time', reason: 'New position', jd: 'Data entry, claims checking and filing.', notes: '' }, events: [['Submitted', '1 Jul 2026', 'Jason Ong'], ['Acknowledged', '3 Jul 2026', 'Grace Lim'], ['Filled', '12 Aug 2026', 'Grace Lim', 'Hired: Priya Nair']] },
  { id: 'HR-198', owner: 'grace', by: 'stanley', when: '10 Jun 2026', status: 'filled', hired: 'Melvin Chong', a: { position: 'Senior Revenue Specialist', dept: 'Revenue · Fair', headcount: '1', budget: '3,300–3,800', start: 'Within 2 months', emp: 'Full-time', reason: 'Expansion', jd: 'Senior fair sales, coaching juniors.', notes: '' }, events: [['Submitted', '10 Jun 2026', 'Stanley'], ['Acknowledged', '11 Jun 2026', 'Grace Lim'], ['Filled', '2 Aug 2026', 'Grace Lim', 'Hired: Melvin Chong']],
    cands: [{ id: 'C-5', name: 'Melvin Chong', source: 'Applied', stage: 'hired' }, { id: 'C-6', name: 'Marcus Wong', phone: '017-332 9081', source: 'Applied', stage: 'rejected', talent: 'T-102', file: 'Marcus_Wong_Resume.pdf' }] },
  { id: 'HR-197', owner: 'grace', by: 'grace', when: '2 May 2026', status: 'filled', hired: 'Nurul Huda', a: { position: 'HR Executive', dept: 'HR', headcount: '1', budget: '3,000–3,500', start: 'Within 1 month', emp: 'Full-time', reason: 'New position', jd: 'Payroll inputs, leave and onboarding.', notes: '' }, events: [['Submitted', '2 May 2026', 'Grace Lim'], ['Acknowledged', '2 May 2026', 'Grace Lim'], ['Filled', '30 May 2026', 'Grace Lim', 'Hired: Nurul Huda']] },
]
const FILLED: Record<string, [string, number]> = { 'HR-202': ['Jobstreet', 450], 'HR-200': ['Social Media', 120], 'HR-199': ['Jobstreet', 380], 'HR-198': ['LinkedIn', 900], 'HR-197': ['Referral', 200] }

/** The day a step first happened, as the database keeps it on the request. */
const at = (r: Raw, what: string) => { const e = r.events.find(x => x[0] === what); return e ? iso(e[1]) : null }

const requests: HiringRequest[] = RAW.map(r => {
  const filled = FILLED[r.id]
  const events = r.events.map(e => (e[0] === 'Filled' && filled ? ([e[0], e[1], e[2], `${e[3]} · via ${filled[0]} · cost RM ${filled[1]}`] as Ev) : e))
  return {
    id: r.id, status: r.status, source: 'portal', requestedBy: r.by, requesterName: nameOf(r.by), requesterDepartment: deptOf(r.by), requesterCompany: null, requesterPhone: null,
    fields: FIELDS, answers: r.a, ownerId: r.owner ?? null, assistedBy: null, hiredNames: r.hired ? [r.hired] : [], hiredThrough: filled?.[0] ?? null, hiringCost: filled?.[1] ?? null,
    attachmentName: null, submittedAt: iso(r.when), acknowledgedAt: at(r, 'Acknowledged'), filledAt: r.status === 'filled' ? at(r, 'Filled') : null,
    closedAt: at(r, 'Filled') ?? at(r, 'Cancelled'),
    candidates: (r.cands ?? []).map(c => ({ id: c.id!, name: c.name!, phone: c.phone ?? '', source: c.source ?? 'Applied', stage: c.stage!, talentId: c.talent ?? null, answers: c.x ?? {}, note: c.note ?? '', resumeName: c.file ?? null })),
    events: evs(events),
  }
})

const T = (t: { id: string; name: string; phone: string; email: string; position: string; dept: string; from: string; when: string; by: string; file: string; notes: string; events: Ev[] }): HiringTalent => ({
  id: t.id, no: t.id, name: t.name, phone: t.phone, email: t.email, position: t.position, department: t.dept, fromRequest: t.from || null, notes: t.notes, resumeName: t.file, savedBy: nameOf(t.by), savedAt: iso(t.when), events: evs(t.events),
})
const talents: HiringTalent[] = [
  T({ id: 'T-104', name: 'Nur Iman', phone: '012-778 4410', email: 'nur.iman@gmail.com', position: 'Revenue Specialist', dept: 'Revenue', from: 'HR-202', when: '24 Sep 2026', by: 'grace', file: 'Nur_Iman_CV.pdf', notes: 'Runner-up for Team Assistant (HR-202). Very good with walk-in customers at the Mid Valley roadshow trial day; closed two bookings on her own.\n\nWants a sales role more than admin. Available with two weeks notice. Call back for the next Fair opening.', events: [['Saved to Talent Bank', '24 Sep 2026', 'Grace Lim', 'From HR-202 · Team Assistant'], ['Invited to interview', '29 Sep 2026', 'Grace Lim', 'HR-203 · Revenue Specialist']] }),
  T({ id: 'T-103', name: 'Joyce Tan', phone: '011-2045 6678', email: 'joyce.tan@outlook.com', position: 'HR Executive', dept: 'HR', from: 'HR-201', when: '15 Sep 2026', by: 'grace', file: 'Joyce_Tan_CV.pdf', notes: 'Final round for HR Executive before the request was cancelled. Three years in recruitment at a retail chain; strong on onboarding paperwork.', events: [['Saved to Talent Bank', '15 Sep 2026', 'Grace Lim', 'From HR-201 · request cancelled']] }),
  T({ id: 'T-102', name: 'Marcus Wong', phone: '017-332 9081', email: 'marcuswong.sales@gmail.com', position: 'Senior Revenue Specialist', dept: 'Revenue', from: 'HR-198', when: '2 Aug 2026', by: 'grace', file: 'Marcus_Wong_Resume.pdf', notes: 'Strong closer, 6 years in mattress retail. Lost out to Melvin on salary expectation (asked RM 4,200). Revisit if IR budget allows.', events: [['Saved to Talent Bank', '2 Aug 2026', 'Grace Lim', 'From HR-198 · Senior Revenue Specialist']] }),
  T({ id: 'T-101', name: 'Aisyah Rahman', phone: '013-901 2234', email: 'aisyah.r@gmail.com', position: 'Account Executive', dept: 'Finance', from: '', when: '18 Jul 2026', by: 'jason', file: 'Aisyah_Rahman_CV.pdf', notes: 'Walk-in CV. ACCA part-qualified. Jason met her briefly; worth a proper interview for the next Finance role.', events: [['Added to Talent Bank', '18 Jul 2026', 'Jason Ong', 'Walk-in CV']] }),
]

export const HIRING_BOARD: HiringBoard = {
  fields: FIELDS,
  sources: [['Jobstreet', 2], ['LinkedIn', 1], ['Social Media', 1], ['Referral', 1], ['Walk-in', 0], ['Other', 0]].map(([name, used], i) => ({ id: 's' + i, name: String(name), active: true, used: Number(used) })),
  candidateFields: [
    { id: 'salary', label: 'Expected salary (RM)', type: 'number', options: '' },
    { id: 'avail', label: 'Available from', type: 'date', options: '' },
    { id: 'transport', label: 'Own transport', type: 'choice', options: 'Yes, No' },
  ],
  people: STAFF,
  requests,
  talents,
  me: { staffId: 'grace', name: 'Grace Lim' },
}
