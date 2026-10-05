// Seed / demo data and constants used by the prototype, verbatim from RevenueApp.dc.html.
// Replace demo values with real data from Venture Portal.

const VA_PEOPLE = [
  ['tml', 'Tan Mei Ling', 'Revenue Director', 'Leads Fair', 'fair', 0], ['ml', 'Marcus Lim', 'Team Leader', 'Rank A', 'fair', 1], ['me', 'Jia Hui Tan', 'Senior Executive', 'Rank B', 'fair', 2],
  ['wl', 'Wei Ling Chong', 'Executive', 'Rank B', 'fair', 3], ['ai', 'Aisyah Rahman', 'Executive', 'Rank C', 'fair', 3], ['do', 'Darren Ong', 'Executive', 'Rank C', 'fair', 3], ['pr', 'Priya Nair', 'Executive', 'Rank C', 'fair', 3], ['kc', 'Kelvin Chua', 'Executive', 'Rank C', 'fair', 3], ['sa', 'Siti Aminah', 'Junior Executive', 'Rank C', 'fair', 4], ['jt', 'Jason Teh', 'Junior Executive', 'Rank C', 'fair', 4],
  ['kw', 'Kris Wong', 'Revenue Director', 'Leads IR', 'ir', 0], ['rl', 'Rachael Lim', 'Team Leader', 'Rank A', 'ir', 1], ['ho', 'Hafiz Omar', 'Executive', 'Rank B', 'ir', 3], ['gt', 'Grace Tan', 'Executive', 'Rank C', 'ir', 3],
].map(([id, name, title, rank, sub, lv]) => ({ id, name, title, rank, sub, lv, ini: name.split(' ').map(w => w[0]).slice(0, 2).join(''), first: name.split(' ').slice(0, 2).join(' ') }));
const PEOPLE = [
  { id: 'wl', name: 'Wei Ling Chong', title: 'Executive', sales: 86420, margin: 36.9, pts: 142, q: 2.7, kpi: 24, fm: [3, 1, 0] },
  { id: 'ml', name: 'Marcus Lim', title: 'Senior Executive', sales: 74180, margin: 42.4, pts: 121, q: 3.1, kpi: 31, fm: [3, 1, 0] },
  { id: 'ai', name: 'Aisyah Rahman', title: 'Executive', sales: 61050, margin: 35.8, pts: 104, q: 2.9, kpi: 22, fm: [0, 2, 1] },
  { id: 'me', name: 'Jia Hui Tan', title: 'Senior Executive', sales: 57930, margin: 38.6, pts: 128, q: 3.0, kpi: 27, fm: [1, 2, 0] },
  { id: 'do', name: 'Darren Ong', title: 'Executive', sales: 49300, margin: 34.1, pts: 88, q: 2.6, kpi: 18, fm: [0, 1, 1] },
  { id: 'pr', name: 'Priya Nair', title: 'Executive', sales: 41760, margin: 38.2, pts: 96, q: 3.2, kpi: 29, fm: [1, 1, 1] },
  { id: 'kc', name: 'Kelvin Chua', title: 'Executive', sales: 38900, margin: 31.5, pts: 61, q: 2.8, kpi: 15, fm: [0, 0, 2] },
  { id: 'sa', name: 'Siti Aminah', title: 'Junior Executive', sales: 30150, margin: 33.0, pts: 55, q: 2.5, kpi: 12, fm: [0, 0, 1] },
  { id: 'jt', name: 'Jason Teh', title: 'Junior Executive', sales: 22480, margin: null, pts: 34, q: 2.4, kpi: 10, fm: [0, 0, 1] },
];
const BRANDS = ['Akemi', 'Ergotex', 'Zanotti', 'Dunlopillo'];
const BOARDS = [{ id: 'sales', n: '1', label: 'Sales' }, { id: 'margin', n: '2', label: 'Margin' }, { id: 'kpi', n: '3', label: 'KPI' }, { id: 'champ', n: '4', label: 'Championship' }];
const MY_FAIRS = [
  { venue: 'Mid Valley Megamall', dates: '4–6 Sep', sales: 24860, pos: 1, of: 5, brand: 'Akemi', org: 'Homedec Expo' },
  { venue: 'IOI City Mall', dates: '11–13 Sep', sales: 15240, pos: 2, of: 4, brand: 'Ergotex', org: 'Mega Home Fair' },
  { venue: 'Sunway Pyramid', dates: '18–20 Sep', sales: 11630, pos: 2, of: 5, brand: 'Zanotti', org: 'Furniture & Living Fair' },
  { venue: '1 Utama', dates: '25–27 Sep', sales: 6200, pos: 4, of: 4, brand: 'Dunlopillo', org: 'Sleep & Living Expo' },
];
const BILL_BRAND = { Akemi: ['AK', '#BD4A19', '#FFF0E4'], Ergotex: ['EG', '#387557', '#E8F3ED'], Zanotti: ['ZN', '#A46312', '#FFF4D9'], Dunlopillo: ['DL', '#4E2F20', '#F5EBE3'] };
const L = (name, amt, qty = 1, kpi = 0) => ({ name, amt, qty, kpi });
const BRAND_M = [{ name: 'Akemi', goods: 24860, orders: 6, m: 38.2 }, { name: 'Ergotex', goods: 15240, orders: 4, m: 44.1 }, { name: 'Zanotti', goods: 11630, orders: 2, m: 36.4 }, { name: 'Dunlopillo', goods: 6200, orders: 2, m: null }];
const BILLS = [
  { f: 0, no: 'SO-2609-0118', cust: 'Mdm Lee', m: 38.9, lines: [L('Serene Pocket · Queen', 3610), L('Haven Divan · Queen', 1590), L('Latex Contour Pillow', 0, 2, 2)] },
  { f: 0, no: 'SO-2609-0121', cust: 'Mr Tan', m: 37.4, lines: [L('Cool Touch Hybrid · Queen', 4370), L('Latex Contour Pillow', 520, 2, 2)] },
  { f: 0, no: 'SO-2609-0124', cust: 'Ms Chen', m: 39.2, lines: [L('Orthocare Firm · King', 3650), L('Waterproof Protector · King', 330, 1, 1)] },
  { f: 0, no: 'SO-2609-0127', cust: 'Mr Gopal', m: 38.0, lines: [L('Airflow Latex · Super Single', 3970), L('Bolster', 150)] },
  { f: 0, no: 'SO-2609-0130', cust: 'Mr Ong', m: 37.9, lines: [L('Serene Pocket · Super Single', 2980), L('Latex Contour Pillow', 290, 1, 1)] },
  { f: 0, no: 'SO-2609-0133', cust: 'Mdm Kaur', m: 38.4, lines: [L('Orthocare Firm · Queen', 2990), L('Waterproof Protector · Queen', 260, 1, 1), L('Bolster', 150)] },
  { f: 0, no: 'SO-2609-0136', cust: 'Mdm Siew', m: 38.6, wait: '6 Oct', lines: [L('Cool Touch Hybrid · Queen', 4690)] },
  { f: 1, no: 'SO-2609-0142', cust: 'Ms Wong', m: 44.6, lines: [L('Ergo Balance · Queen', 3330), L('Contour Pillow', 260, 1, 1)] },
  { f: 1, no: 'SO-2609-0147', cust: 'Mdm Aziz', m: 43.8, lines: [L('Ergo Spine Pro · Queen', 4470), L('Contour Pillow', 520, 2, 2)] },
  { f: 1, no: 'SO-2609-0150', cust: 'Ms Nadia', m: 45.1, lines: [L('Ergo Cloud Plus · Single', 2130), L('Mattress Protector · Single', 260, 1, 1)] },
  { f: 1, no: 'SO-2609-0153', cust: 'Ms Lau', m: 43.2, lines: [L('Ergo Spine Pro · Super Single', 3750), L('Contour Pillow', 520, 2, 2)] },
  { f: 1, no: 'SO-2609-0156', cust: 'Mr Yap', m: 44.0, wait: '4 Oct', lines: [L('Ergo Balance · Queen', 3590)] },
  { f: 2, no: 'SO-2609-0166', cust: 'Mr Rajan', m: 36.1, lines: [L('Milano 3-seater sofa', 6490), L('Fabric Guard Kit', 400, 2, 2)] },
  { f: 2, no: 'SO-2609-0172', cust: 'Mdm Ho', m: 36.8, lines: [L('Verona L-shape sofa', 4740), L('Throw Pillow', 0, 4, 4)] },
  { f: 3, no: 'SO-2609-0190', cust: 'Mr Lim', m: null, lines: [L('Vogue · Queen', 3470), L('Latex Pillow', 520, 4, 4)] },
  { f: 3, no: 'SO-2609-0194', cust: 'Mr Daniel', m: null, lines: [L('Celestial · Single', 1690), L('Latex Pillow', 260, 2, 2), L('Mattress Protector · Single', 260, 2, 2)] },
].map(b => ({ ...b, brand: MY_FAIRS[b.f].brand, amt: b.lines.reduce((a, l) => a + l.amt, 0), kpi: b.lines.reduce((a, l) => a + l.kpi, 0) }));
const CHAMP_PARTS = [
  { label: 'Sales by brand', short: 'By brand', g: 'sales', sub: 'Your brand weeks share', v: 22 },
  { label: 'Fair results', short: 'Fair results', g: 'sales', sub: 'Mean of weekly fair finishes', v: 20 },
  { label: 'Total sales', short: 'Total', g: 'sales', sub: 'Monthly rank ladder', v: 18 },
  { label: 'Margin by brand', short: 'By brand', g: 'margin', sub: 'Includes brand margin tier', v: 19 },
  { label: 'Total margin', short: 'Total', g: 'margin', sub: 'Includes Incentive Tier', v: 20.5 },
  { label: 'KPI', short: 'Quantity rank', g: 'kpi', sub: 'Includes threshold award', v: 15 },
  { label: 'Highest Fair Record', short: 'Monthly rank', g: 'record', sub: 'Monthly closing rank', v: 13.5 },
];
const ordinal = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
function fairTable(period) {
  const pf = { monthly: 0, quarterly: 1, annual: 2 }[period], ev = [4, 13, 52][pf], k = [1, 3.25, 13][pf];
  return PEOPLE.map((p, i) => {
    let [g, s, b] = p.fm;
    if (pf) { g = Math.max(0, Math.round(g * k) + ((i + pf) % 3) - 1); s = Math.max(0, Math.round(s * k) + ((i * 2 + pf) % 3) - 1); b = Math.max(0, Math.round(b * k) + ((i + 2 * pf) % 3) - 1); }
    return { ...p, g, s, b, ev };
  }).sort((a, b) => b.g - a.g || b.s - a.s || b.b - a.b || a.name.localeCompare(b.name));
}
const QBRANDS = [{ code: 'AKEMI', name: 'Akemi' }, { code: 'ERGOTEX', name: 'Ergotex' }, { code: 'DUNLOP', name: 'Dunlopillo' }, { code: 'ZANOTTI', name: 'Zanotti', sofa: true }];
const SOFA_MODS = [['1A-LHF', '1-seat · left arm', 1, 0.42], ['2A-LHF', '2-seat · left arm', 2, 0.7], ['CHS-LHF', 'Chaise · left', 1, 0.6], ['1N', '1-seat · armless', 1, 0.34], ['CNR', 'Corner', 1, 0.45], ['1A-RHF', '1-seat · right arm', 1, 0.42], ['2A-RHF', '2-seat · right arm', 2, 0.7], ['CHS-RHF', 'Chaise · right', 1, 0.6], ['OTT', 'Ottoman', 0, 0.25]].map(([c, d, seats, m]) => ({ c, d, seats, m }));
const SOFA_LAYOUTS = [['2', '2-seater', { '1A-LHF': 1, '1A-RHF': 1 }], ['3', '3-seater', { '1A-LHF': 1, '2A-RHF': 1 }], ['4', '4-seater', { '2A-LHF': 1, '2A-RHF': 1 }], ['L', 'L-shape', { '2A-LHF': 1, 'CNR': 1, '2A-RHF': 1 }], ['CH', '3-seater + chaise', { '2A-LHF': 1, 'CHS-RHF': 1 }], ['C', 'Custom', {}]].map(([k, label, mods]) => ({ k, label, mods }));
const sofaText = mods => SOFA_MODS.filter(x => mods[x.c]).map(x => (mods[x.c] > 1 ? mods[x.c] + '× ' : '') + x.c).join(' + ');
const sofaSeats = mods => SOFA_MODS.reduce((a, x) => a + (mods[x.c] || 0) * x.seats, 0);
const MODELS = {
  AKEMI: [
    { k: 'serene', name: 'Serene Pocket', desc: 'Pocket spring · medium firm', q: 3890 },
    { k: 'cool', name: 'Cool Touch Hybrid', desc: 'Hybrid · cooling knit', q: 4690 },
    { k: 'airflow', name: 'Airflow Latex', desc: 'Natural latex · soft', q: 5290 },
    { k: 'ortho', name: 'Orthocare Firm', desc: 'Bonnell spring · firm', q: 2990 },
    { k: 'dreamlux', name: 'Dream Lux', desc: 'Pocket spring · pillow top', q: 4190 },
    { k: 'posture', name: 'Posture Plus', desc: 'Zoned pocket · firm', q: 3490 },
    { k: 'comfort', name: 'Comfort Top', desc: 'Euro top · medium', q: 3290 },
    { k: 'bamboo', name: 'Eco Bamboo', desc: 'Bamboo knit · medium', q: 3690 },
    { k: 'kids', name: 'Kids Grow', desc: 'Foam · medium firm', q: 1890 },
    { k: 'hotel', name: 'Hotel Classic', desc: 'Pocket spring · plush', q: 4890 },
    { k: 'silver', name: 'Silver Ion', desc: 'Antibacterial knit · medium', q: 3990 },
    { k: 'spine', name: 'Spine Align', desc: 'Zoned latex · firm', q: 5590 },
    { k: 'cloud', name: 'Cloud Nine', desc: 'Memory foam · plush', q: 4390 },
    { k: 'harmony', name: 'Harmony Zone', desc: '7-zone pocket · medium', q: 4790 },
    { k: 'cotton', name: 'Pure Cotton', desc: 'Organic cotton · medium', q: 3190 },
    { k: 'firmrest', name: 'Firm Rest', desc: 'Coir and foam · extra firm', q: 2690 },
  ],
  ERGOTEX: [
    { k: 'balance', name: 'Ergo Balance', desc: 'Zoned pocket · medium', q: 3590 },
    { k: 'cloud', name: 'Ergo Cloud Plus', desc: 'Memory foam · plush', q: 4290 },
    { k: 'spine', name: 'Ergo Spine Pro', desc: 'Zoned support · firm', q: 4990 },
    { k: 'flex', name: 'Ergo Flex', desc: 'Hybrid · medium', q: 3890 },
    { k: 'cool', name: 'Ergo Cool Gel', desc: 'Gel foam · medium', q: 4490 },
    { k: 'lite', name: 'Ergo Lite', desc: 'Foam · medium firm', q: 2490 },
    { k: 'luxe', name: 'Ergo Luxe', desc: 'Pocket spring · pillow top', q: 5490 },
    { k: 'rest', name: 'Ergo Rest', desc: 'Bonnell spring · firm', q: 2890 },
    { k: 'air', name: 'Ergo Air', desc: 'Open-cell foam · soft', q: 3790 },
    { k: 'duo', name: 'Ergo Duo', desc: 'Dual comfort · two sides', q: 4690 },
    { k: 'senior', name: 'Ergo Senior', desc: 'Edge support · firm', q: 4190 },
    { k: 'travel', name: 'Ergo Fold', desc: 'Foldable foam · medium', q: 1690 },
  ],
  ZANOTTI: [
    { k: 'verona', name: 'Verona', desc: 'Feather blend · linen', q: 5200 },
    { k: 'milano', name: 'Milano', desc: 'High-density foam · leather', q: 6800 },
    { k: 'torino', name: 'Torino', desc: 'Pocket coil seat · fabric', q: 5900 },
    { k: 'siena', name: 'Siena', desc: 'Low profile · boucle', q: 4800 },
    { k: 'como', name: 'Como', desc: 'Deep seat · velvet', q: 6200 },
    { k: 'lucca', name: 'Lucca', desc: 'Recliner modules · leather', q: 7400 },
    { k: 'parma', name: 'Parma', desc: 'Compact · fabric', q: 3900 },
    { k: 'ravello', name: 'Ravello', desc: 'Feather top · linen', q: 6600 },
    { k: 'amalfi', name: 'Amalfi', desc: 'Outdoor-grade fabric', q: 5400 },
    { k: 'bari', name: 'Bari', desc: 'Sleeper option · fabric', q: 4600 },
  ],
  DUNLOP: [
    { k: 'royal', name: 'Royal Latex', desc: 'Talalay latex · medium', q: 6290 },
    { k: 'vogue', name: 'Vogue', desc: 'Pocket spring · medium', q: 3990 },
    { k: 'celestial', name: 'Celestial', desc: 'Latex hybrid · plush', q: 4890 },
    { k: 'heritage', name: 'Heritage', desc: 'Latex · firm', q: 5690 },
    { k: 'majestic', name: 'Majestic', desc: 'Pocket spring · pillow top', q: 5290 },
    { k: 'essence', name: 'Essence', desc: 'Latex foam · medium', q: 4290 },
    { k: 'serenity', name: 'Serenity', desc: 'Hybrid · soft', q: 4590 },
    { k: 'classic', name: 'Classic Firm', desc: 'Bonnell spring · firm', q: 2990 },
    { k: 'pure', name: 'Pure Latex', desc: 'Natural latex · medium', q: 5990 },
    { k: 'junior', name: 'Junior', desc: 'Latex foam · medium firm', q: 2190 },
  ],
};
const SIZES = [{ k: 'S', label: 'Single', m: 0.62 }, { k: 'SS', label: 'Super Single', m: 0.75 }, { k: 'Q', label: 'Queen', m: 1 }, { k: 'K', label: 'King', m: 1.22 }];
const FRAMES = [['haven','Haven Divan',1590],['linden','Linden Storage',2190],['arden','Arden Headboard',1290],['alto','Alto Platform',1490],['bellini','Bellini Upholstered',2390],['cove','Cove Wingback',2690],['dorset','Dorset Panel',1790],['elm','Elm Wooden',1890],['fenwick','Fenwick Ottoman',2490],['grove','Grove Slat',1390],['hudson','Hudson Tufted',2290],['ivy','Ivy Low Profile',1590],['juno','Juno Storage Drawers',2590],['kensington','Kensington Royal',3190]].map(([k, name, q]) => ({ k, name, q }));
const KPIS = [{ k: 'protector', name: 'Mattress Protector', p: 250 }, { k: 'pillowset', name: 'Pillow Set (2)', p: 250 }, { k: 'topper', name: 'Comfort Topper', p: 390 }, { k: 'sheet', name: 'Fitted Sheet Set', p: 180 }];
const ACCS = [{ k: 'pillow', name: 'Latex Contour Pillow', p: 290 }, { k: 'protector', name: 'Waterproof Protector', p: 260, sized: true }, { k: 'bolster', name: 'Bolster', p: 180 }];
const RATIO = { sofa: 0.45, mattress: 0.42, frame: 0.44, acc: 0.30 };
const DIVISOR = 0.7;
const sp = (q, z) => Math.round(q * z.m / 10) * 10;
const accPrice = (a, z) => a.sized ? sp(a.p, z) : a.p;
// Fair ladder (comm_margin_bands seed): incentive >= 36 / 43, penalty <= 27 / 25 / 24.
function band(m) {
  if (m == null) return null;
  if (m >= 43) return { l: 'Incentive Tier 2', tone: 'good' };
  if (m >= 36) return { l: 'Incentive Tier 1', tone: 'good' };
  if (m >= 33) return { l: 'Standard', tone: 'neutral' };
  if (m > 27) return { l: 'Low margin', tone: 'warn' };
  if (m > 25) return { l: 'Below Tier 1', tone: 'bad', pen: 'Commission × 0.5' };
  if (m > 24) return { l: 'Below Tier 2', tone: 'bad', pen: 'Commission × 0.25' };
  return { l: 'Below Tier 3', tone: 'bad', pen: 'No commission' };
}
const TONES = { good: ['#E8F3ED', '#387557'], neutral: ['#F7F3EF', '#3F2B22'], warn: ['#FFF0CC', '#A46312'], bad: ['#F8E1D8', '#A3371A'], none: ['#FAF7F4', '#806B60'] };
const INCENTIVES = [{ l: 'Incentive Tier 1', p: 36 }, { l: 'Incentive Tier 2', p: 43 }];
const ICON = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18',
  trophy: 'M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3',
  user: 'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  wallet: 'M3 6h17v15H3V6Zm0 0V3h14v3m-3 6h7v5h-7v-5Z',
  team: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  receipt: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8M8 12h8M8 16h4',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  calendar: 'M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14',
  install: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm4 5v7m-3-3 3 3 3-3m-4 7h2',
  percent: 'M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff: 'm3 3 18 18M10 5c7-1 12 7 12 7s-2 4-5 5M6 6c-3 2-4 6-4 6s3 7 10 7c2 0 3-.3 4-1',
};
const RECORDS = {
  wl: [31480, 'Pavilion Bukit Jalil', '13–15 Mar 2026'], ml: [28950, 'Mid Valley Megamall', '5–7 Dec 2025'],
  do: [26300, 'IOI City Mall', '9–11 Jan 2026'], ai: [24120, 'Sunway Pyramid', '22–24 Aug 2025'],
  me: [24860, 'Mid Valley Megamall', '4–6 Sep 2026'], pr: [21880, 'Paradigm Mall', '6–8 Feb 2026'],
  kc: [19450, 'Setia City Mall', '17–19 Oct 2025'], sa: [15960, 'AEON Bukit Tinggi', '19–21 Jun 2026'],
  jt: [12300, 'Mid Valley Megamall', '4–6 Sep 2026'],
};
function recordVals() {
  const rr = PEOPLE.map(p => ({ ...p, amt: RECORDS[p.id][0], venue: RECORDS[p.id][1], dates: RECORDS[p.id][2] })).sort((a, b) => b.amt - a.amt).map((r, i) => ({ ...r, pos: i + 1 }));
  const mine = rr.find(r => r.id === 'me'), above = rr[mine.pos - 2];
  const stepC = { 1: ['#E1B04F', '#3F2B22'], 2: ['#DAD5CC', '#4A443C'], 3: ['#D3A07A', '#4A2A1A'] };
  const recPodium = [rr[1], rr[0], rr[2]].map(r => ({ ...MEDAL[r.pos], isFirst: r.pos === 1, place: r.pos, suf: ordinal(r.pos).replace(/^\d+/, ''), ini: ini(r.name),
    name: r.id === 'me' ? 'You' : r.name.split(' ').slice(0, 2).join(' '), amt: rm(r.amt), venue: r.venue, dates: r.dates,
    size: r.pos === 1 ? '64px' : '50px', iniSize: r.pos === 1 ? '18px' : '14px', amtSize: r.pos === 1 ? '17px' : '14px', numSize: r.pos === 1 ? '34px' : '26px',
    h: r.pos === 1 ? '84px' : r.pos === 2 ? '60px' : '44px', step: stepC[r.pos][0], stepInk: stepC[r.pos][1] }));
  return {
    recPodium,
    recCardLine: `Yours: ${rm(mine.amt)} · ${ordinal(mine.pos)} of ${rr.length}`,
    recMyPos: `${ordinal(mine.pos)} of ${rr.length}`, recMyAmt: rm(mine.amt), recMyWhere: `${mine.venue} · ${mine.dates}`, recCount: rr.length,
    recChase: above ? `${rm(above.amt - mine.amt + 10)} more in one fair beats ${above.name.split(' ')[0]}'s record` : 'You hold the top record',
    recRows: rr.map(r => { const md = r.pos <= 3 ? MEDAL[r.pos] : null, me2 = r.id === 'me';
      return { pos: r.pos, ini: ini(r.name), name: me2 ? r.name + ' (you)' : r.name, where: `${r.venue} · ${r.dates}`, amt: rm(r.amt),
        posBg: md ? md.light : 'transparent', posInk: md ? md.deep : '#806B60', avBg: md ? md.light : me2 ? '#4E2F20' : '#F5EBE3', avInk: md ? md.deep : me2 ? '#FFFFFF' : '#4E2F20',
        bg: me2 ? '#FFF5EC' : 'transparent', radius: me2 ? '12px' : '0', weight: me2 ? 650 : 500 }; }),
  };
}
const CGROUPS = [
  { id: 'sales', label: 'Sales', color: '#4E2F20', tint: '#F5EBE3', ink: '#4E2F20' },
  { id: 'margin', label: 'Margin', color: '#E1B04F', tint: '#FFF4D9', ink: '#A46312' },
  { id: 'kpi', label: 'KPI', color: '#387557', tint: '#E8F3ED', ink: '#387557' },
  { id: 'record', label: 'Fair Record', color: '#BA855D', tint: '#F6E8DD', ink: '#7A4B35' },
];
const BTHEME = {
  sales: { d: 'M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18', solid: '#4E2F20', ink: '#FFFFFF', sub: '#F0DDCE', iconBg: 'rgba(255,255,255,.14)', glow: 'rgba(78,47,32,.18)', tint: '#F5EBE3', tintInk: '#4E2F20' },
  margin: { d: 'M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', solid: '#E1B04F', ink: '#3F2B22', sub: '#6B4A1C', iconBg: 'rgba(255,255,255,.35)', glow: 'rgba(225,176,79,.28)', tint: '#FFF0CC', tintInk: '#A46312' },
  kpi: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', solid: '#387557', ink: '#FFFFFF', sub: '#D9EDE2', iconBg: 'rgba(255,255,255,.16)', glow: 'rgba(56,117,87,.18)', tint: '#E8F3ED', tintInk: '#387557' },
  champ: { d: 'M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3', solid: '#BD4A19', ink: '#FFFFFF', sub: '#FFE5CF', iconBg: 'rgba(255,255,255,.16)', glow: 'rgba(189,74,25,.20)', tint: '#FFF0E4', tintInk: '#BD4A19' },
};
const MEDAL = {
  1: { light: '#FFF0CC', mid: '#E1B04F', deep: '#A46312' },
  2: { light: '#F2F0EB', mid: '#B4AEA4', deep: '#6B645A' },
  3: { light: '#F0DDCE', mid: '#BA855D', deep: '#7A4B35' },
};
const rm = n => 'RM ' + Math.round(n).toLocaleString('en-MY');
const rm2 = n => 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ini = n => n.split(' ').map(x => x[0]).slice(0, 2).join('');

const PERIOD_OPTS = {
  monthly: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'].map(m => ({ short: m + ' 2026', label: m })),
  quarterly: ['Q1', 'Q2', 'Q3'].map(q => ({ short: q + ' 2026', label: q })),
  annual: ['2025', '2026'].map(y => ({ short: y, label: y })),
};
function ranking(board, period, brand, off = 0) {
  const pf = { monthly: 0, quarterly: 1, annual: 2 }[period];
  const bi = BRANDS.indexOf(brand);
  const rows = PEOPLE.map((p, i) => {
    const mult = (pf === 0 ? 1 : pf === 1 ? p.q : p.q * 3.7) * (off ? 1 + ((((i * 3 + off * 5) % 7) - 3) * 0.06) : 1);
    let v;
    if (board === 'sales') {
      v = p.sales * mult;
      if (bi >= 0) { const w = BRANDS.map((_, b) => ((i * 7 + b * 5) % 6) + 2); v = v * w[bi] / w.reduce((a, c) => a + c, 0); }
    } else if (board === 'margin') {
      v = p.margin == null ? null : p.margin + (pf ? (((i + pf) % 3) - 1) * 0.35 : 0) + (bi >= 0 ? (((i * 3 + bi * 7) % 9) - 4) * 0.6 : 0);
    } else if (board === 'kpi') v = Math.round(p.kpi * mult);
    else v = Math.round(p.pts * mult);
    return { ...p, v };
  });
  const ranked = rows.filter(r => r.v != null).sort((a, b) => b.v - a.v).map((r, k) => ({ ...r, pos: k + 1 }));
  return [...ranked, ...rows.filter(r => r.v == null).map(r => ({ ...r, pos: null }))];
}
const fmtV = (board, v) => v == null ? 'Cost pending' : board === 'sales' ? rm(v) : board === 'margin' ? v.toFixed(1) + '%' : board === 'kpi' ? v + ' items' : v + ' pts';
const gapT = (board, d) => board === 'sales' ? rm(d) : board === 'margin' ? d.toFixed(1) + '% margin' : board === 'kpi' ? d + ' KPI items' : d + ' pts';
function chase(board, rows) {
  const me = rows.find(r => r.id === 'me');
  if (me.pos == null) return { c1: 'Waiting for complete cost data', c2: 'You join the board once every bill is costed' };
  const above = me.pos > 1 ? rows[me.pos - 2] : null, leader = rows[0];
  const c1 = above ? `${gapT(board, above.v - me.v)} behind ${above.name.split(' ').slice(0, 2).join(' ')} (${ordinal(above.pos)})` : `You lead by ${gapT(board, me.v - rows[1].v)}`;
  const c2 = me.pos > 2 ? `${gapT(board, leader.v - me.v)} behind the leader, ${leader.name.split(' ').slice(0, 2).join(' ')}` : me.pos === 2 ? 'One place from the top' : 'Hold the top spot to month end';
  return { c1, c2, me, above };
}
function seg(on) {
  return { bg: on ? '#FFFFFF' : 'transparent', shadow: on ? '0 1px 3px rgba(63,43,34,.14)' : 'none', ink: on ? '#3F2B22' : '#806B60', weight: on ? 650 : 500 };
}
