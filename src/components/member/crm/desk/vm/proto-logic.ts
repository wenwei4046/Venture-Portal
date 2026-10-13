/* eslint-disable @typescript-eslint/ban-ts-comment -- the prototype's script, verbatim, only for the pixel comparison (DeskProto) */
// @ts-nocheck -- GENERATED from docs/design/crm-desktop-rev1/prototypes/CrmFrame.dc.html by
// tools/crm-design/gen-desk-logic.cjs: the prototype's own logic and demo data, verbatim, for pixel comparison only
// (/member/preview?app=desk-proto). Production reads vm/app.ts. Never edit; regenerate.
/* eslint-disable */

const NAV = [
  ['Today', 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9'],
  ['Insight', 'M4 20V10m5 10V4m5 16v-7m5 7V8M3 20h18'],
  ['Quote', 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 7h6M9 11h1M12 11h1M15 11h0M9 15h1M12 15h1M9 18h1M12 18h1M15 15v3'],
  ['Arena', 'M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 13v5m-5 3h10M9 18h6v3'],
  ['Profile', 'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  ['Notifications', 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4', 3],
];
const ICON = {
  insight: 'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  adsperf: 'M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6',
  showrooms: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  assignment: 'M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3M15 9l6-6',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  settings: 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4',
  contacts: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  profile: 'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
};
const PANEL_TABS = [['insight', 'Insight'], ['inbox', 'Inbox'], ['assignment', 'Assignment'], ['calendar', 'Calendar'], ['adsperf', 'Ads Performance'], ['showrooms', 'Showrooms'], ['settings', 'Settings']];
const RS_TABS = [['inbox', 'Inbox', 5], ['contacts', 'Contacts'], ['calendar', 'Calendar', 2], ['insight', 'Insight'], ['profile', 'Profile', 1]];
const PANE_MODE = { adsperf: 'closed', insight: 'closed', calendar: 'closed', inbox: 'empty', contacts: 'empty', assignment: 'wideEmpty', settings: 'wideEmpty', showrooms: 'wideEmpty', profile: 'wideEmpty' };
const PEOPLE = {
  principal: { ini: 'PR', name: 'Principal', first: 'Principal', sub: 'Principal · All access' },
  director: { ini: 'TM', name: 'Tan Mei Ling', first: 'Mei Ling', sub: 'Revenue Director · Fair' },
  leader: { ini: 'ML', name: 'Marcus Lim', first: 'Marcus', sub: 'Team Leader · Fair' },
  rs: { ini: 'SA', name: 'Siti Aminah', first: 'Siti', sub: 'Junior Executive · Fair' },
};
const LI = {
  sprout: 'M7 20h10M10 20c5.5-2.5.8-6.4 3-10M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8zM14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z',
  megaphone: 'M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  briefcase: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6',
  file: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8',
  chart: 'M3 3v18h18M18 17V9M13 17V5M8 17v-3',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z',
  zap: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
};
const TINTS = [['#E8F3ED', '#387557'], ['#FFF0CC', '#A46312'], ['#FFE5CF', '#BD4A19'], ['#F1E7DF', '#4E2F20']];
const LISTS = {
  assignment: [['Organic Leads', '2 to send', 'sprout'], ['Ads to teams', '5 ads · 5 on the default (evenly)', 'megaphone'], ['Awaiting reply', '7 need a reply · 7 overdue', 'clock'], ['Full time lead allocation', 'Not set for any team', 'users'], ['Chat progress', 'Every chat by time, person and status', 'clock']],
  settings: [['Member work type', '', 'briefcase'], ['Cold lead templates', '', 'file'], ['Forms', '', 'file'], ['Notifications', '', 'bell']],
  showrooms: [['Showrooms', '', 'store']],
  profile: [['Notifications', '1 invitation', 'bell'], ['Auto-reply', 'Welcome · outside hours · keywords', 'chat'], ['Quick replies', '12 replies', 'zap'], ['View my team', '6 people', 'users']],
};
const ST = { New: ['#FFF1E6', '#BD4A19'], Appointment: ['#E4EDF8', '#2F5E8C'], 'Follow up': ['#F1E7DF', '#6B574C'], Overdue: ['#F8E1D8', '#A3371A'], Booked: ['#E4EDF8', '#2F5E8C'], 'Showed up': ['#E8F3ED', '#387557'], 'To mark': ['#FFF0CC', '#A46312'] };
const AV = ['#E4EDF8', '#F5EBE3', '#E8F3ED', '#FFF0CC', '#FFE5CF'];
const CHATS = [
  ['SR', 'Syafiq Rahim', '9:55 am', 'Bedframe Bundle · Reels', 'Boleh tengok katil di showroom?', 'Team Priya · to assign', 'New'],
  ['LW', 'Lim Wei Jie', '9:55 am', 'Akemi Mattress · October Fair', 'Sorry, something came up. Can we change to Sunday 11am?', 'Principal', 'Appointment'],
  ['CL', 'Chong Li Na', '9:35 am', 'Akemi Mattress · September', 'Hi! Do you have pillows that match the Akemi mattress?', 'Principal', 'Follow up'],
  ['MX', 'Mei Xin', '9:25 am', 'Akemi Mattress · October Fair', 'Hi, what sizes for Akemi?', 'Team Priya · to assign', 'New'],
  ['HY', 'Hakimi Yusof', '7:15 am', 'Bedframe Bundle · Reels', 'Bundle ni ada lagi?', 'Joanne Teh', 'Follow up'],
  ['DR', 'Datin Rosnah', '6:00 am', 'Akemi Mattress · October Fair', 'You: Hi! Thanks for your message — when would you like to visit the showroom?', 'Kelvin Lee', 'Follow up'],
  ['TM', 'Tan Mei Ling', 'Sun', 'Akemi Mattress · October Fair', 'Hi, is the October promotion still available?', 'Principal', 'Overdue · 15 h'],
  ['GS', 'Goh Siew Ling', 'Sun', 'Akemi Mattress · October Fair', 'Yes please.', 'Principal', 'Overdue · 19 h'],
  ['AF', 'Ahmad Faizal', 'Sun', 'Sofa Clearance · Carousel', 'Grey or dark blue. Can I see it in person?', 'Principal', 'Overdue · 19 h'],
  ['BS', 'Bernard Sim', 'Sun', 'Bedframe Bundle · Reels', 'You: Hi! Thanks for your message — when would you like to visit the showroom?', 'Amir Hamzah', 'Follow up'],
  ['NC', 'Nicole Chan', 'Sat', 'Sofa Clearance · Carousel', 'You: Hi! Thanks for your message — when would you like to visit the showroom?', 'Hafiz Rahman', 'Appointment'],
  ['RI', 'Rosli Ismail', 'Sat', 'Bedframe Bundle · Reels', 'Ada warna putih?', 'Daniel Ong', 'Overdue · 47 h'],
  ['SH', 'Siti Hajar', 'Sat', 'Bedframe Bundle · Reels', 'Hi, do you have a white single bed frame? Does it come with a mattress?', 'Principal', 'Overdue · 49 h'],
  ['RK', 'Rajesh Kumar', '8:40 am', 'Akemi Mattress · October Fair', 'See you tonight at 7.', 'Principal', 'Appointment'],
  ['AK', 'Aisyah Kamal', 'Sun', 'Akemi Mattress · October Fair', 'You: Booked for Tue 11:00 am at Kuala Lumpur Showroom.', 'Farah Aziz', 'Appointment'],
  ['FO', 'Faizal Omar', 'Sun', 'Sofa Clearance · Carousel', 'Ok, Wednesday morning.', 'Vincent Lim', 'Appointment'],
  ['YK', 'Yvonne Khoo', '5 Oct', 'Akemi Mattress · October Fair', 'Thank you, see you at the showroom!', 'Joanne Teh', 'Follow up'],
  ['GP', 'Ganesh Pillai', '6 Oct', 'Bedframe Bundle · Reels', 'You: Hi Ganesh, how was the visit?', 'Hafiz Rahman', 'Follow up'],
  ['WK', 'Wong Kah Hou', '7 Oct', 'Sofa Clearance · Carousel', 'You: Thanks for coming by today.', 'Principal', 'Follow up'],
  ['MY', 'Marcus Yeo', '8 Oct', 'Akemi Mattress · October Fair', 'Deposit paid, thanks!', 'Farah Aziz', 'Follow up'],
  ['NA', 'Nurul Aina', '4:00 pm', 'Akemi Mattress · October Fair', 'You: Done, see you Saturday 3pm at Puchong. Joanne will meet you there.', 'Lim Wei Jie', 'Appointment'],
  ['FN', 'Fatin Nabila', 'Yesterday', 'Akemi Mattress · October Fair', 'Saiz queen berapa harga?', 'Amir Hamzah', 'New'],
  ['KS', 'Kevin Soo', 'Yesterday', 'Bedframe Bundle · Reels', 'You: Sure, I will send you the brochure now.', 'Amir Hamzah', 'Follow up'],
  ['AR', 'Aisyah Rahman', 'Sat', 'Akemi Mattress · September', 'You: See you Saturday 2pm at Puchong!', 'Amir Hamzah', 'Appointment'],
  ['YL', 'Yap Li Ting', 'Yesterday', 'Akemi Mattress · October Fair', 'Ada stok king size?', 'Kelvin Lee', 'New'],
  ['RK', 'Raj Kumar', 'Yesterday', 'Bedframe Bundle · Reels', 'You: I will check and get back to you today.', 'Kelvin Lee', 'Follow up'],
  ['NS', 'Nadia Salleh', 'Sat', 'Akemi Mattress · September', 'You: Confirmed, Sunday 11am at Puchong.', 'Kelvin Lee', 'Appointment'],
  ['WH', 'Wong Hui Min', 'Fri', 'Akemi Mattress · October Fair', 'Can I pay by installment?', 'Kelvin Lee', 'Follow up'],
  ['ZI', 'Zul Iskandar', 'Yesterday', 'Bedframe Bundle · Reels', 'Delivery to Klang ok?', 'Daniel Ong', 'New'],
  ['SL', 'Sharon Lee', 'Fri', 'Akemi Mattress · September', 'You: Thanks Sharon, see you this weekend!', 'Daniel Ong', 'Appointment'],
  ['HM', 'Hana Mokhtar', 'Sat', 'Akemi Mattress · October Fair', 'Warna lain ada?', 'Farah Aziz', 'Follow up'],
  ['LM', 'Lim Mei Ling', '8:30 am', 'Bedframe Bundle · Reels', 'Can deliver to Klang?', 'Priya Nair', 'Follow up'],
  ['AM', 'Azlan Mokhtar', '9:48 am', 'Dining Set · Stories', 'Hi, is the 6-seater dining set still available?', 'Organic · to assign', 'New'],
  ['GT', 'Grace Tan', '9:25 am', 'Dining Set · Stories', 'Can I see the dining set this weekend?', 'Organic · to assign', 'New'],
  ['TW', 'Tan Wei Jie', '8:05 am', 'Akemi Mattress · October Fair', 'You: Booked for Sun 4 Oct, 3:00 pm at Kuala Lumpur Showroom.', 'Principal', 'Appointment'],
];
const VISITS = [
  ['Mon 5 Oct', '4:00 pm', 'Yvonne Khoo', 'Joanne Teh · Penang Showroom', 'Showed up'],
  ['Tue 6 Oct', '11:00 am', 'Ganesh Pillai', 'Hafiz Rahman · Penang Showroom', 'To mark'],
  ['Wed 7 Oct', '3:00 pm', 'Wong Kah Hou', 'Principal · Kuala Lumpur Showroom', 'To mark'],
  ['Thu 8 Oct', '3:00 pm', 'Marcus Yeo', 'Farah Aziz · Kuala Lumpur Showroom', 'Showed up'],
  ['Today · Mon 12 Oct', '7:00 pm', 'Rajesh Kumar', 'Principal · Kuala Lumpur Showroom', 'Booked'],
  ['Tue 13 Oct', '11:00 am', 'Aisyah Kamal', 'Farah Aziz · Kuala Lumpur Showroom', 'Booked'],
  ['Wed 14 Oct', '11:00 am', 'Faizal Omar', 'Vincent Lim · Kuala Lumpur Showroom', 'Booked'],
  ['', '2:00 pm', 'Nicole Chan', 'Hafiz Rahman · Penang Showroom', 'Booked'],
  ['', '3:00 pm', 'Lim Wei Jie', 'Principal · Kuala Lumpur Showroom', 'Booked'],
  ['Thu 15 Oct', '10:00 am', 'Goh Siew Ling', 'Principal · Penang Showroom', 'Booked'],
];
const OPS = {
  'Organic Leads': [['Azlan Mokhtar', 'Dining Set · Stories · Messenger · 11 min ago', null, 'Send to'], ['Grace Tan', 'Dining Set · Stories · WhatsApp · 34 min ago', null, 'Send to']],
  'Ads to teams': [['Akemi Mattress · October Fair', 'WhatsApp · 11 leads · Not set · evenly', null, null, null, 'Not assigned yet · leads wait in Organic Leads'], ['Bedframe Bundle · Reels', 'Messenger · 7 leads · Not set · evenly', null, null, null, 'Not assigned yet · leads wait in Organic Leads'], ['Sofa Clearance · Carousel', 'Messenger · 5 leads · Not set · evenly', null, null, null, 'Not assigned yet · leads wait in Organic Leads'], ['Dining Set · Stories', 'Messenger · 2 leads · Not set · evenly', null, null, null, 'Not assigned yet · leads wait in Organic Leads'], ['Akemi Mattress · September', 'Messenger · 0 leads · Not set · evenly', null, null, null, 'Not assigned yet · leads wait in Organic Leads']],
  'Awaiting reply': [['Siti Hajar', 'Bedframe Bundle · Reels · Principal', 'Overdue · 49 h', 'Assign', '#A3371A'], ['Rosli Ismail', 'Bedframe Bundle · Reels · Daniel Ong', 'Overdue · 47 h', 'Assign', '#A3371A'], ['Ahmad Faizal', 'Sofa Clearance · Carousel · Principal', 'Overdue · 19 h', 'Assign', '#A3371A'], ['Goh Siew Ling', 'Akemi Mattress · October Fair · Principal', 'Overdue · 19 h', 'Assign', '#A3371A'], ['Tan Mei Ling', 'Akemi Mattress · October Fair · Principal', 'Overdue · 15 h', 'Assign', '#A3371A']],
  'Full time lead allocation': [['Team Kelvin', 'Senior TL Marcus Tan', 'Not set', 'Set up'], ['Team Priya', 'Senior TL Marcus Tan', 'Not set', 'Set up'], ['Team Ryan', 'Senior TL Marcus Tan', 'Not set', 'Set up']],
  'Member work type': [['Kelvin Lee', 'Team Kelvin', 'Full time'], ['Amir Hamzah', 'Team Kelvin', 'Full time'], ['Daniel Ong', 'Team Kelvin', 'Part time'], ['Priya Nair', 'Team Priya', 'Full time'], ['Joanne Teh', 'Team Priya', 'Part time'], ['Lina Ho', 'Team Priya', 'Full time'], ['Ryan Goh', 'Team Ryan', 'Full time']],
  'Showrooms': [['Kuala Lumpur Showroom', 'Jalan Ampang, Kuala Lumpur · Slots 11:00 am, 1:00, 3:00, 5:00, 7:00 pm · 2 per slot · Blocked: none', null, 'Edit'], ['Penang Showroom', 'No address yet · Slots 11:00 am, 1:00, 3:00, 5:00, 7:00 pm · 2 per slot · Blocked: none', null, 'Edit']],
  'Cold lead templates': [['Welcome back', 'Approved · WhatsApp', 'Approved', null, '#387557'], ['October Fair reminder', 'Approved · WhatsApp', 'Approved', null, '#387557'], ['Visit follow up', 'Approved · WhatsApp', 'Approved', null, '#387557'], ['Clearance last call', 'Waiting for Meta review', 'In review', null, '#A46312']],
  'Ads Performance': [['Akemi Mattress · October Fair', 'Leads 11 · Appt 5', '45%'], ['Bedframe Bundle · Reels', 'Leads 7 · Appt 2', '29%'], ['Sofa Clearance · Carousel', 'Leads 4 · Appt 2', '50%'], ['Akemi Mattress · September', 'Leads 2 · Appt 1', '50%'], ['Dining Set · Stories', 'Leads 1 · Appt 0', '0%']],
  'Notifications': [['Rosli Ismail · Overdue 47 h', 'Daniel Ong · Team Kelvin', '9:40 am'], ['Datin Rosnah was moved to you', 'From Kelvin Lee · Akemi Mattress · October Fair', '9:12 am'], ['Marcus Yeo · Won', 'Farah Aziz · Akemi Mattress · October Fair', 'Tue'], ['Wong Kah Hou · Lost', 'Principal · Sofa Clearance · Carousel', 'Wed']],
  'Auto-reply': [['Welcome', 'First message from a new customer', 'On', null, '#387557'], ['Outside hours', 'After 10:00 pm and before 9:00 am', 'On', null, '#387557'], ['Keywords', 'price · harga · alamat', 'Off']],
  'Quick replies': [['/alamat', 'Showroom address and Waze link', null, 'Edit'], ['/saiz', 'Akemi sizes and prices', null, 'Edit'], ['/ansuran', 'Installment plans', null, 'Edit']],
  'View my team': [['Kelvin Lee', 'Team leader', '6 chats'], ['Amir Hamzah', 'Executive', '4 chats'], ['Daniel Ong', 'Executive', '3 chats']],
};
const TEAMS = {
  'Team Kelvin': [['Kelvin Lee', 5, '40%', '50%'], ['Amir Hamzah', 4, '50%', '50%'], ['Daniel Ong', 3, '33%', '—'], ['Farah Aziz', 3, '33%', '100%']],
  'Team Priya': [['Priya Nair', 2, '50%', '—'], ['Joanne Teh', 1, '100%', '100%'], ['Lina Ho', 1, '0%', '—'], ['Hafiz Rahman', 1, '100%', '0%']],
  'Team Ryan': [['Ryan Goh', 1, '100%', '—'], ['Vincent Lim', 0, '—', '—']],
  'Revenue Director': [['Peter', 0, '—', '—']],
};
const AD_STATUS = { 'Akemi Mattress · October Fair': 'Running', 'Bedframe Bundle · Reels': 'Running', 'Sofa Clearance · Carousel': 'Running', 'Dining Set · Stories': 'Pending', 'Akemi Mattress · September': 'Paused' };
const ST_META = { all: ['All ads', '#2F6FB5', null, '#E4EDF8', '#2F6FB5'], Running: ['Running', '#3FA06B', null, '#E8F3ED', '#387557'], Paused: ['Paused', '#B4AEA4', null, '#F2F0EB', '#6B645A'], Pending: ['Pending', '#E1B04F', null, '#FFF0CC', '#A46312'] };
const AD_MEMBERS = {
  'Team Kelvin': [['Kelvin Lee', 0, 0], ['Farah Aziz', 1, 1], ['Amir Hamzah', 1, 1], ['Daniel Tan', 2, 2], ['Daniel Ong', 1, 1]],
  'Team Priya': [['Priya Nair', 0, 1], ['Joanne Teh', 1, 2], ['Lina Ho', 0, 1], ['Hafiz Rahman', 1, 1]],
  'Team Ryan': [['Ryan Goh', 1, 2], ['Vincent Lim', 0, 1]],
};
const shortName = (full, list) => { const f = full.split(' ')[0]; const dup = list.filter(x => x[0].split(' ')[0] === f).length > 1; return dup ? f + ' ' + (full.split(' ')[1] || '')[0] + '.' : f; };
const FT_PEOPLE = { 'Team Kelvin': ['Amir Hamzah', 'Principal'], 'Team Priya': ['Joanne Teh'], 'Team Ryan': ['Vincent Lim'] };
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REP_TEAM = { 'Joanne Teh': 'Team Priya', 'Hafiz Rahman': 'Team Priya', 'Principal': 'Team Kelvin', 'Farah Aziz': 'Team Kelvin', 'Vincent Lim': 'Team Ryan' };
const TEAM_C = { 'Team Kelvin': ['#BD4A19', '#FFF0E4'], 'Team Priya': ['#2F6FB5', '#E4EDF8'], 'Team Ryan': ['#8E4B6E', '#F3E8EF'] };
const SHEET_TABS = ['assignment', 'settings', 'profile', 'showrooms'];
const SHEET_COPY = { showrooms: ['Showrooms', 'Where visits are booked', 'Showrooms'], assignment: ['Assignment', 'Who gets each new enquiry', 'All assignment'], settings: ['Settings', 'Choose what to set up', 'All settings'], profile: ['Profile', 'Choose a setting', 'All settings'] };
const SECTION_PICK = { assignment: 0, settings: 2, profile: 1, showrooms: 0 };



function sortCl(S, rows) {
    const k = S.clSort || 'Last chat'; const O = ['Overdue', 'New', 'Follow up', 'Appointment', 'Showed up', 'No show yet', 'Cold', 'Won', 'Lost'];
    const si = (st) => { const i = O.findIndex(o => (st || '').startsWith(o)); return i < 0 ? 99 : i; };
    const r = rows.slice();
    if (k === 'Oldest chat') r.sort((a, b) => b.ord - a.ord);
    else if (k === 'Status') r.sort((a, b) => si(a.status) - si(b.status) || a.ord - b.ord);
    else if (k === 'Salesperson') r.sort((a, b) => (a.rep || '~').localeCompare(b.rep || '~') || a.ord - b.ord);
    else if (k === 'Name A–Z') r.sort((a, b) => a.name.localeCompare(b.name));
    else r.sort((a, b) => a.ord - b.ord);
    return r;
  }
function keyHandler(P, S, set, R) {
    R.key = (e) => {
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target && e.target.tagName === 'INPUT' && e.target.getAttribute('inputmode') === 'numeric') {
        const scope = e.target.closest('aside') || document; const list = [...scope.querySelectorAll('input[inputmode="numeric"]')].filter(x => x.offsetParent);
        const k = list.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : -1);
        if (list[k]) { e.preventDefault(); list[k].focus(); list[k].select(); }
        return;
      }
      if (e.key !== 'Escape') return; if (S.menu) set({ menu: false }); else closePane(P, S, set); };
    return R.key;
  }
function cur(P, S) {
    const p = P;
    const variant = S.variant ?? p.variant ?? 'panel';
    const tab = S.tab ?? p.tab ?? (variant === 'rs' ? 'inbox' : 'insight');
    const pane = S.pane ?? p.pane ?? PANE_MODE[tab];
    const kind = S.kind ?? p.kind ?? 'chat';
    return { variant, tab, pane, kind };
  }
function closePane(P, S, set) {
    const { tab, pane } = cur(P, S);
    if (sheetOn(P, tab)) { if (S.sendFor) set({ sendFor: null }); else if (S.awChat) set({ awChat: null }); else if (S.srEdit) set({ srEdit: null, srDraft: null }); else if (S.ftEdit) set({ ftEdit: null }); else if (S.ad != null) set({ ad: null }); else set({ stage: 'op' }); return; }
    if (pane === 'closed' || pane === 'empty' || pane === 'wideEmpty') return;
    set({ pane: PANE_MODE[tab], toast: false, pick: undefined });
  }
function sheetOn(P, tab) { return (P.flow === 'sheet') && SHEET_TABS.includes(tab); }
export function protoVals(P, S, set, R) {
    const p = P;
    const { variant, tab, pane, kind } = cur(P, S);
    const W = Number(p.w ?? 1440), H = W === 1440 ? 900 : 800;
    const collapsed = S.collapsed ?? p.collapsed ?? false;
    const sbW = collapsed ? 72 : 240;
    const crmW = W - sbW, bodyH = H - 60 - 56;
    const role = p.role ?? 'principal';
    const me = PEOPLE[role] || PEOPLE.principal;
    const teamMine = role === 'director' || role === 'leader';
    const mine = variant === 'rs';
    const dockW = W === 1440 ? 440 : 400;

    const tabList = mine ? RS_TABS : PANEL_TABS;
    const tabs = tabList.map(([id, label, badge]) => ({
      label, badge: badge || null, on: id === tab, off: id !== tab,
      pick: () => set({ tab: id, pane: PANE_MODE[id], toast: false }),
    }));
    const scopeOpts = [['Team', false], ['Mine', true]].map(([label, isMine]) => ({
      label, on: isMine === mine, off: isMine !== mine,
      pick: () => {
        const v = isMine ? 'rs' : 'panel';
        const t = isMine ? 'inbox' : 'insight';
        set({ variant: v, tab: t, pane: PANE_MODE[t], toast: false });
      },
    }));
    const periodLabels = mine ? ['Day', 'Week', 'Month', 'Range'] : ['Today', 'This week', 'This month', 'Custom'];
    const periodOpts = periodLabels.map((label, i) => ({ label, on: i === 2, off: i !== 2 }));

    const sheetMode = sheetOn(P, tab);
    const stage = S.stage ?? p.stage ?? 'menu';
    const isWide = !sheetMode && pane === 'wide';
    const isCenter = !sheetMode && pane === 'wideEmpty';
    const isOverlay = pane === 'overlay';
    const paneShown = !sheetMode && pane !== 'closed' && pane !== 'wideEmpty';
    const paneW = isWide ? crmW - 380 : dockW;
    const pageW = isWide ? 380 : (pane === 'empty' || pane === 'docked') ? crmW - dockW : crmW;
    const base = { width: paneW, display: 'flex', flexDirection: 'column', background: '#FFFFFF', boxSizing: 'border-box', overflow: 'hidden' };
    const paneStyle = isOverlay
      ? { ...base, position: 'absolute', top: 0, right: 0, bottom: 0, borderLeft: '1px solid #EBDDD2', boxShadow: '-16px 0 40px rgba(40,25,18,.16)', zIndex: 4 }
      : { ...base, flex: `0 0 ${paneW}px`, minWidth: 0, borderLeft: isWide ? 0 : '1px solid #EBDDD2' };

    const effKind = kind;
    const heads = {
      chat: { avatar: CHATS[S.chat ?? 0][0], title: CHATS[S.chat ?? 0][1], sub: CHATS[S.chat ?? 0][3], subColor: '#387557', menu: true },
      alerts: { title: 'CRM alerts', sub: 'Move · Share · Won · Lost · Overdue 9 h+', subColor: '#806B60' },
      section: { title: ((LISTS[tab] || [])[S.pick ?? SECTION_PICK[tab] ?? 0] || ['Showrooms'])[0], sub: tab === 'assignment' ? 'Assignment · CRM · Manage' : 'Settings · CRM · Manage', subColor: '#806B60' },
      assign: { title: 'Assign to', sub: CHATS[S.chat ?? 0][1] + ' · ' + CHATS[S.chat ?? 0][3], subColor: '#806B60' },
      metrics: { title: 'Customise metrics', sub: 'Pick the columns for Ads Performance', subColor: '#806B60' },
      clist: (() => { const k = S.clist || 'Leads'; const L = { 'st:New': 'New', 'st:Overdue': 'Attention', 'st:Appointment': 'Appointment', 'st:Follow up': 'Follow up', 'st:Cold': 'Cold leads' }; return { title: L[k] || k, sub: L[k] ? 'Leads by status · tap to open the chat' : 'October · tap a customer for their info', subColor: '#806B60' }; })(),
      info: { title: 'Customer info', sub: (() => { if (S.infoName) return S.infoName; const v = VISITS[S.visit ?? 8]; return v[2] + ' · visit ' + (v[0] || 'Wed 14 Oct') + ' ' + v[1]; })(), subColor: '#806B60' },
      team: (() => { const t = S.team || 'Team Kelvin'; const person = S.person; return { title: person || t, sub: person ? t + ' · their leads' : 'Senior TL Marcus Tan · its people this month', subColor: '#806B60' }; })(),
    };
    const ph = heads[effKind] || heads.chat;
    const empties = {
      inbox: ['Pick a chat to read and reply', 'It opens here; the list stays where it is', 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z'],
      contacts: ['Pick a contact', 'Customer info and their chat open here', 'M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
      assignment: ['Pick a section', 'Its editors open here', 'M6 3v6a6 6 0 0 0 6 6h6m0 0-3-3m3 3-3 3M6 21v-6'],
      settings: ['Pick a setting', 'It opens here', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
      profile: ['Pick a setting', 'It opens here', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    };
    const em = empties[tab] || empties.inbox;
    const pickIdx = pane === 'wide' ? (S.pick ?? SECTION_PICK[tab] ?? 0) : -1;
    const listCards = (LISTS[tab] || []).map(([title, sub, ic], i) => ({
      title, sub, d: LI[ic], bg: TINTS[i % 4][0], fg: TINTS[i % 4][1],
      rowBg: i === pickIdx ? '#FFF1E6' : 'transparent', titleColor: i === pickIdx ? '#BD4A19' : '#3F2B22',
      pick: () => set({ pane: 'wide', kind: 'section', pick: i }),
    }));

    const openItem = () => {
      if (tab === 'insight' || tab === 'calendar') set({ pane: 'overlay', kind: 'info' });
      else if (isWide) set({ pane: 'wide', kind: 'section' });
      else set({ pane: 'docked', kind: 'chat' });
    };
    const labels = { inbox: 'Open a chat', contacts: 'Open a contact', insight: 'Open a list', calendar: 'Open a visit' };

    const fold = S.fold || {};
    const mkSec = (id, num, label, items, scope) => ({
      num, label, scope: !!scope, items, open: !fold[id], rot: fold[id] ? -90 : 0,
      toggle: () => set(st => ({ fold: { ...(st.fold || {}), [id]: !(st.fold || {})[id] } })),
    });
    const crmItems = tabList.map(([id, label, badge]) => ({
      label, d: ICON[id], count: badge || null, on: id === tab, off: id !== tab,
      pick: () => set({ tab: id, pane: PANE_MODE[id], toast: false, pick: undefined, ntfP: false, stage: id === 'showrooms' ? 'op' : 'menu' }),
    }));
    const appTop = NAV.filter(n => n[0] !== 'Notifications' && n[0] !== 'Profile').map(([label, d]) => ({ label, d, count: null, on: false, off: true, pick: () => {} }));
    const appBottom = NAV.filter(n => n[0] === 'Notifications').map(([label, d, c]) => ({ label, d, count: c || null, on: false, off: true, pick: () => {} }));
    const profileOpen = !fold.profile;
    const profIcon = { label: 'Profile', d: NAV[4][1], count: null, on: false, off: true, pick: () => set({ collapsed: false }) };
    const appItems = appTop;
    const acctItems = NAV.filter(n => n[0] === 'Notifications' || n[0] === 'Profile').map(([label, d, c]) => ({ label, d, count: c || null, on: false, off: true, pick: () => {} }));
    const sections = [
      mkSec('app', '', '', appTop),
      mkSec('crm', '', '', [profIcon, ...crmItems]),
      mkSec('acct', '', '', appBottom),
    ];
    const curTab = tabList.find(t => t[0] === tab) || ['', '', 0];
    const opIdx = S.pick ?? SECTION_PICK[tab] ?? 0;
    const opItem = (LISTS[tab] || [])[opIdx] || ['', ''];
    const vi = S.visit ?? 8;
    const vv = VISITS[vi];
    const vChat = CHATS.find(c => c[1] === vv[2]);
    const infoRows = [[vv[2], 'Customer'], [(vv[0] || 'Wed 14 Oct') + ' · ' + vv[1], 'Visit', vv[4]], [vv[3].split(' · ')[1], 'Showroom'], [vv[3].split(' · ')[0], 'Salesperson'], [vChat ? vChat[3] : '—', 'Ad'], [vChat ? vChat[4] : 'No chat yet', 'Last message']];
    const opRows = kind === 'info' ? infoRows.map(([t, s2, right]) => ({ t, s: s2, right: right || null, btn: null, rc: '#2F5E8C' })) : (OPS[opItem[0]] || []).map(([t, s2, right, btn, rc, note], i) => { const go = opItem[0] === 'Ads to teams'; const sel = go && S.ad === i;
      const isOrg = opItem[0] === 'Organic Leads' || opItem[0] === 'Awaiting reply'; const isAw = opItem[0] === 'Awaiting reply'; const sentTo = (S.sent || {})[t];
      const reminded = (S.reminded || {})[t]; const owner = isAw ? s2.split(' · ').pop() : null;
      return { t, s: s2, right: sentTo ? (isAw ? 'Moved to ' : 'Sent to ') + sentTo : (right || null), btn: sentTo ? null : (btn || null), rc: sentTo ? '#387557' : (rc || '#3F2B22'),
        btn2: isAw && !sentTo ? (reminded ? 'Reminded' : 'Remind') : null,
        act2: (e) => { e.stopPropagation(); if (reminded) return; clearTimeout(R.tt); set(st => ({ reminded: { ...(st.reminded || {}), [t]: true }, toast: true, toastMsg: 'Reminder sent to ' + owner + ' · reply to ' + t, undoKey: null })); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000); },
        btnBg: S.sendFor === t ? '#FFF1E6' : '#fff',
        act: isOrg ? (e) => { e.stopPropagation(); set({ sendFor: t, stage: 'op' }); } : () => {}, note: (S.saved || {})[t] ? 'Saved · ' + (S.saved || {})[t] : (note || null), noteColor: (S.saved || {})[t] ? '#387557' : '#A46312', go,
        bg: sel ? '#FFF1E6' : '#fff', cur: go || isAw ? 'pointer' : 'default', open: isAw ? () => set({ awChat: t, sendFor: null, stage: 'op' }) : go ? () => set({ ad: i, stage: 'op', adMode: 'team', tm: {} }) : () => {} }; });
    const ci = S.chat ?? 0;
    const chat = CHATS[ci];
    const listTab = tab === 'inbox' || tab === 'contacts';
    const whoSel = S.whoSel || [];
    const who = whoSel.length ? 'multi' : null;
    const teamOf = (name) => Object.keys(TEAMS).find(t => TEAMS[t].some(p => p[0] === name));
    const match1 = (w, c) => w.startsWith('team:') ? (teamOf(c[5]) === w.slice(5) || c[5] === w.slice(5) + ' · to assign') : c[5] === w;
    const match = (c) => !whoSel.length || whoSel.some(w => match1(w, c));
    const chats = CHATS.map((c, i) => [c, i]).filter(([c]) => match(c)).map(([c, i]) => {
      const key = c[6].startsWith('Overdue') ? 'Overdue' : c[6];
      const sel = (pane === 'docked') && i === ci;
      return { ini: c[0], name: c[1], time: c[2], ad: c[3], msg: c[4], owner: c[5], status: c[6], stBg: ST[key][0], stFg: ST[key][1], avBg: AV[i % 5], rowBg: sel ? '#FFF1E6' : '#fff',
        open: () => set({ pane: 'docked', kind: 'chat', chat: i, fromTeam: false }) };
    });
    const nShown = CHATS.filter(match).length;
    const cnt = (k) => CHATS.filter(match).filter(c => c[6].startsWith(k)).length;
    const filters = (mine ? ['All 13', 'Needs a reply 5', 'Follow up 5', 'Appointment 2'] : (who ? ['All ' + nShown, 'Needs a reply ' + (cnt('Overdue') + cnt('New')), 'Follow up ' + cnt('Follow up'), 'Appointment ' + cnt('Appointment')] : ['All 24', 'Needs a reply 7', 'Follow up 9', 'Appointment 4', 'Won 2', 'Lost 2']))
      .map(l => W === 1440 ? l : l.replace('Needs a reply', 'Reply').replace('Appointment', 'Appt').replace('Follow up', 'Follow'))
      .map((label, i) => ({ label, bg: i === 0 ? '#3F2B22' : '#fff', fg: i === 0 ? '#fff' : '#3F2B22', bd: i === 0 ? '#3F2B22' : '#EBDDD2' }));
    const sc = SHEET_COPY[tab] || ['', '', ''];
    const SOLID = ['#BD4A19', '#2F6FB5', '#8E4B6E', '#387557', '#4E2F20'];
    const BADGE = { 'Organic Leads': 2, 'Awaiting reply': 7, 'Notifications': 7 };
    const PHONE_IC = { 'Organic Leads': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 9h8M8 13h5', 'Ads to teams': 'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7', 'Full time lead allocation': 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 16l2 2 4-4' };
    const ftState = S.ft || {};
    const ftOnN = Object.values(ftState).filter(v => v && v.on).length;
    const ftSub = Object.keys(ftState).length ? (ftOnN ? 'On for ' + ftOnN + ' of 3 teams' : 'Off for all teams') : null;
    const subFor = (title, sub) => title === 'Full time lead allocation' && ftSub ? ftSub : sub;
    const sheetRows = (LISTS[tab] || []).map(([title, sub0, ic], i) => { const sub = subFor(title, sub0); return {
      title, sub, d: PHONE_IC[title] || LI[ic], badge: BADGE[title] || null,
      bg: SOLID[i % 5], fg: '#FFFFFF',
      pick: () => set({ pick: i, stage: 'op' }),
    }; });
    return {
      ...(() => {
        const adOpen = sheetMode && stage !== 'menu' && opItem[0] === 'Ads to teams' && S.ad != null;
        const row = adOpen ? OPS['Ads to teams'][S.ad] : ['', ''];
        const mode = S.adMode || 'evenly';
        const tm = S.tm || {};
        const T = [['Team Kelvin', '#BD4A19'], ['Team Priya', '#2F6FB5'], ['Team Ryan', '#8E4B6E']];
        const OPTS = [['evenly', 'Evenly'], ['pct', 'By %'], ['max', 'By max']];
        const pctDefault = S.split || { 'Team Kelvin': 50, 'Team Priya': 30, 'Team Ryan': 20 };
        const setSplit = (name, raw) => {
          const v = Math.max(0, Math.min(100, parseInt(String(raw).replace(/\D/g, ''), 10) || 0));
          const others = T.map(x => x[0]).filter(n => n !== name);
          const rest = others.reduce((a2, n) => a2 + pctDefault[n], 0);
          const out = { [name]: v };
          let left = 100 - v;
          others.forEach((n, i) => { const share = i === others.length - 1 ? left : (rest ? Math.round((100 - v) * pctDefault[n] / rest) : Math.round((100 - v) / others.length)); out[n] = share; left -= share; });
          set({ split: out });
        };
        const mv = S.mv || {};
        return {
          adOpen, ad: { name: row[0], meta: row[1].split(' · ').slice(0, 2).join(' · ') },
          adModes: [['evenly', 'Evenly'], ['team', 'By team']].map(([v, label]) => ({ label, on: v === mode, off: v !== mode, pick: () => set({ adMode: v }) })),
          adByTeam: mode === 'team', adEvenly: mode !== 'team',
          adSplit: T.map(([name, color]) => ({ name, color, pct: mode === 'team' ? pctDefault[name] : 33, pctStr: String(mode === 'team' ? pctDefault[name] : 33), onRange: (e) => setSplit(name, e.target.value) })),
          resetSplit: () => set({ split: null, mv: {} }),
          evenTotal: T.reduce((a2, [n]) => a2 + AD_MEMBERS[n].length, 0),
          evenTeams: T.map(([name, color]) => ({ name, color, avs: AD_MEMBERS[name].map(([mn]) => ({ ini: mn.split(' ').map(w => w[0]).join('').slice(0, 2) })), names: AD_MEMBERS[name].map(([mn]) => shortName(mn, AD_MEMBERS[name])).join(', ') })),
          adTeams: T.map(([name, color]) => { const m = tm[name] || (name === 'Team Kelvin' ? 'max' : 'evenly');
            const mem = AD_MEMBERS[name];
            const pctEach = Math.round(100 / mem.length);
            const totalMax = mem.reduce((a2, x) => a2 + (mv[name + '|max|' + x[0]] != null ? mv[name + '|max|' + x[0]] : x[2]), 0);
            const totalPct = mem.reduce((a2, x) => a2 + (mv[name + '|pct|' + x[0]] != null ? mv[name + '|pct|' + x[0]] : Math.round(100 / mem.length)), 0);
            return { name, color, share: pctDefault[name] + '%', field: m !== 'evenly', unit: m === 'pct' ? '%' : 'max',
              note: m === 'max' ? 'Up to ' + totalMax + ' leads in this team' : m === 'pct' ? (totalPct === 100 ? 'Adds up to 100%' : 'Adds up to ' + totalPct + '% · needs 100%') : 'Shared evenly among ' + mem.length + ' people',
              noteColor: m === 'pct' && totalPct !== 100 ? '#A3371A' : '#387557',
              members: mem.map(([mn, taken, mx0]) => { const key = name + '|' + m + '|' + mn; const mx = m === 'max' && mv[key] != null ? mv[key] : mx0; return { name: mn,
                value: m === 'pct' ? (mv[key] != null ? mv[key] : pctEach) : mx,
                valueStr: String(m === 'pct' ? (mv[key] != null ? mv[key] : pctEach) : mx),
                onVal: (e) => { const v = Math.min(m === 'pct' ? 100 : 999, parseInt(String(e.target.value).replace(/\D/g, ''), 10) || 0); set(st => ({ mv: { ...(st.mv || {}), [key]: v } })); },
                sub: m === 'max' ? (mx === 0 ? 'Gets none' : taken + ' of ' + mx + ' taken' + (taken >= mx ? ' · full' : '')) : taken + ' taken so far',
                subColor: m === 'max' && mx > 0 && taken >= mx ? '#A3371A' : '#806B60' }; }),
              opts: OPTS.map(([v, label]) => ({ label, on: v === m, off: v !== m, pick: () => set(st => ({ tm: { ...(st.tm || {}), [name]: v } })) })) }; }),
          closeAd: () => set({ ad: null }),
          applyLabel: (() => { const f = S.adSt || 'Running'; const n = OPS['Ads to teams'].filter(r => f === 'all' || AD_STATUS[r[0]] === f).length; return 'Save and apply to all ' + n + (f === 'all' ? '' : ' ' + f.toLowerCase()) + ' ads'; })(),
          applyAll: () => {
            const split = mode === 'evenly' ? T.map(([n]) => [n, 33, '']) : T.map(([n]) => { const m = tm[n] || (n === 'Team Kelvin' ? 'max' : 'evenly'); const mem = AD_MEMBERS[n]; const val = (x) => { const k = n + '|' + m + '|' + x[0]; return mv[k] != null ? mv[k] : (m === 'pct' ? Math.round(100 / mem.length) : x[2]); };
              const detail = m === 'pct' ? mem.map(x => shortName(x[0], mem) + ' ' + val(x) + '%').join(' · ') : m === 'max' ? mem.map(x => shortName(x[0], mem) + ' ' + val(x)).join(' · ') : '';
              return [n, pctDefault[n], m === 'max' ? 'max ' + mem.reduce((a2, x) => a2 + val(x), 0) : m === 'pct' ? 'by %' : 'evenly', detail]; });
            const label = mode === 'evenly' ? 'Evenly · each team 1/3' : 'By team';
            const f = S.adSt || 'Running';
            const names = OPS['Ads to teams'].map(r => r[0]).filter(n => f === 'all' || AD_STATUS[n] === f || n === row[0]);
            const ss = { ...(S.savedSplit || {}) }, sm = { ...(S.savedMode || {}) }, sk = { ...(S.adKind || {}) };
            const se = { ...(S.savedEdit || {}) }; const snap = { adMode: mode, tm: { ...tm }, mv: { ...mv }, split: S.split ? { ...S.split } : null };
            names.forEach(n => { se[n] = snap; ss[n] = split; sm[n] = n === row[0] ? label : label + ' · copied from ' + row[0].split(' · ')[0]; sk[n] = n === row[0] ? 'source' : 'copied'; });
            clearTimeout(R.tt);
            set({ ad: null, savedEdit: se, savedSplit: ss, savedMode: sm, adKind: sk, toast: true, toastMsg: 'Applied to ' + names.length + (f === 'all' ? '' : ' ' + f.toLowerCase()) + ' ads' });
            R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000);
          },
          saveAd: () => { clearTimeout(R.tt); set(st => ({ ad: null, savedEdit: { ...(st.savedEdit || {}), [row[0]]: { adMode: mode, tm: { ...tm }, mv: { ...mv }, split: st.split ? { ...st.split } : null } }, saved: { ...(st.saved || {}), [row[0]]: mode === 'evenly' ? 'Evenly · each team 1/3' : T.map(([n]) => { const m = tm[n] || (n === 'Team Kelvin' ? 'max' : 'evenly'); const mem = AD_MEMBERS[n]; return n.replace('Team ', '') + ' ' + pctDefault[n] + '% (' + (m === 'max' ? 'max ' + mem.reduce((a2, x) => a2 + x[2], 0) : m === 'pct' ? 'by %' : 'evenly') + ')'; }).join(' · ') }, toast: true, toastMsg: 'Saved · ' + row[0],
            savedSplit: { ...(st.savedSplit || {}), [row[0]]: mode === 'evenly' ? T.map(([n]) => [n, 33, '']) : T.map(([n]) => { const m = tm[n] || (n === 'Team Kelvin' ? 'max' : 'evenly'); const mem = AD_MEMBERS[n]; const val = (x) => { const k = n + '|' + m + '|' + x[0]; return mv[k] != null ? mv[k] : (m === 'pct' ? Math.round(100 / mem.length) : x[2]); };
              const detail = m === 'pct' ? mem.map(x => shortName(x[0], mem) + ' ' + val(x) + '%').join(' · ') : m === 'max' ? mem.map(x => shortName(x[0], mem) + ' ' + val(x)).join(' · ') : '';
              return [n, pctDefault[n], m === 'max' ? 'max ' + mem.reduce((a2, x) => a2 + val(x), 0) : m === 'pct' ? 'by %' : 'evenly', detail]; }) },
            savedMode: { ...(st.savedMode || {}), [row[0]]: mode === 'evenly' ? 'Evenly · each team 1/3' : 'By team' },
            adKind: { ...(st.adKind || {}), [row[0]]: (st.adKind || {})[row[0]] === 'copied' ? 'adjusted' : (st.adKind || {})[row[0]] } })); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000); },
        };
      })(),
      ...(() => {
        const sf = S.sendFor; const row = (OPS[opItem[0]] || []).find(r => r[0] === sf);
        const sendOpen = sheetMode && stage !== 'menu' && (opItem[0] === 'Organic Leads' || opItem[0] === 'Awaiting reply') && !!sf;
        const awName = S.awChat; const awC = CHATS.find(c => c[1] === awName);
        const awOpen = sheetMode && stage !== 'menu' && (opItem[0] === 'Awaiting reply' || opItem[0] === 'Chat progress') && !!awName && !sf && !!awC;
        const TT = [['Team Kelvin', '#BD4A19', '#FFF0E4'], ['Team Priya', '#2F6FB5', '#E4EDF8'], ['Team Ryan', '#8E4B6E', '#F3E8EF']];
        return { sendOpen, sendName: sf || '', sendMeta: row ? row[1] : '',
          awOpen, aw: awC ? { name: awC[1], ini: awC[0], ad: awC[3], owner: awC[5] + "'s customer", status: awC[6], msg: awC[4].replace(/^You: /, ''), out: awC[4].startsWith('You: '), inn: !awC[4].startsWith('You: '), time: /am|pm/.test(awC[2]) ? 'Today' : awC[2], clock: /am|pm/.test(awC[2]) ? awC[2] : '10:12 am', reply: 'Reply to ' + awC[1].split(' ')[0] + '…', remindLog: 'Principal sent ' + awC[5] + ' a reminder to reply · ' + ((S.remindAt || {})[awName] || '9:41 am'), reminded: !!(S.reminded || {})[awName], notReminded: !(S.reminded || {})[awName] } : {},
          awAssign: () => set({ sendFor: awName, awMenuOpen: false }),
          awMenu: !!S.awMenuOpen, awMenuToggle: () => set(st => ({ awMenuOpen: !st.awMenuOpen })),
          awRemind: () => { clearTimeout(R.tt); set(st => ({ awMenuOpen: false, reminded: { ...(st.reminded || {}), [awName]: true }, toast: true, toastMsg: 'Reminder sent to ' + awC[5] + ' · reply to ' + awName, undoKey: null })); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000); },
          closeAw: () => set({ awChat: null }),
          closeSend: () => set({ sendFor: null }),
          sendGroups: TT.map(([label, color, tint]) => ({ label: label.toUpperCase(), color, people: (AD_MEMBERS[label] || []).map(([name], i) => ({ name, ini: name.split(' ').map(w => w[0]).join('').slice(0, 2), sub: label,
            bg: i === 0 ? color : tint, fg: i === 0 ? '#fff' : color,
            pick: () => { clearTimeout(R.tt); set(st => ({ sendFor: null, awChat: null, sent: { ...(st.sent || {}), [sf]: name }, toast: true, toastMsg: (opItem[0] === 'Awaiting reply' ? 'Moved ' : 'Sent ') + sf + ' to ' + name, undoKey: sf })); R.tt = setTimeout(() => set({ toast: false, toastMsg: null, undoKey: null }), 30000); } })) })) };
      })(),
      isAdsOp: opItem[0] === 'Ads to teams', notAdsOp: opItem[0] !== 'Ads to teams' && opItem[0] !== 'Full time lead allocation',
      isFtOp: opItem[0] === 'Full time lead allocation', showKicker: tab !== 'showrooms', showOpChip: tab !== 'settings' && tab !== 'showrooms' && opItem[0] !== 'Ads to teams' && opItem[0] !== 'Full time lead allocation',
      isMwtOp: opItem[0] === 'Member work type', plainOp: opItem[0] !== 'Ads to teams' && opItem[0] !== 'Full time lead allocation' && opItem[0] !== 'Member work type' && opItem[0] !== 'Cold lead templates' && opItem[0] !== 'Showrooms' && opItem[0] !== 'Forms' && !(tab === 'settings' && opItem[0] === 'Notifications'),
      isSrOp: opItem[0] === 'Showrooms', srDays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(l => ({ l })),
      ...(() => { const TIMES = ['11:00 am', '1:00 pm', '3:00 pm', '5:00 pm', '7:00 pm']; const DI = [0, 1, 2, 3, 4, 5, 6];
        const BASE = [['Puchong Showroom', 'Jalan Kenari 5, Bandar Puchong Jaya', 2, ''], ['Kuala Lumpur Showroom', 'Jalan Ampang, Kuala Lumpur', 2, ''], ['Penang Showroom', '', 2, '']];
        const sv = S.srData || {}; const mapU = (a) => ({ g: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a), w: 'https://waze.com/ul?q=' + encodeURIComponent(a) + '&navigate=yes' });
        const ALLT = ['10:00 am', '10:30 am', '11:00 am', '11:30 am', '12:00 pm', '12:30 pm', '1:00 pm', '1:30 pm', '2:00 pm', '2:30 pm', '3:00 pm', '3:30 pm', '4:00 pm', '4:30 pm', '5:00 pm', '5:30 pm', '6:00 pm', '6:30 pm', '7:00 pm', '7:30 pm', '8:00 pm', '8:30 pm', '9:00 pm'];
        const get = (b) => ({ times: [...TIMES], dispName: b[0], addr: b[1], gmap: '', waze: '', photo: '', limit: b[2], blocks: [], off: {}, weekDays: [], ...(sv[b[0]] || {}) });
        const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const DS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        const fd = (iso) => { if (!iso) return ''; const [, m, d] = iso.split('-'); return parseInt(d, 10) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m, 10) - 1]; };
        const timeTxt = (b) => b.allDay || !(b.ranges || []).length ? 'All day' : b.ranges.map(r => r.f + ' – ' + r.t).join(', ');
        const blkSummary = (bl, wd) => { const parts = []; if ((wd || []).length) parts.push('Every ' + wd.map(i => DN[i].slice(0, 3)).join(', ')); const ds = bl.filter(b => b.kind === 'date'); if (ds.length) parts.push(ds.length === 1 ? fd(ds[0].from) + (ds[0].to && ds[0].to !== ds[0].from ? ' – ' + fd(ds[0].to) : '') : ds.length + ' dates'); return parts.length ? parts.join(' · ') : 'None'; };
        const _old = (bl) => !bl.length ? 'None' : bl.length === 1 ? (bl[0].kind === 'week' ? 'Every ' + bl[0].days.map(i => DN[i]).join(', ') : fd(bl[0].from) + (bl[0].to && bl[0].to !== bl[0].from ? ' – ' + fd(bl[0].to) : '')) : bl.length + ' blocks';
        const bk = S.srBlk || { days: [], from: '', to: '', allDay: true, ranges: [{ f: '11:00 am', t: '1:00 pm' }], reason: '', wkReason: '' };
        const HOURS = ['10:00 am', '11:00 am', '12:00 pm', '1:00 pm', '2:00 pm', '3:00 pm', '4:00 pm', '5:00 pm', '6:00 pm', '7:00 pm', '8:00 pm', '9:00 pm'];
        const updB = (x) => set(st => ({ srBlk: { ...(st.srBlk || bk), ...x } }));
        const cnt = (off, tm) => (tm || TIMES).length * 7 - Object.keys(off).filter(k => (tm || TIMES).includes(k.split('|')[0])).length;
        const en = S.srEdit; const dr = S.srDraft; const srOpen = sheetMode && stage !== 'menu' && opItem[0] === 'Showrooms' && !!en && !!dr;
        const upd = (x) => set(st => ({ srDraft: { ...st.srDraft, ...x } }));
        return { srOpen,
          srCards: BASE.map(b => { const d = get(b); const n = cnt(d.off, d.times); const sel = en === b[0] && srOpen;
            return { gUrl: d.manual && d.gmap ? d.gmap : d.addr ? mapU(d.addr).g : '#', wUrl: d.manual && d.waze ? d.waze : d.addr ? mapU(d.addr).w : '#', name: b[0], dispName: d.dispName || b[0], photo: d.photo || '', addr: d.addr || 'No address yet', limit: String(d.limit), blocked: (() => { const ds = d.blocks.filter(b => b.kind === 'date'); return !ds.length ? 'No blocked dates' : ds.length === 1 ? fd(ds[0].from) + (ds[0].to && ds[0].to !== ds[0].from ? ' – ' + fd(ds[0].to) : '') : ds.length + ' dates'; })(), blockFg: d.blocks.length || (d.weekDays || []).length ? '#3F2B22' : '#A08E82',
              openN: String(n), totN: String(d.times.length * 7),
              ...(() => { const DNx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const wd = d.weekDays || [];
                const openD = [0, 1, 2, 3, 4, 5, 6].filter(di => !wd.includes(di) && d.times.some(t => !d.off[t + '|' + di]));
                const rangeTxt = (arr) => { if (arr.length === 7) return 'Every day'; if (!arr.length) return 'Closed'; const runs = []; let st = arr[0], pv = arr[0]; for (let i = 1; i <= arr.length; i++) { if (arr[i] === pv + 1) { pv = arr[i]; continue; } runs.push(st === pv ? DNx[st] : DNx[st] + ' – ' + DNx[pv]); st = arr[i]; pv = arr[i]; } return runs.join(', '); };
                const closedD = [0, 1, 2, 3, 4, 5, 6].filter(di => !openD.includes(di));
                const partial = d.times.length * 7 - n - wd.length * d.times.length;
                const ds = d.blocks.filter(b => b.kind === 'date');
                return { addrFg: d.addr ? '#3F2B22' : '#A08E82', daysTxt: rangeTxt(openD), daysTxtFg: openD.length ? '#3F2B22' : '#A3371A', daysSub: closedD.length ? 'Closed ' + closedD.map(i => DNx[i]).join(', ') : '',
                  timesTxt: d.times.length ? d.times.join(' · ') : 'No times set', timesTxtFg: d.times.length ? '#3F2B22' : '#A3371A', timesSub: d.times.length + ' time' + (d.times.length === 1 ? '' : 's') + ' a day' + (partial > 0 ? ' · ' + partial + ' slot' + (partial === 1 ? '' : 's') + ' closed on some days' : ''),
                  limitTxt: d.limit + ' visit' + (d.limit === 1 ? '' : 's') + ' per time', limitTxtFg: '#3F2B22',
                  blockedFg: ds.length ? '#3F2B22' : '#A08E82', blockedSub: ds.length > 1 ? ds.slice(0, 3).map(b => fd(b.from) + (b.to && b.to !== b.from ? ' – ' + fd(b.to) : '') + ' · ' + timeTxt(b)).join('\n') : ds.length === 1 ? timeTxt(ds[0]) + (ds[0].reason ? ' · ' + ds[0].reason : '') : '' }; })(), slotSub: n === d.times.length * 7 ? d.times.length + ' times · every day' : (d.times.length * 7 - n) + ' closed', bd: sel ? '#BD4A19' : '#EBDDD2', ring: sel ? '0 0 0 3px #FFF0E4' : 'none',
              edit: () => set({ srEdit: b[0], srDraft: { ...d, times: [...d.times], off: { ...d.off }, blocks: [...d.blocks], weekDays: [...(d.weekDays || [])] }, srBlkOpen: false, srTab: 'info', srCal: null }) }; }),
          srN: String(BASE.length),
          srLinkModes: [[false, 'Auto'], [true, 'Paste link']].map(([v, label]) => { const on = !!(dr && dr.manual) === v; return { label, bg: on ? '#fff' : 'transparent', sh: on ? '0 1px 3px rgba(63,43,34,.12)' : 'none', fg: on ? '#3F2B22' : '#806B60', pick: () => upd({ manual: v }) }; }),
          srTabSlots: (S.srTab || 'info') === 'slots', srTabBlk: S.srTab === 'blk', srTabInfo: (S.srTab || 'info') === 'info',
          srTabs: [['info', 'Details', ''], ['slots', 'Open slots', dr ? String(cnt(dr.off, dr.times)) : ''], ['blk', 'Blocked', dr ? String(dr.blocks.filter(b => b.kind === 'date').length + (dr.weekDays || []).length) : '']].map(([k, label, n]) => { const on = (S.srTab || 'info') === k; return { label, n, bg: on ? '#fff' : 'transparent', sh: on ? '0 1px 3px rgba(63,43,34,.12)' : 'none', fg: on ? '#3F2B22' : '#806B60', nBg: on ? '#FFF0E4' : '#EBDDD2', nFg: on ? '#BD4A19' : '#6B574C', pick: () => set({ srTab: k }) }; }),
          srBlkOpen: !!S.srBlkOpen, srBlkNone: !!dr && !dr.blocks.length && !S.srBlkOpen,
          srBlkBtn: S.srBlkOpen ? 'Close' : 'Block time', srBlkIc: S.srBlkOpen ? 'M18 6 6 18M6 6l12 12' : 'M12 5v14M5 12h14', srBlkBtnBg: S.srBlkOpen ? '#FFF1E6' : '#fff',
          srBlkToggle: () => set(st => ({ srBlkOpen: !st.srBlkOpen, srBlk: null })),
          srBlk: { ...bk, fromTxt: bk.from ? fd(bk.from) : 'Pick date', toTxt: bk.to ? fd(bk.to) : 'Pick date', fromBd: S.srCal === 'from' ? '#BD4A19' : '#E8DBD0', toBd: S.srCal === 'to' ? '#BD4A19' : '#E8DBD0', fromFg: bk.from ? '#3F2B22' : '#B9A89B', toFg: bk.to ? '#3F2B22' : '#B9A89B' },
          
          srBlkDays: DN.map((l, i) => { const wd = dr ? (dr.weekDays || []) : []; const on = wd.includes(i); return { l, bd: on ? '#BD4A19' : '#E2CFC1', bg: on ? '#BD4A19' : '#fff', fg: on ? '#fff' : '#3F2B22', toggle: () => upd({ weekDays: on ? wd.filter(x => x !== i) : [...wd, i].sort() }) }; }),
          ...(() => { const wd = dr ? (dr.weekDays || []) : []; return { srWkNote: wd.length ? 'Closed every ' + wd.map(i => DN[i]).join(', ') : '', srWkFg: wd.length ? '#A3371A' : '#806B60' }; })(),
          
          srBlkFrom: (e) => updB({ from: e.target.value, to: bk.to && bk.to >= e.target.value ? bk.to : e.target.value }), srBlkTo: (e) => updB({ to: e.target.value, from: bk.from && bk.from <= e.target.value ? bk.from : e.target.value }), srBlkReason: (e) => updB({ reason: e.target.value }),
          srHours: HOURS.map(v => ({ v })),
          ...(() => { const which = S.srCal; const mi = S.srCalM ?? 0; const y = 2026, m0 = 9 + mi; const yy = y + Math.floor(m0 / 12), mm = m0 % 12;
            const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const first = new Date(yy, mm, 1); const lead = (first.getDay() + 6) % 7; const days = new Date(yy, mm + 1, 0).getDate();
            const io = (d) => yy + '-' + String(mm + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); const today = '2026-10-12';
            const f = bk.from, t = bk.to || bk.from; const cells = [];
            for (let i = 0; i < lead; i++) cells.push({ n: '', dis: true, band: 'transparent', br: '0', dot: 'transparent', fg: '#3F2B22', ring: '0', w: 500, cur: 'default', pick: () => {} });
            for (let d = 1; d <= days; d++) { const iso = io(d); const past = iso < today; const edge = iso === f || iso === t; const inR = f && t && iso > f && iso < t;
              cells.push({ n: String(d), dis: past, cur: past ? 'not-allowed' : 'pointer', band: (inR || (edge && f !== t)) ? '#FFF1E6' : 'transparent', br: f !== t && iso === f ? '17px 0 0 17px' : f !== t && iso === t ? '0 17px 17px 0' : '0',
                dot: edge ? '#BD4A19' : 'transparent', fg: edge ? '#fff' : past ? '#D3C4B8' : '#3F2B22', ring: iso === today && !edge ? '1.5px solid #BD4A19' : '0', w: edge || iso === today ? 700 : 500,
                pick: () => { if (past) return; if (which === 'to') { if (f && iso < f) updB({ from: iso, to: iso }); else updB({ to: iso }); set({ srCal: null }); } else { updB({ from: iso, to: bk.to && bk.to >= iso ? bk.to : iso }); set({ srCal: 'to' }); } } }); }
            return { srCalOpen: !!which, srCalLabel: MN[mm] + ' ' + yy, srCalHint: which === 'to' ? 'Pick the To date' : 'Pick the From date', srCalCells: cells, srCalDow: ['M','T','W','T','F','S','S'].map(l => ({ l })),
              srCalFrom: () => set(st => ({ srCal: st.srCal === 'from' ? null : 'from' })), srCalTo: () => set(st => ({ srCal: st.srCal === 'to' ? null : 'to' })),
              srCalPrev: () => set({ srCalM: Math.max(0, mi - 1) }), srCalNext: () => set({ srCalM: Math.min(14, mi + 1) }) }; })(), srShowPicker: (e) => { try { e.target.showPicker && e.target.showPicker(); } catch (err) {} }, srPickTime: !bk.allDay, srHasBlocks: !!dr && dr.blocks.some(b => b.kind === 'date'),
          srTimeModes: [[true, 'All day'], [false, 'Pick a time']].map(([v, label]) => { const on = bk.allDay === v; return { label, bg: on ? '#fff' : 'transparent', sh: on ? '0 1px 3px rgba(63,43,34,.12)' : 'none', fg: on ? '#3F2B22' : '#806B60', pick: () => updB({ allDay: v }) }; }),
          srRanges: bk.ranges.map((r, i) => { const fi = HOURS.indexOf(r.f);
            const setF = (e) => { const nf = e.target.value; const nfi = HOURS.indexOf(nf); updB({ ranges: bk.ranges.map((x, j) => j === i ? { f: nf, t: HOURS.indexOf(x.t) > nfi ? x.t : HOURS[nfi + 1] } : x) }); };
            const setT = (e) => updB({ ranges: bk.ranges.map((x, j) => j === i ? { ...x, t: e.target.value } : x) });
            return { f: r.f, t: r.t, setF, setT, fromHours: HOURS.slice(0, -1).map(v => ({ v })), toHours: HOURS.slice(fi + 1).map(v => ({ v })), remove: () => { const nr = bk.ranges.filter((_, j) => j !== i); updB(nr.length ? { ranges: nr } : { ranges: [{ f: '11:00 am', t: '1:00 pm' }], allDay: true }); } }; }),
          srAddRange: () => { const last = bk.ranges[bk.ranges.length - 1]; const li = last ? HOURS.indexOf(last.t) : 1; updB({ ranges: [...bk.ranges, { f: HOURS[Math.min(li + 1, 10)], t: HOURS[Math.min(li + 2, 11)] }] }); },
          
          ...(() => { const okD = !!bk.from; const rng = bk.from ? fd(bk.from) + (bk.to && bk.to !== bk.from ? ' – ' + fd(bk.to) : '') : ''; return { srDtCur: okD ? 'pointer' : 'not-allowed', srDtHint: okD ? rng + ' · ' + (bk.allDay ? 'All day' : bk.ranges.map(r => r.f + ' – ' + r.t).join(', ')) : '', srDtHintFg: okD ? '#3F2B22' : '#A08E82', srDtNoAdd: !okD, srDtAddBg: okD ? '#BD4A19' : '#D9C6B8',
            srDtAdd: () => { if (!okD) return; set(st => ({ srDraft: { ...st.srDraft, blocks: [...st.srDraft.blocks, { kind: 'date', from: bk.from, to: bk.to || bk.from, allDay: bk.allDay, ranges: bk.allDay ? [] : bk.ranges, reason: bk.reason }] }, srBlk: { ...bk, from: '', to: '', reason: '', allDay: true, ranges: [{ f: '11:00 am', t: '1:00 pm' }] } })); } }; })(),
          srApplyAll: () => { clearTimeout(R.tt); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000);
            set(st => { const nd = { ...(st.srData || {}) }; const x = st.srDraft; BASE.forEach(b => { const cur = get(b); nd[b[0]] = { ...cur, ...(b[0] === en ? { addr: x.addr, dispName: x.dispName, photo: x.photo, gmap: x.gmap, waze: x.waze, manual: x.manual } : {}), limit: x.limit, times: [...x.times], off: { ...x.off }, blocks: [...x.blocks], weekDays: [...(x.weekDays || [])] }; });
              return { srData: nd, srEdit: null, srDraft: null, srBlkOpen: false, toast: true, toastMsg: 'Applied to all ' + BASE.length + ' showrooms' }; }); },
          srE: dr ? { manual: !!dr.manual, showAuto: !dr.manual && !!dr.addr, showNoAddr: !dr.manual && !dr.addr, gmapUrl: dr.addr ? mapU(dr.addr).g : '', wazeUrl: dr.addr ? mapU(dr.addr).w : '',
              linkFields: [['#34A853', 'G', 'gmap', 'https://maps.app.goo.gl/…'], ['#33CCFF', 'W', 'waze', 'https://waze.com/ul/…']].map(([bg, ch, k, ph]) => ({ bg, ch, ph, v: dr[k] || '', set: (e) => upd({ [k]: e.target.value }) })), name: dr.dispName || en, dispName: dr.dispName, gmap: dr.gmap, waze: dr.waze, photo: dr.photo || '', noPhoto: !dr.photo, photoBd: dr.photo ? 'transparent' : '#D9B79F', addr: dr.addr, limit: String(dr.limit), blocks: dr.blocks.map((b, i) => [b, i]).filter(([b]) => b.kind === 'date').map(([b, i]) => ({ tag: b.kind === 'week' ? 'Every week' : 'Date', tagBg: b.kind === 'week' ? '#E4EDF8' : '#FFF0E4', tagFg: b.kind === 'week' ? '#2F6FB5' : '#BD4A19',
              when: b.kind === 'week' ? b.days.map(j => DN[j]).join(', ') : fd(b.from) + (b.to && b.to !== b.from ? ' – ' + fd(b.to) : ''), sub: timeTxt(b) + (b.reason ? ' · ' + b.reason : ''),
              remove: () => set(st => ({ srDraft: { ...st.srDraft, blocks: st.srDraft.blocks.filter((_, j) => j !== i) } })) })), openN: String(cnt(dr.off, dr.times)), allLabel: cnt(dr.off, dr.times) === dr.times.length * 7 ? 'Close all' : 'Open all', totN: String(dr.times.length * 7),
            slots: dr.times.map((t) => ({ time: t, remove: () => set(st => ({ srDraft: { ...st.srDraft, times: st.srDraft.times.filter(x => x !== t) } })), cells: DI.map(di => { const k = t + '|' + di; const on = !dr.off[k]; return { on, bg: on ? '#BD4A19' : '#fff', bd: on ? '#BD4A19' : '#E2CFC1',
              toggle: () => set(st => { const o = { ...st.srDraft.off }; if (o[k]) delete o[k]; else o[k] = 1; return { srDraft: { ...st.srDraft, off: o } }; }) }; }) })) } : { manual: false, showAuto: false, showNoAddr: true, linkFields: [], gmapUrl: '', wazeUrl: '', name: '', dispName: '', gmap: '', waze: '', photo: '', noPhoto: true, photoBd: '#D9B79F', addr: '', limit: '', blocks: [], openN: '', allLabel: '', slots: [] },
          srSetAddr: (e) => upd({ addr: e.target.value }),
          ...(() => { const cur = dr ? dr.times : []; const opts = ALLT.filter(t => !cur.includes(t)); const nt = opts.includes(S.srNewT) ? S.srNewT : opts[0] || '';
            const DNs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; const nd = S.srNewD || [0, 1, 2, 3, 4, 5, 6]; const okT = !!nt && nd.length > 0;
            return { srNewDays: DNs.map((l, i) => { const on = nd.includes(i); return { l, bd: on ? '#BD4A19' : '#E2CFC1', bg: on ? '#BD4A19' : '#fff', fg: on ? '#fff' : '#3F2B22', toggle: () => set({ srNewD: on ? nd.filter(x => x !== i) : [...nd, i].sort() }) }; }),
              srNewHint: !nd.length ? 'Pick at least one day' : '',
              srNewOpts: opts.map(v => ({ v })), srNewT: nt, srNoNewT: !okT, srAddTBg: okT ? '#BD4A19' : '#D9C6B8', srSetNewT: (e) => set({ srNewT: e.target.value }),
              srAddTime: () => { if (!okT) return; set(st => { const off = { ...st.srDraft.off }; [0, 1, 2, 3, 4, 5, 6].forEach(di => { if (!nd.includes(di)) off[nt + '|' + di] = 1; else delete off[nt + '|' + di]; }); return { srDraft: { ...st.srDraft, off, times: [...st.srDraft.times, nt].sort((a, b) => ALLT.indexOf(a) - ALLT.indexOf(b)) }, srNewT: null, srNewD: null }; }); } }; })(), srSetName: (e) => upd({ dispName: e.target.value }), srSetGmap: (e) => upd({ gmap: e.target.value }), srSetWaze: (e) => upd({ waze: e.target.value }),
          srSetPhoto: (e) => { const f = e.target.files && e.target.files[0]; if (f) upd({ photo: URL.createObjectURL(f) }); }, srRemovePhoto: () => upd({ photo: '' }),
          srLimDown: () => upd({ limit: Math.max(1, (dr ? dr.limit : 2) - 1) }), srLimUp: () => upd({ limit: Math.min(20, (dr ? dr.limit : 2) + 1) }),
          srAll: () => set(st => { const tm = st.srDraft.times; const all = cnt(st.srDraft.off, tm) === tm.length * 7; const o = {}; if (all) tm.forEach((t) => DI.forEach(di => { o[t + '|' + di] = 1; })); return { srDraft: { ...st.srDraft, off: o } }; }),
          srClose: () => set({ srEdit: null, srDraft: null }),
          srSave: () => { clearTimeout(R.tt); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000);
            set(st => ({ srData: { ...(st.srData || {}), [en]: st.srDraft }, srEdit: null, srDraft: null, toast: true, toastMsg: ((S.srDraft || {}).dispName || en) + ' saved' })); } }; })(),
      isCltOp: opItem[0] === 'Cold lead templates',
      ...(() => {
        const SC = { New: ['#FFF1E6', '#BD4A19'], 'Follow up': ['#F1E7DF', '#6B574C'], Appointment: ['#E4EDF8', '#2F5E8C'], Visit: ['#E8F3ED', '#387557'], Won: ['#E8F3ED', '#387557'], Lost: ['#F8E1D8', '#A3371A'] };
        const KD = { move: ['#2F6FB5', '#E4EDF8', 'M5 12h14M13 6l6 6-6 6'], assign: ['#2F6FB5', '#E4EDF8', 'M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M16 11h6'], share: ['#8E4B6E', '#F3E8EF', 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4'], reply: ['#387557', '#E8F3ED', 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z'], appt: ['#2F5E8C', '#E4EDF8', 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4'], visit: ['#387557', '#E8F3ED', 'M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12ZM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'], note: ['#6B574C', '#F1E7DF', 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'], status: ['#6B574C', '#F1E7DF', 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4'], won: ['#387557', '#E8F3ED', 'M5 12.5l4.5 4.5L19 7.5'], lost: ['#A3371A', '#F8E1D8', 'M6 6l12 12M18 6 6 18'] };
        const CP = [
          ['Tan Mei Ling', 'Akemi Mattress · October Fair', 'Lim Wei Jie', 'Team Kelvin', [[13, '10:00 am', 'You', 'move', 'Moved the chat to Lim Wei Jie', 'New'], [13, '1:00 pm', 'Lim Wei Jie', 'reply', 'First reply to the customer', 'Follow up'], [15, '11:20 am', 'Lim Wei Jie', 'appt', 'Booked a visit · Fri 16 Oct, 3:00 pm · Puchong', 'Appointment'], [16, '3:05 pm', 'Lim Wei Jie', 'visit', 'Customer checked in at Puchong', 'Visit'], [16, '5:40 pm', 'Lim Wei Jie', 'note', 'Back to follow up', 'Follow up', 'Likes the Akemi Queen, wants to check with her husband first'], [20, '2:15 pm', 'Lim Wei Jie', 'won', 'Signed · Akemi Queen set', 'Won']]],
          ['Syafiq Rahim', 'Bedframe Bundle · Reels', 'Joanne Teh', 'Team Priya', [[14, '9:00 am', 'Kelvin Lee', 'assign', 'Assigned the chat to Joanne Teh', 'New'], [14, '9:40 am', 'Joanne Teh', 'reply', 'First reply to the customer', 'Follow up'], [15, '4:10 pm', 'Joanne Teh', 'note', 'Note added', null, 'Needs delivery to Klang, asked about installment'], [17, '10:30 am', 'Joanne Teh', 'appt', 'Booked a visit · Sat 18 Oct, 11:00 am · Puchong', 'Appointment'], [18, '9:15 am', 'Joanne Teh', 'appt', 'Changed the visit to Sun 19 Oct, 2:00 pm', null]]],
          ['Chong Li Na', 'Akemi Mattress · September', 'Principal', 'Team Kelvin', [[11, '2:30 pm', 'You', 'move', 'Moved the chat to Principal', 'New'], [11, '3:05 pm', 'Principal', 'reply', 'First reply to the customer', 'Follow up'], [12, '10:00 am', 'Principal', 'appt', 'Booked a visit · Tue 14 Oct, 7:00 pm · Penang', 'Appointment'], [14, '7:20 pm', 'Principal', 'visit', 'Customer checked in at Penang', 'Visit'], [19, '11:45 am', 'Principal', 'lost', 'Marked as lost', 'Lost', 'Bought from another shop, cheaper price']]],
          ['Mei Xin', 'Akemi Mattress · October Fair', 'Amir Hamzah', 'Team Kelvin', [[12, '11:10 am', 'Kelvin Lee', 'assign', 'Assigned the chat to Amir Hamzah', 'New'], [12, '12:30 pm', 'Amir Hamzah', 'reply', 'First reply to the customer', 'Follow up'], [16, '8:00 pm', 'Amir Hamzah', 'appt', 'Booked a visit · Sat 17 Oct, 4:00 pm · Puchong', 'Appointment'], [17, '4:12 pm', 'Amir Hamzah', 'visit', 'Customer checked in at Puchong', 'Visit'], [17, '6:00 pm', 'Amir Hamzah', 'status', 'Back to follow up', 'Follow up']]],
          ['Nurul Aina', 'Akemi Mattress · October Fair', 'Lim Wei Jie', 'Team Kelvin', [[19, '9:30 am', 'Kelvin Lee', 'assign', 'Assigned the chat to Amir Hamzah', 'New'], [19, '10:15 am', 'Amir Hamzah', 'reply', 'First reply to the customer', 'Follow up'], [20, '11:00 am', 'You', 'move', 'Moved the chat from Amir Hamzah to Lim Wei Jie', null, 'Amir is on leave until 27 Oct'], [20, '2:30 pm', 'Lim Wei Jie', 'share', 'Shared the chat with Joanne Teh', null, 'Joanne is at Puchong on Saturday and will meet the customer'], [21, '4:00 pm', 'Joanne Teh', 'appt', 'Booked a visit · Sat 24 Oct, 3:00 pm · Puchong', 'Appointment']], ['Joanne Teh'], ['Amir Hamzah']],
          ['Datin Rosnah', 'Akemi Mattress · October Fair', 'Principal', 'Team Kelvin', [[10, '2:00 pm', 'You', 'assign', 'Assigned the chat to Kelvin Lee', 'New'], [10, '3:10 pm', 'Kelvin Lee', 'reply', 'First reply to the customer', 'Follow up'], [21, '9:12 am', 'Kelvin Lee', 'move', 'Moved the chat from Kelvin Lee to Principal', null]], [], ['Kelvin Lee']],
          ['Lim Mei Ling', 'Bedframe Bundle · Reels', 'Priya Nair', 'Team Priya', [[18, '10:00 am', 'You', 'assign', 'Assigned the chat to Priya Nair', 'New'], [18, '10:40 am', 'Priya Nair', 'reply', 'First reply to the customer', 'Follow up'], [21, '8:30 am', 'Priya Nair', 'share', 'Shared the chat with Principal', null]], ['Principal'], []],
          ['Fatin Nabila', 'Akemi Mattress · October Fair', 'Principal', 'Team Kelvin', [[21, '8:50 am', 'Kelvin Lee', 'assign', 'Assigned the chat to Principal', 'New']], [], []],
          ['Hakimi Yusof', 'Bedframe Bundle · Reels', 'Vincent Lim', 'Team Ryan', [[18, '11:00 am', 'Ryan Tan', 'assign', 'Assigned the chat to Vincent Lim', 'New']]],
        ];
        const ORD = ['New', 'Follow up', 'Appointment', 'Visit', 'Won', 'Lost'];
        const mins = (t) => { const m = t.match(/(\d+):(\d+) (am|pm)/); return (+m[1] % 12 + (m[3] === 'pm' ? 12 : 0)) * 60 + +m[2]; };
        const rows = CP.map((c, idx) => { const ev = c[4]; let cur = 'New'; ev.forEach(e => { if (e[5]) cur = e[5]; }); const L = ev[ev.length - 1]; return { c, idx, ev, cur, ts: L[0] * 1440 + mins(L[1]), sh: c[5] || [], was: c[6] || [] }; });
        const people = [...new Set(rows.flatMap(r => [r.c[2], ...r.sh, ...r.was]))].sort(); const pp = S.cpP || null;
        const PT = { ...REP_TEAM, 'Amir Hamzah': 'Team Kelvin', 'Lim Wei Jie': 'Team Kelvin' }; rows.forEach(r => { PT[r.c[2]] = r.c[3]; });
        const inv = (r, p) => r.c[2] === p || r.sh.includes(p) || r.was.includes(p);
        const TR = S.cpT || 'This month'; const cF = S.cpFrom ?? 13, cT = S.cpTo ?? 21;
        const [d0, d1] = TR === 'Today' ? [21, 21] : TR === 'This week' ? [19, 25] : TR === 'Custom' ? [Math.min(cF, cT), Math.max(cF, cT)] : [1, 31];
        const inT = (r) => r.ev.some(e => e[0] >= d0 && e[0] <= d1);
        const hasP0 = (r) => !pp || (pp.startsWith('team:') ? [r.c[2], ...r.sh, ...r.was].some(p => PT[p] === pp.slice(5)) : inv(r, pp));
        const mineOn = !!S.cpMine; const myEv = (r) => r.ev.filter(e => e[2] === 'You' && ['assign', 'move', 'share'].includes(e[3]));
        const hasP = (r) => inT(r) && hasP0(r) && (!mineOn || myEv(r).length > 0);
        const ini = (n) => n.split(' ').map(w => w[0]).join('').slice(0, 2);
        const f = S.cpF || 'All', sortBy = S.cpSort || 'Latest update';
        let list = rows.filter(r => hasP(r) && (f === 'All' || r.cur === f));
        list.sort(sortBy === 'Status' ? (a, b) => ORD.indexOf(a.cur) - ORD.indexOf(b.cur) : (a, b) => b.ts - a.ts);
        const selN = S.cpSelName; const sel0 = selN ? CP.findIndex(c => c[0] === selN) : S.cpSel; const cmp = sel0 != null && opItem[0] === 'Chat progress'; const SH = { 'Follow up': 'F/up', Appointment: 'Appt', 'Won / Lost': 'Won/Lost' };
        const strip = (r, compact) => { const first = {}; r.ev.forEach(e => { if (e[5] && !first[e[5]]) first[e[5]] = e[0] + ' Oct'; }); const end = r.cur === 'Lost' ? 'Lost' : 'Won';
          const st = ['New', 'Follow up', 'Appointment', 'Visit', end]; const got = st.map(k => !!first[k] || (k === 'Visit' && false));
          return st.map((k, i) => { const on = got[i], isCur = k === r.cur, col = SC[k][1];
            const lb = k === 'Won' && !on ? 'Won / Lost' : k; return { label: compact ? (SH[lb] || lb) : lb, date: first[k] || '—', dot: on ? col : '#fff', ring: on ? col : '#DCCBBF', size: isCur ? 14 : 10, lab: on ? '#3F2B22' : '#A8968B', w: isCur ? 700 : 500,
              lL: i === 0 ? 'transparent' : (on ? '#C9B3A4' : '#EBDDD2'), lR: i === 4 ? 'transparent' : (got[i + 1] ? '#C9B3A4' : '#EBDDD2') }; }); };
        const sel = sel0 < 0 ? null : sel0; const cpOn = sel != null && opItem[0] === 'Chat progress' && !S.awChat; const sr = cpOn ? rows[sel] : null;
        return { isCpOp: opItem[0] === 'Chat progress', cpOpen: cpOn,
          cpChips: ['All', ...ORD].map(k => { const on = f === k; const pr = rows.filter(hasP); const n = k === 'All' ? pr.length : pr.filter(r => r.cur === k).length; return { label: k, n, bg: on ? '#3F2B22' : '#fff', fg: on ? '#fff' : '#3F2B22', bd: on ? '#3F2B22' : '#E2CFC1', nfg: on ? '#E9DCD2' : '#806B60', pick: () => set({ cpF: k }) }; }),
          cpTimes: ['Today', 'This week', 'This month', 'Custom'].map(k => { const on = TR === k; return { label: k, bg: on ? '#fff' : 'transparent', fg: on ? '#3F2B22' : '#806B60', sh: on ? '0 1px 2px rgba(63,43,34,.12)' : 'none', pick: () => set({ cpT: k }) }; }),
          cpRange: d0 === d1 ? 'Wed ' + d0 + ' Oct 2026' : d0 + ' – ' + d1 + ' Oct 2026', cpCustom: TR === 'Custom',
          cpFromV: '2026-10-' + String(cF).padStart(2, '0'), cpToV: '2026-10-' + String(cT).padStart(2, '0'),
          setCpFrom: (e) => { const v = +String(e.target.value).slice(8, 10); if (v) set({ cpFrom: v }); }, setCpTo: (e) => { const v = +String(e.target.value).slice(8, 10); if (v) set({ cpTo: v }); },
          cpSorts: ['Latest update', 'Status'].map(k => { const on = sortBy === k; return { label: k, bg: on ? '#fff' : 'transparent', fg: on ? '#3F2B22' : '#806B60', sh: on ? '0 1px 2px rgba(63,43,34,.12)' : 'none', pick: () => set({ cpSort: k }) }; }),
          cpEmpty: !list.length, cpMineOn: mineOn, cpMineN: rows.filter(r => myEv(r).length).length, cpMineBg: mineOn ? '#3F2B22' : '#fff', cpMineFg: mineOn ? '#fff' : '#3F2B22', cpMineBd: mineOn ? '#3F2B22' : '#E2CFC1', cpMineNfg: mineOn ? '#E9DCD2' : '#806B60',
          cpMineToggle: () => set(st => ({ cpMine: !st.cpMine })), cpWide: !cmp, cpCtlFlex: cmp ? '1 0 100%' : '0 0 auto', cpChipPad: cmp ? '10px' : '14px', cpG: cmp ? 'minmax(150px, 1fr) minmax(250px, 1.5fr)' : 'minmax(220px, 1.3fr) minmax(400px, 2.8fr) 104px 128px', cpMinW: cmp ? '0' : '900px',
          cpPLabel: pp ? pp.replace('team:', '') : 'Everyone', cpPDot: pp ? TEAM_C[pp.startsWith('team:') ? pp.slice(5) : PT[pp]][0] : '#806B60', cpPOpen: !!S.cpPOpen, cpPToggle: () => set(st => ({ cpPOpen: !st.cpPOpen })), cpPBd: pp ? '#3F2B22' : '#E2CFC1',
          cpAll: (() => { const on = !pp; const n = rows.filter(inT).length; return { n: n + (n === 1 ? ' chat' : ' chats'), bg: on ? '#FFF1E6' : 'transparent', fg: on ? '#BD4A19' : '#3F2B22', pick: () => set({ cpP: null, cpPOpen: false }) }; })(),
          cpTeams: Object.keys(TEAM_C).map(t => { const tc = TEAM_C[t]; const key = 'team:' + t; const on = pp === key; const tn = rows.filter(inT).filter(r => [r.c[2], ...r.sh, ...r.was].some(p => PT[p] === t)).length;
            return { label: t, fg: tc[0], tint: tc[1], n: tn + (tn === 1 ? ' chat' : ' chats'), bg: on ? tc[1] : 'transparent', pick: () => set({ cpP: key, cpPOpen: false }),
              members: people.filter(p => PT[p] === t).map(p => { const pon = pp === p; const n = rows.filter(r => inT(r) && inv(r, p)).length; return { label: p, ini: ini(p), fg: tc[0], tint: tc[1], n: n + (n === 1 ? ' chat' : ' chats'), bg: pon ? tc[1] : 'transparent', w: pon ? 700 : 500, pick: () => set({ cpP: p, cpPOpen: false }) }; }) }; }),
          cpRows: list.map(r => { const L = r.ev[r.ev.length - 1]; const on = sel === r.idx; return { name: r.c[0], ad: r.c[1], owner: r.c[2], team: r.c[3], hasMine: mineOn && myEv(r).length > 0, mineTxt: (() => { const L = myEv(r).slice(-1)[0]; if (!L) return ''; const verb = { assign: 'You assigned', move: 'You moved', share: 'You shared' }[L[3]]; const to = (L[4].match(/to (.+)$|with (.+)$/) || []).slice(1).find(Boolean) || ''; return verb + (L[3] === 'share' ? ' with ' : ' to ') + to + ' · ' + L[0] + ' Oct'; })(), tfg: (TEAM_C[r.c[3]] || ['#806B60'])[0], ttint: (TEAM_C[r.c[3]] || [0, '#F5EBE3'])[1], hasSh: !!r.sh.length, shTxt: 'Shared with ' + r.sh.join(', '), init: r.c[2].split(' ').map(w => w[0]).join('').slice(0, 2), status: r.cur, sbg: SC[r.cur][0], sfg: SC[r.cur][1], last: L[0] + ' Oct · ' + L[1], lastWho: L[2] === 'You' ? 'by you' : 'by ' + L[2],
            steps: strip(r, cmp), bg: on ? '#FFF8F2' : '#fff', open: () => set({ stage: 'op', cpSel: r.idx, cpSelName: null, awChat: null, sendFor: null, frmOpen: false, cltEdit: null }) }; }),
          cpClose: () => set({ cpSel: null, cpSelName: null }),
          cpOpenChat: () => { if (sr && CHATS.some(c => c[1] === sr.c[0])) set({ awChat: sr.c[0], sendFor: null, stage: 'op' }); },
          cpName: sr ? sr.c[0] : '', cpSub: sr ? sr.c[1] + ' · ' + sr.c[2] : '', cpStatus: sr ? sr.cur : '', cpSbg: sr ? SC[sr.cur][0] : '#fff', cpSfg: sr ? SC[sr.cur][1] : '#000', cpSteps: sr ? strip(sr) : [],
          cpEv: sr ? sr.ev.slice().reverse().map((e, i, R) => { const k = KD[e[3]]; const showD = !i || R[i - 1][0] !== e[0]; return { date: showD ? e[0] + ' Oct' : '', time: e[1], who: e[2] === 'You' ? 'You' : e[2], text: e[4], fg: k[0], bg: k[1], d: k[2],
            hasSt: !!e[5], st: e[5] || '', stbg: e[5] ? SC[e[5]][0] : '#fff', stfg: e[5] ? SC[e[5]][1] : '#000', hasNote: !!e[6], note: e[6] || '', line: i === R.length - 1 ? 'transparent' : '#EBDDD2', pt: showD && i ? '14px' : '0' }; }) : [] };
      })(),
      isNtfOp: tab === 'settings' && opItem[0] === 'Notifications',
      ...(() => { const TY = { 'To assign': ['#BD4A19', '#FFF0E4', 'M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.17-2.87L3 3M15 9l6-6'], Overdue: ['#A3371A', '#F8E1D8', 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'], Move: ['#2F6FB5', '#E4EDF8', 'M5 12h14M13 6l6 6-6 6'], Assign: ['#3D5A75', '#E3EAF1', 'M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M16 11h6'], Share: ['#8E4B6E', '#F3E8EF', 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13'], Appointment: ['#8A5A12', '#FDF1D8', 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'], Won: ['#387557', '#E4F1EA', 'M20 6 9 17l-5-5'], Lost: ['#806B60', '#F2ECE6', 'M18 6 6 18M6 6l12 12'], General: ['#4E2F20', '#F5EBE3', 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'] };
        const N = [
          ['a1', 'Today', 'To assign', 'Azlan Mokhtar', 'is a new organic lead waiting to be assigned', 'Dining Set · Stories · Messenger · 11 min ago', '9:48 am', 0, 'org'],
          ['a2', 'Today', 'To assign', 'Grace Tan', 'is a new organic lead waiting to be assigned', 'Dining Set · Stories · WhatsApp · 34 min ago', '9:25 am', 0, 'org'],
          ['a3', 'Today', 'To assign', 'Dining Set · Stories', 'is a new ad with no team split yet', 'Messenger · 2 leads so far · they wait in Organic Leads', '9:00 am', 0, 'ad'],
          ['n1', 'Today', 'Overdue', 'Rosli Ismail', 'has waited 47 h for a reply', 'Daniel Ong · Last message Thu 10:40 am', '9:40 am', 0],
          ['n2', 'Today', 'Move', 'Datin Rosnah', 'was moved to you', 'From Kelvin Lee · Akemi Mattress · October Fair', '9:12 am', 0],
          ['n8', 'Today', 'Assign', 'Kelvin Lee', 'assigned Fatin Nabila to you', 'Akemi Mattress · October Fair', '8:50 am', 0],
          ['n3', 'Today', 'Share', 'Priya Nair', 'shared Lim Mei Ling with you', 'Bedframe Bundle · Reels', '8:30 am', 0],
          ['n4', 'Today', 'Appointment', 'Tan Wei Jie', 'booked a showroom visit', 'Kuala Lumpur Showroom · Sun 4 Oct, 3:00 pm', '8:05 am', 1],
          ['n5', 'Earlier', 'Won', 'Marcus Yeo', 'was marked as won', 'Farah Aziz · Akemi Mattress · October Fair', 'Tue', 1],
          ['n6', 'Earlier', 'Lost', 'Wong Kah Hou', 'was marked as lost', 'Principal · Sofa Clearance · Carousel', 'Wed', 1],
          ['n7', 'Earlier', 'General', 'Ryan Tan', 'accepted your invitation and joined Team Ryan', 'Team Ryan', 'Mon', 1]];
        const rd = S.ntfRead || Object.fromEntries(N.filter(n => n[7]).map(n => [n[0], 1]));
        const tabK = S.ntfTab || 'unread'; const f = S.ntfF || 'all';
        const del = S.ntfDel || {}; const NL = N.filter(n => !del[n[0]]); const pickd = S.ntfPick || {}; const selMode = !!S.ntfSel;
        const inTab = NL.filter(n => tabK === 'unread' ? !rd[n[0]] : !!rd[n[0]]);
        const CAT = [['all', 'All', null], ['toassign', 'To assign', ['To assign']], ['overdue', 'Overdue', ['Overdue']], ['move', 'Move', ['Move']], ['assign', 'Assign', ['Assign']], ['share', 'Share', ['Share']], ['appts', 'Appointments', ['Appointment']], ['results', 'Results', ['Won', 'Lost']], ['general', 'General', ['General']]];
        const cat = S.ntfCat || 'all'; const inCat = (n, c) => { const x = CAT.find(q => q[0] === c); return !x[2] || x[2].includes(n[2]); };
        const list = inTab.filter(n => inCat(n, cat)); const unreadN = NL.filter(n => !rd[n[0]]).length;
        const setRd = (o) => set({ ntfRead: o });
        const groups = ['Today', 'Earlier'].map(g => ({ label: g.toUpperCase(), items: list.filter(n => n[1] === g).map(([id, , type, who, rest, sub, time]) => { const u = !rd[id];
          const pk = !!pickd[id]; const custN = type === 'Share' ? rest.replace(/^shared /, '').replace(/ with you$/, '') : type === 'Assign' ? rest.replace(/^assigned /, '').replace(/ to you$/, '') : who; const chI = CHATS.findIndex(c => c[1] === custN);
            const tg0 = chI >= 0 ? () => set({ ntfRead: { ...rd, [id]: 1 }, tab: 'inbox', pane: 'docked', kind: 'chat', chat: chI, fromTeam: false, whoSel: [], toast: false }) : () => { const o = { ...rd }; if (u) o[id] = 1; else delete o[id]; setRd(o); }; return { cols: selMode ? '20px 10px 46px minmax(0, 1fr) auto' : '10px 46px minmax(0, 1fr) auto', click: selMode ? () => set(st => { const o = { ...(st.ntfPick || {}) }; if (o[id]) delete o[id]; else o[id] = 1; return { ntfPick: o }; }) : tg0, who, rest, sub, time, type, unread: u, bg: selMode && pk ? '#FBF6F2' : '#fff', dotC: u ? '#BD4A19' : 'transparent', sel: selMode, nosel: !selMode, pk, cbBg: pk ? '#BD4A19' : '#fff', cbBd: pk ? '#BD4A19' : '#CDBCAE',
            pickT: (e) => { e.stopPropagation(); set(st => { const o = { ...(st.ntfPick || {}) }; if (o[id]) delete o[id]; else o[id] = 1; return { ntfPick: o }; }); }, icFg: TY[type][0], icBg: TY[type][1], ic: TY[type][2], tip: chI >= 0 ? 'Open chat' : (u ? 'Mark as read' : 'Mark as unread'),
            goAs: type === 'To assign', goAsLabel: 'Assign now',
            openAs: (e) => { e.stopPropagation(); const isAd = N.find(x => x[0] === id)[8] === 'ad'; set({ ntfRead: { ...rd, [id]: 1 }, tab: 'assignment', pane: PANE_MODE.assignment, pick: isAd ? 1 : 0, stage: 'op', ad: isAd ? OPS['Ads to teams'].findIndex(r => r[0] === who) : null, adMode: 'team', tm: {}, mv: {}, split: null, sendFor: null, awChat: null, adSt: isAd ? 'all' : S.adSt }); },
            goCp: ['Move', 'Assign', 'Share'].includes(type), cust: type === 'Share' ? rest.replace(/^shared /, '').replace(/ with you$/, '') : type === 'Assign' ? rest.replace(/^assigned /, '').replace(/ to you$/, '') : who,
            open: (e) => { if (!['Move', 'Assign', 'Share'].includes(type)) return; e.stopPropagation(); const nm = type === 'Share' ? rest.replace(/^shared /, '').replace(/ with you$/, '') : type === 'Assign' ? rest.replace(/^assigned /, '').replace(/ to you$/, '') : who; const o = { ...rd, [id]: 1 }; set({ ntfRead: o, tab: 'assignment', pane: PANE_MODE.assignment, pick: 4, stage: 'op', cpSelName: nm, cpSel: null, awChat: null, sendFor: null, cpF: 'All', cpP: null, cpMine: false, cpT: 'This month' }); },
            toggle: () => { const o = { ...rd }; if (u) o[id] = 1; else delete o[id]; setRd(o); } }; }) })).filter(g => g.items.length);
        return { ntfP: !!S.ntfP, ntfPToggle: () => set(st => ({ ntfP: !st.ntfP })), ntfPClose: () => set({ ntfP: false }), ntfPBg: S.ntfP ? '#F5EBE3' : 'transparent', ntfPSub: unreadN ? unreadN + ' unread' : 'All caught up',
          ntfCats: CAT.map(([k, label]) => { const on = cat === k; const n = inTab.filter(x => inCat(x, k)).length; return { label, n: String(n), hasN: true, bg: on ? '#fff' : 'transparent', sh: on ? '0 1px 3px rgba(63,43,34,.14)' : 'none', fg: on ? '#3F2B22' : '#806B60', fw: on ? 700 : 600, nbg: on ? '#BD4A19' : (n ? '#E9DCD2' : 'transparent'), nfg: on ? '#fff' : (n ? '#6B574C' : '#B4A396'), pick: () => set({ ntfCat: k }) }; }),
          ntfHead: unreadN ? unreadN + ' unread · ' + NL.length + ' this week' : 'All caught up',
          ntfSelMode: selMode, ntfNoSel: !selMode, ntfSelOn: () => set({ ntfSel: true, ntfPick: {} }), ntfSelOff: () => set({ ntfSel: false, ntfPick: {} }),
          ...(() => { const ids = list.map(n => n[0]); const nP = ids.filter(x => pickd[x]).length; const all = ids.length > 0 && nP === ids.length;
            return { ntfSelN: nP ? nP + ' selected' : 'Select messages', ntfAllLabel: all ? 'Clear all' : 'Select all', ntfHasPick: nP > 0, ntfActBd: nP ? '#E2CFC1' : '#EFE5DC', ntfActFg: nP ? '#3F2B22' : '#C9B6A8', ntfDelFg: nP ? '#A3371A' : '#D8B7AC', ntfDelBd: nP ? '#F0C9BC' : '#F3E4DE', ntfActCur: nP ? 'pointer' : 'default', ntfActOp: nP ? 1 : .45,
              ntfSelAll: () => set({ ntfPick: all ? {} : Object.fromEntries(ids.map(x => [x, 1])) }),
              ntfReadSel: () => { if (!nP) return; const o = { ...rd }; ids.filter(x => pickd[x]).forEach(x => { o[x] = 1; }); set({ ntfRead: o, ntfPick: {}, ntfSel: false }); },
              ntfDelSel: () => { if (!nP) return; clearTimeout(R.tt); const d2 = { ...del }; ids.filter(x => pickd[x]).forEach(x => { d2[x] = 1; }); set({ ntfDel: d2, ntfPick: {}, ntfSel: false, toast: true, toastMsg: 'Deleted ' + nP + (nP === 1 ? ' notification' : ' notifications') }); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000); } }; })(),
          ntfGroups: groups, ntfEmpty: !list.length, ntfEmptyMsg: tabK === 'unread' ? 'No unread notifications' : 'No read notifications',
          ntfNoUnread: !unreadN, ntfMarkFg: unreadN ? '#BD4A19' : '#C9B6A8', ntfMarkCur: unreadN ? 'pointer' : 'default',
          ntfMarkAll: () => setRd(Object.fromEntries(N.map(n => [n[0], 1]))),
          ntfTabs: [['unread', 'Unread', unreadN], ['read', 'Read', 0]].map(([k, label, n]) => { const on = tabK === k; return { label, n: String(n), hasN: n > 0, bg: on ? '#fff' : 'transparent', sh: on ? '0 1px 3px rgba(63,43,34,.14)' : 'none', fw: on ? 700 : 600, fg: on ? '#3F2B22' : '#806B60', pick: () => set({ ntfTab: k }) }; }),
          ntfFOpen: !!S.ntfFOpen, ntfFToggle: () => set(st => ({ ntfFOpen: !st.ntfFOpen })), ntfFLabel: f === 'all' ? 'All types' : f, ntfFDot: f === 'all' ? '#806B60' : TY[f][0],
          ntfOpts: [['all', 'All types', '#806B60']].concat(Object.keys(TY).map(k => [k, k, TY[k][0]])).map(([k, label, dot]) => { const on = f === k; return { label, dot, n: String(inTab.filter(n => k === 'all' || n[2] === k).length), bg: on ? '#FFF1E6' : 'transparent', fg: on ? '#BD4A19' : '#3F2B22', pick: () => set({ ntfF: k, ntfFOpen: false }) }; }),
          ntfChips: [['all', 'All', '#fff']].concat(Object.keys(TY).map(k => [k, k, TY[k][0]])).map(([k, label, dot]) => { const on = f === k;
            return { label, n: String(inTab.filter(n => k === 'all' || n[2] === k).length), dot: on && k === 'all' ? '#fff' : dot, bg: on ? '#3F2B22' : '#fff', bd: on ? '#3F2B22' : '#EBDDD2', fg: on ? '#fff' : '#3F2B22', nFg: on ? '#E9DCD2' : '#806B60', pick: () => set({ ntfF: k }) }; }) }; })(),
      ...(() => { const on = S.clt || { 'Follow up visit': 1 };
        const T0 = [...(S.cltNew || []), ['Follow up visit', 'Approved', 'WhatsApp', "Hi {name}, this is HOUZS. Would you like to book a showroom visit this week? Reply here and we'll find a time."],
          ['October Fair reminder', 'In review', 'WhatsApp', 'Hi {name}, our October Fair ends this Sunday with up to 30% off mattresses. Want us to hold a slot for you?'],
          ['Still interested?', 'Draft', 'Messenger', "Hi {name}, just checking if you're still looking for furniture. We're happy to help."]];
        const ov = S.cltOv || {}; const T = T0.filter(([n]) => !(ov[n] || {}).deleted).map(([n, st2, ch, body]) => [n, (ov[n] || {}).status || st2, (ov[n] || {}).ch || ch, (ov[n] || {}).body || body]);
        const SC = { Approved: ['#E4F1EA', '#387557'], 'In review': ['#FDF1D8', '#8A5A12'], Draft: ['#F2ECE6', '#806B60'] };
        const DOT = { all: '#806B60', Approved: '#387557', 'In review': '#C08A2A', Draft: '#B9A89B' };
        const f = S.cltF || 'all'; const ed = S.cltEdit;
        const all = T.map(([name, status, ch, body]) => { const dname = (ov[name] || {}).dname || name; const ok = status === 'Approved'; const o = ok && !!on[name]; const editing = ed === name; const draft = editing ? (S.cltDraft ?? body) : body;
          return { name, status, channel: ch, stBg: SC[status][0], stFg: SC[status][1], chFg: ch === 'WhatsApp' ? '#387557' : '#2F6FB5', chBg: ch === 'WhatsApp' ? '#E4F1EA' : '#E4EDF8', bd: editing ? '#BD4A19' : '#EBDDD2', onLabel: o ? 'On' : 'Off', onFg: !ok ? '#A08E82' : o ? '#2E6B4E' : '#806B60',
            segs: body.split(/(\{[a-z_]+\})/).filter(Boolean).map(t => ({ t, tag: /^\{[a-z_]+\}$/.test(t), txt: !/^\{[a-z_]+\}$/.test(t) })),
            view: true, editing, draft, dsegs: String(draft).split(/(\{[a-z_]+\})/).filter(Boolean).map(t => ({ t, tag: /^\{[a-z_]+\}$/.test(t), txt: !/^\{[a-z_]+\}$/.test(t) })), edit: () => set({ cltEdit: name, cltDraft: body, cltDN: dname, cltDC: ch, cltIsNew: null, frmOpen: false, frmDraft: null, frmAdd: null }), cancel: () => set(st => ({ cltEdit: null, cltDraft: null, cltIsNew: null, cltNew: st.cltIsNew === name ? (st.cltNew || []).filter(x => x[0] !== name) : st.cltNew })),
            empty: !String(draft).trim(), subBg: String(draft).trim() ? '#BD4A19' : '#D9C6B8', subCur: String(draft).trim() ? 'pointer' : 'not-allowed',
            mode: S.cltIsNew === name ? 'New template' : '', hasMode: S.cltIsNew === name,
            dname, dn: editing ? (S.cltDN ?? dname) : dname, setDN: (e) => set({ cltDN: e.target.value }),
            chOpts: ['WhatsApp', 'Messenger'].map(c => { const sel = (editing ? (S.cltDC || ch) : ch) === c; return { label: c, bg: sel ? '#fff' : 'transparent', sh: sel ? '0 1px 3px rgba(63,43,34,.14)' : 'none', fw: sel ? 700 : 600, fg: sel ? '#3F2B22' : '#806B60', pick: () => set({ cltDC: c }) }; }),
            subHint: '', askDel: S.cltAsk === name, noAsk: S.cltAsk !== name,
            ask: (e) => { e.stopPropagation(); set({ cltAsk: name }); }, askNo: () => set({ cltAsk: null }),
            delNow: () => { clearTimeout(R.tt); set(st => { const cur = { ...(st.clt || on) }; delete cur[name]; return { cltAsk: null, cltEdit: st.cltEdit === name ? null : st.cltEdit, clt: cur, cltOv: { ...(st.cltOv || {}), [name]: { deleted: true } }, toast: true, toastMsg: 'Deleted · ' + dname }; }); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000); },
            del: () => set(st => { const cur = { ...(st.clt || on) }; delete cur[name]; return { cltEdit: null, cltDraft: null, cltIsNew: null, clt: cur, cltOv: { ...(st.cltOv || {}), [name]: { deleted: true } } }; }),
            saveDraft: () => set(st => { const cur = { ...(st.clt || on) }; delete cur[name]; return { cltEdit: null, cltDraft: null, cltIsNew: null, clt: cur, cltOv: { ...(st.cltOv || {}), [name]: { body: st.cltDraft ?? body, status: 'Draft', ch: st.cltDC || ch, dname: (st.cltDN || '').trim() || dname } } }; }),
            submit: () => { const c2 = S.cltDC || ch; clearTimeout(R.tt); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000);
              set(st => { const cur = { ...(st.clt || on) }; delete cur[name]; return { cltEdit: null, cltDraft: null, cltIsNew: null, clt: cur, toast: true, toastMsg: 'Sent to Meta for ' + c2 + ' review', cltOv: { ...(st.cltOv || {}), [name]: { body: st.cltDraft ?? body, status: 'In review', ch: c2, dname: (st.cltDN || '').trim() || dname } } }; }); },
            setDraft: (e) => set({ cltDraft: e.target.value }),
            vars: ['{name}', '{showroom}', '{salesperson}', ...(S.cltVars || [])].map(v => ({ label: v, add: () => { const el = R.cltTa && R.cltTa.current; const cur = S.cltDraft ?? body;
              const p0 = el ? el.selectionStart : cur.length, p1 = el ? el.selectionEnd : cur.length; const pre = cur.slice(0, p0), post = cur.slice(p1);
              const ins = (pre && !/\s$/.test(pre) ? ' ' : '') + v + (post && !/^[\s,.!?]/.test(post) ? ' ' : ''); const np = pre.length + ins.length;
              set({ cltDraft: pre + ins + post }, () => { if (el) { el.focus(); el.setSelectionRange(np, np); } }); } })),
            moreOpen: !!S.cltMore, toggleMore: () => set(st => ({ cltMore: !st.cltMore })),
            moreOpts: [['{visit_date}', 'Visit date'], ['{visit_time}', 'Visit time'], ['{ad}', 'Ad they came from'], ['{phone}', 'Customer phone']].filter(([v]) => !(S.cltVars || []).includes(v)).map(([v, d]) => ({ v, d, pick: () => set(st => ({ cltVars: [...(st.cltVars || []), v], cltMore: false })) })),
            moreNone: [['{visit_date}'], ['{visit_time}'], ['{ad}'], ['{phone}']].every(([v]) => (S.cltVars || []).includes(v)),
            saveHint: ch === 'WhatsApp' ? 'WhatsApp templates go back to In review after a change' : 'Saved straight away',
            save: () => set(st => { const nb = st.cltDraft ?? body; const changed = nb !== body; const cur = { ...(st.clt || on) }; const ns = changed && ch === 'WhatsApp' ? 'In review' : status; if (ns !== 'Approved') delete cur[name];
              return { cltEdit: null, cltDraft: null, cltIsNew: null, clt: cur, cltOv: { ...(st.cltOv || {}), [name]: { body: nb, status: ns } } }; }),
            track: o ? '#2E6B4E' : ok ? '#DCCBBF' : '#EFE6DF', knob: o ? 19 : 3, locked: !ok, cur: ok ? 'pointer' : 'not-allowed', tip: ok ? '' : 'Only approved templates can be switched on',
            toggle: () => set(st => { const cur = { ...(st.clt || on) }; if (cur[name]) delete cur[name]; else cur[name] = 1; return { clt: cur }; }) }; });
        const cards = all.filter(c => f === 'all' || c.status === f); const cE = all.find(c => c.editing);
        if (!R.cltTa) R.cltTa = { current: null };
        const F0 = [{ id: 's1', title: 'Customer', fields: [{ id: 'f1', label: 'Name', type: 'Text', req: 1, locked: 1, ph: '' }, { id: 'f2', label: 'Phone', type: 'Phone', req: 0, locked: 1, ph: '' }] },
          { id: 's2', title: 'Property', fields: [{ id: 'f3', label: 'Property type', type: 'Choice', req: 0, opts: ['Condo', 'Landed'] }, { id: 'f4', label: 'Unit size', type: 'Choice', req: 0, opts: ['3R 2R', '2R 1R', '2R 2R', '3R 3R', '4R 2R', '4R 3R', '4R 4R'] },
            { id: 'f5', label: 'Unit location', type: 'Text', req: 0, ph: 'e.g. Mont Kiara / Cheras' }, { id: 'f6', label: 'Requirement', type: 'Long text', req: 0, ph: 'e.g. Full renovation + kitchen' }, { id: 'f7', label: 'Budget', type: 'Number', req: 0, ph: 'RM' }] }];
        const forms = S.frmList || [{ id: 'ci', name: 'Customer info', secs: F0, base: 1 }];
        const curF = forms.find(x => x.id === S.frmCur) || forms[0];
        const fs = S.frmDraft || (S.frmIsNew ? [] : curF.secs); const fOn = !!S.frmOpen && opItem[0] === 'Forms';
        const sumOf = (ss) => { const a = ss.reduce((n, x) => n + x.fields.length, 0), r = ss.reduce((n, x) => n + x.fields.filter(f => f.req).length, 0); return a + (a === 1 ? ' field · ' : ' fields · ') + r + ' required · ' + ss.length + (ss.length === 1 ? ' section' : ' sections'); };
        const upd = (fn) => set(st => { const d = JSON.parse(JSON.stringify(st.frmDraft || curF.secs)); fn(d); return { frmDraft: d }; });
        const isBase = !S.frmIsNew && !!curF.base; const fName = S.frmName ?? curF.name;
        const oi = S.frmOptIn || {}; const exp = S.frmExp;
        const TYPES = ['Text', 'Long text', 'Choice', 'Number', 'Phone', 'Date'];
        const toastF = (m) => { clearTimeout(R.tt); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000); return { toast: true, toastMsg: m }; };
        const frm = { isFrmOp: opItem[0] === 'Forms', frmOpen: fOn,
          frmCards: forms.map(x => ({ name: x.name, sum: sumOf(x.secs), isBase: !!x.base, notBase: !x.base, open: () => set({ stage: 'op', frmOpen: true, frmCur: x.id, frmIsNew: false, frmName: null, cltEdit: null, cltDraft: null, frmDraft: null, frmExp: null, frmOptIn: {} }) })),
          frmNew: () => set({ stage: 'op', frmOpen: true, frmCur: 'n' + Date.now(), frmIsNew: true, frmName: 'New form', cltEdit: null, cltDraft: null, frmDraft: [{ id: 's' + Date.now(), title: 'Section 1', fields: [] }], frmExp: null, frmOptIn: {} }),
          frmTitle: fName, frmIsBase: isBase, frmNotBase: !isBase, frmCanRm: !isBase && !S.frmIsNew,
          setFrmName: (e) => set({ frmName: e.target.value }),
          frmSub: isBase ? '' : (S.frmIsNew ? 'New form · type a name above' : 'Custom form on the sales app'),
          frmClose: () => set({ frmOpen: false, frmDraft: null, frmExp: null, frmIsNew: false, frmName: null }),
          frmRm: () => set(st => ({ frmList: forms.filter(x => x.id !== curF.id), frmOpen: false, frmDraft: null, frmName: null, ...toastF('Form "' + curF.name + '" deleted') })),
          frmSave: () => { const nm = (fName || '').trim() || 'Untitled form'; const list = S.frmIsNew ? [...forms, { id: S.frmCur, name: nm, secs: fs }] : forms.map(x => x.id === curF.id ? { ...x, name: x.base ? x.name : nm, secs: fs } : x);
            set({ frmList: list, frmDraft: null, frmExp: null, frmOpen: false, frmIsNew: false, frmName: null, ...toastF((S.frmIsNew ? 'Form "' + nm + '" added to' : 'Form "' + (curF.base ? curF.name : nm) + '" updated in') + ' the sales app') }); },
          frmAddSec: () => { const id = 's' + Date.now(); upd(d => d.push({ id, title: 'New section', fields: [] })); },
          frmSecs: fs.map((sec, si) => ({ title: sec.title, n: sec.fields.length + (sec.fields.length === 1 ? ' field' : ' fields'), canDel: !sec.fields.some(f => f.locked), noDel: sec.fields.some(f => f.locked),
            setTitle: (e) => { const v = e.target.value; upd(d => { d[si].title = v; }); },
            del: () => upd(d => { d.splice(si, 1); }),
            empty: !sec.fields.length,
            addField: () => { const id = 'f' + Date.now(); upd(d => { d[si].fields.push({ id, label: '', type: 'Text', req: 0, ph: '', isNew: 1 }); }); set({ frmExp: id }); },
            fields: sec.fields.map((f, fi) => { const open = exp === f.id; const isC = f.type === 'Choice'; const last = fi === sec.fields.length - 1;
              const addOpt = () => { const v = (oi[f.id] || '').trim(); if (!v || (f.opts || []).includes(v)) return; upd(d => { const x = d[si].fields[fi]; x.opts = [...(x.opts || []), v]; }); set(st => ({ frmOptIn: { ...(st.frmOptIn || {}), [f.id]: '' } })); };
              return { label: f.label || 'Untitled field', star: f.req ? ' *' : '', summary: f.type + (isC ? ' · ' + (f.opts || []).length + ' options' : '') + (f.locked ? ' · Always on' : ''), isNew: !!f.isNew, open, closed: !open,
                bt: fi ? '1px solid #F1E7DF' : '0', bg: open ? '#FFFAF6' : '#fff', chev: open ? 'rotate(180deg)' : 'none',
                toggle: () => set({ frmExp: open ? null : f.id }),
                up: () => upd(d => { const L = d[si].fields; if (fi > 0) { [L[fi - 1], L[fi]] = [L[fi], L[fi - 1]]; } else if (si > 0) { d[si - 1].fields.push(L.splice(fi, 1)[0]); } }),
                down: () => upd(d => { const L = d[si].fields; if (!last) { [L[fi + 1], L[fi]] = [L[fi], L[fi + 1]]; } else if (si < d.length - 1) { d[si + 1].fields.unshift(L.splice(fi, 1)[0]); } }),
                upFg: fi === 0 && si === 0 ? '#E2D5CB' : '#806B60', dnFg: last && si === fs.length - 1 ? '#E2D5CB' : '#806B60',
                lab: f.label, setLabel: (e) => { const v = e.target.value; upd(d => { d[si].fields[fi].label = v; }); },
                ph: f.ph || '', setPh: (e) => { const v = e.target.value; upd(d => { d[si].fields[fi].ph = v; }); }, notC: !isC,
                types: TYPES.map(t => { const on = f.type === t; return { label: t, bg: on ? '#3F2B22' : '#fff', fg: on ? '#fff' : '#3F2B22', bd: on ? '#3F2B22' : '#E2CFC1', pick: () => upd(d => { const x = d[si].fields[fi]; x.type = t; if (t === 'Choice' && !x.opts) x.opts = []; }) }; }),
                typeLocked: !!f.locked, typeFree: !f.locked,
                isC, opts: (f.opts || []).map((t, k) => ({ t, rm: () => upd(d => { d[si].fields[fi].opts.splice(k, 1); }) })),
                optIn: oi[f.id] || '', setOptIn: (e) => { const v = e.target.value; set(st => ({ frmOptIn: { ...(st.frmOptIn || {}), [f.id]: v } })); }, addOpt, optKey: (e) => { if (e.key === 'Enter') { e.preventDefault(); addOpt(); } },
                track: f.req ? '#2E6B4E' : '#DCCBBF', knob: f.req ? 19 : 3, toggleReq: () => upd(d => { const x = d[si].fields[fi]; x.req = x.req ? 0 : 1; }),
                reqLocked: f.locked && f.label === 'Name', reqFree: !(f.locked && f.label === 'Name'),
                del: () => upd(d => { d[si].fields.splice(fi, 1); }), canDel: !f.locked, noDel: !!f.locked };
            }) })) };
        return { ...frm, cltOpen: !S.frmOpen && !!cE && opItem[0] === 'Cold lead templates' && !(sheetMode && stage === 'menu'), cltE: cE || {}, cltTaRef: R.cltTa,
          cltNewT: () => set(st => { const nw = st.cltNew || []; const id = 'Untitled template ' + (nw.length + 1); return { frmOpen: false, frmDraft: null, frmAdd: null, cltNew: [[id, 'Draft', 'WhatsApp', ''], ...nw], cltF: 'all', cltEdit: id, cltDraft: '', cltDN: '', cltDC: 'WhatsApp', cltIsNew: id }; }),
          cltCards: cards, cltEmpty: !cards.length, cltFOpen: !!S.cltFOpen, cltToggleF: () => set(st => ({ cltFOpen: !st.cltFOpen })),
          cltFLabel: f === 'all' ? 'All statuses' : f, cltFDot: DOT[f],
          cltFOpts: [['all', 'All statuses'], ['Approved', 'Approved'], ['In review', 'In review'], ['Draft', 'Draft']].map(([k, label]) => ({ label, dot: DOT[k], n: String(T.filter(t => k === 'all' || t[1] === k).length), bg: k === f ? '#FFF1E6' : 'transparent', fg: k === f ? '#BD4A19' : '#3F2B22', pick: () => set({ cltF: k, cltFOpen: false }) })) }; })(),
      ...(() => { const dirty = !!S.mwtDirty; return { mwtDirty: dirty, mwtClean: !dirty, mwtBtnBg: dirty ? '#BD4A19' : '#D9C6B8', mwtBtnCur: dirty ? 'pointer' : 'default', mwtSavedMsg: !dirty && !!S.mwtSaved,
        mwtSave: () => set({ mwtDirty: false, mwtSaved: true }) }; })(),
      mwtTeams: (() => { const on = S.mwt || { 'Amir Hamzah': 1, 'Daniel Tan': 1, 'Joanne Teh': 1, 'Vincent Lim': 1 };
        const G = [['Team Kelvin', '#BD4A19', [['Kelvin Lee', 'Team Leader'], ['Farah Aziz', 'Team Assistant'], ['Amir Hamzah', 'Revenue Specialist'], ['Daniel Tan', 'Revenue Specialist'], ['Daniel Ong', 'Revenue Specialist']]],
          ['Team Priya', '#2F6FB5', [['Priya Nair', 'Team Leader'], ['Hafiz Rahman', 'Team Assistant'], ['Joanne Teh', 'Revenue Specialist'], ['Lina Ho', 'Revenue Specialist']]],
          ['Team Ryan', '#8E4B6E', [['Ryan Chew', 'Team Leader'], ['Vincent Lim', 'Revenue Specialist'], ['Mei Ling', 'Revenue Specialist']]]];
        return G.map(([name, color, ppl]) => ({ name, color, count: ppl.filter(p => on[p[0]]).length + ' of ' + ppl.length + ' full time',
          people: ppl.map(([n, role]) => ({ name: n, role, wt: on[n] ? 'Full time' : 'Part time', wtBg: on[n] ? '#E4F1EA' : '#F5EBE3', wtFg: on[n] ? '#2E6B4E' : '#806B60', ini: n.split(' ').map(w => w[0]).join(''), track: on[n] ? '#2E6B4E' : '#DCCBBF', knob: on[n] ? 19 : 3,
            toggle: () => set(st => { const cur = { ...(st.mwt || on) }; if (cur[n]) delete cur[n]; else cur[n] = 1; return { mwt: cur, mwtDirty: true, mwtSaved: false }; }) })) })); })(),
      ...(() => {
        const TT = [['Team Kelvin', '#BD4A19', '#FFF0E4'], ['Team Priya', '#2F6FB5', '#E4EDF8'], ['Team Ryan', '#8E4B6E', '#F3E8EF']];
        const ft = S.ft || {};
        const fk = S.ftKind || {};
        const dayPills = (arr, color, tint, edit, team, person) => DAYS.map((l, i) => ({ l, bg: arr[i] ? color : (edit ? '#F5EBE3' : '#F7F3EF'), fg: arr[i] ? '#fff' : '#A08E82',
          toggle: edit ? () => set(st => { const d = { ...(st.ftDraft || {}) }; const days = { ...(d.days || {}) }; const a = [...(days[person] || [0,0,0,0,0,0,0])]; a[i] = a[i] ? 0 : 1; days[person] = a; return { ftDraft: { ...d, days } }; }) : () => {} }));
        const cards = TT.map(([name, color, tint]) => { const v = ft[name]; const k = fk[name]; const sel = S.ftEdit === name;
          return { name, color, state: v && v.on ? 'On' : 'Off', stBg: v && v.on ? '#E8F3ED' : '#F2F0EB', stFg: v && v.on ? '#387557' : '#6B645A',
            mode: v ? (v.on ? '' : 'Off · follows Ads to teams') : 'Off · follows Ads to teams',
            cta: v ? 'Edit days' : 'Set up', noTag: !(k === 'copied' || k === 'adjusted'), bd: sel ? '#BD4A19' : '#EBDDD2', ring: sel ? '0 0 0 3px #FFF0E4' : 'none',
            tag: k === 'source' ? null : k === 'copied' ? 'Same as template' : k === 'adjusted' ? 'Adjusted for this team' : null,
            tagBg: k === 'adjusted' ? '#FFF0CC' : k === 'source' ? '#FFF0E4' : '#F5EBE3', tagFg: k === 'adjusted' ? '#A46312' : k === 'source' ? '#BD4A19' : '#6B574C',
            people: FT_PEOPLE[name].map(pn => ({ name: pn, days: dayPills(v && v.on && v.days[pn] ? v.days[pn] : [0,0,0,0,0,0,0], color, tint, false) })),
            open: () => { const cur = ft[name]; const days = {}; FT_PEOPLE[name].forEach(pn => { days[pn] = cur && cur.days[pn] ? [...cur.days[pn]] : [1,1,1,1,1,0,0]; }); set({ ftEdit: name, stage: 'op', ftDraft: { on: cur ? cur.on : true, days } }); } }; });
        const en = S.ftEdit; const dr = S.ftDraft || { on: true, days: {} };
        const ftOpen = sheetMode && stage !== 'menu' && opItem[0] === 'Full time lead allocation' && !!en;
        const tm2 = TT.find(t => t[0] === en) || TT[0];
        const isFull = (pn) => (dr.days[pn] || []).filter(Boolean).length === 7;
        const setDays = (names, val) => set(st => { const d = { ...(st.ftDraft || {}) }; const days = { ...(d.days || {}) }; names.forEach(pn => { days[pn] = Array(7).fill(val ? 1 : 0); }); return { ftDraft: { ...d, days } }; });
        const people = en ? FT_PEOPLE[en].map(pn => ({ name: pn, days: dayPills(dr.days[pn] || [0,0,0,0,0,0,0], tm2[1], tm2[2], true, en, pn),
          allLabel: isFull(pn) ? 'Clear all days' : 'Every day', all: () => setDays([pn], !isFull(pn)) })) : [];
        const allFull = en ? FT_PEOPLE[en].every(isFull) : false;
        const summary = DAY_NAMES.map((day, i) => { const who = en ? FT_PEOPLE[en].filter(pn => (dr.days[pn] || [])[i]) : []; return { day, who: who.length ? who.join(', ') : 'No one · follows Ads to teams', fg: who.length ? '#3F2B22' : '#A08E82' }; });
        const finish = (msg) => { clearTimeout(R.tt); R.tt = setTimeout(() => set({ toast: false, toastMsg: null }), 3000); return { toast: true, toastMsg: msg, ftEdit: null }; };
        return { ftCards: cards, ftOpen, ftOn: dr.on, ftOff: !dr.on,
          ftE: { name: en || '', color: tm2[1], people, summary },
          ftAllLabel: allFull ? 'Clear all' : 'Tick every day', ftAllToggle: () => setDays(en ? FT_PEOPLE[en] : [], !allFull),
          ftModes: [[false, 'Off'], [true, 'On']].map(([v, label]) => ({ label, bg: v ? '#387557' : '#6B645A', on: v === dr.on, off: v !== dr.on, pick: () => set(st => ({ ftDraft: { ...(st.ftDraft || {}), on: v } })) })),
          closeFt: () => set({ ftEdit: null }),
          ftSave: () => set(st => ({ ft: { ...(st.ft || {}), [en]: { on: dr.on, days: dr.days } }, ftKind: { ...(st.ftKind || {}), [en]: (st.ftKind || {})[en] === 'copied' ? 'adjusted' : (st.ftKind || {})[en] }, ...finish('Saved · ' + en) })),
          ftApplyAll: () => { const pattern = (dr.days[FT_PEOPLE[en][0]] || [1,1,1,1,1,0,0]); const nft = {}, nk = {};
            TT.forEach(([t]) => { const days = {}; FT_PEOPLE[t].forEach(pn => { days[pn] = t === en ? dr.days[pn] : [...pattern]; }); nft[t] = { on: dr.on, days }; nk[t] = t === en ? 'source' : 'copied'; });
            set({ ft: nft, ftKind: nk, ...finish('Applied to all 3 teams') }); } };
      })(),
      ...(() => {
        const cur = S.adSt || 'Running';
        const n = (k) => k === 'all' ? Object.keys(AD_STATUS).length : Object.values(AD_STATUS).filter(v => v === k).length;
        return { stOpen: !!S.stOpen, toggleSt: () => set(st => ({ stOpen: !st.stOpen })),
          stCur: { label: ST_META[cur][0], color: ST_META[cur][1], tint: ST_META[cur][3], ink: ST_META[cur][4], n: n(cur) },
          stOpts: ['Running', 'Paused', 'Pending', 'all'].map(k => ({ label: ST_META[k][0], color: ST_META[k][1], hint: ST_META[k][2], n: n(k), tint: ST_META[k][3], ink: ST_META[k][4], bg: k === cur ? ST_META[k][3] : 'transparent', fg: ST_META[k][4], pick: () => set({ adSt: k, stOpen: false }) })) };
      })(),
      adCards: (OPS['Ads to teams'] || []).map((r, i) => [r, i]).filter(([r]) => (S.adSt || 'Running') === 'all' || AD_STATUS[r[0]] === (S.adSt || 'Running')).map(([[name, meta], i]) => {
        const kind = (S.adKind || {})[name];
        const parts = meta.split(' · '); const wa = parts[0] === 'WhatsApp';
        const sv = (S.savedSplit || {})[name];
        const TC = { 'Team Kelvin': '#BD4A19', 'Team Priya': '#2F6FB5', 'Team Ryan': '#8E4B6E' };
        const segs = sv ? sv.map(([n, p, how, detail]) => ({ color: TC[n], pct: p, label: n.replace('Team ', '') + ' ' + p + '%' + (how ? ' · ' + how : ''), detail: detail || null })) : [];
        const sel = S.ad === i;
        return { name, channel: parts[0], leads: parts[1].split(' ')[0], chBg: wa ? '#E8F3ED' : '#E4EDF8', chFg: wa ? '#387557' : '#2F6FB5',
          segs, set: !!sv, unset: !sv, status: AD_STATUS[name], stColor: ST_META[AD_STATUS[name]][1], stTint: ST_META[AD_STATUS[name]][3],
          tag: kind === 'source' ? null : kind === 'copied' ? 'Same as template' : kind === 'adjusted' ? 'Adjusted for this ad' : null, noTag: !(kind === 'copied' || kind === 'adjusted'),
          tagBg: kind === 'adjusted' ? '#FFF0CC' : kind === 'source' ? '#FFF0E4' : '#F5EBE3', tagFg: kind === 'adjusted' ? '#A46312' : kind === 'source' ? '#BD4A19' : '#6B574C', mode: sv ? (S.savedMode || {})[name] : 'Not set · evenly by default', cta: sv ? 'Edit split' : 'Set up',
          bd: sel ? '#BD4A19' : '#EBDDD2', ring: sel ? '0 0 0 3px #FFF0E4' : 'none',
          open: () => { const se = (S.savedEdit || {})[name]; set(se ? { ad: i, stage: 'op', adMode: se.adMode, tm: { ...se.tm }, mv: { ...se.mv }, split: se.split ? { ...se.split } : null } : { ad: i, stage: 'op', adMode: 'team', tm: {}, mv: {}, split: null }); } };
      }),
      sheetMode, sheetOpen: sheetMode && stage === 'menu', sheetW: W === 1440 ? 520 : 440,
      sheetTitle: sc[0], sheetSub: sc[1], sheetRows,
      opRows, chats, filters,
      showWho: !mine, whoOpen: !!S.whoOpen,
      toggleWho: () => set(st => ({ whoOpen: !st.whoOpen })),
      whoLabel: !whoSel.length ? 'Everyone' : 'People',
      whoAvs: !whoSel.length ? [{ ini: 'ALL', bg: '#F5EBE3', fg: '#806B60' }] : [{ ini: String(whoSel.length), bg: '#BD4A19', fg: '#fff' }],
      whoChips: whoSel.map(w => { const team = w.startsWith('team:'); const tc = { 'Team Kelvin': ['#BD4A19', '#FFF0E4'], 'Team Priya': ['#2F6FB5', '#E4EDF8'], 'Team Ryan': ['#8E4B6E', '#F3E8EF'] };
        const t = team ? tc[w.slice(5)] : null;
        return { label: team ? w.slice(5) : w, ini: team ? w.slice(10, 11) : w.split(' ').map(x => x[0]).join('').slice(0, 2),
          bg: team ? t[0] : '#FFF0E4', fg: team ? '#fff' : '#BD4A19', tint: team ? t[1] : '#F7F0EA', ink: team ? t[0] : '#3F2B22',
          remove: () => set(st => ({ whoSel: (st.whoSel || []).filter(x => x !== w) })) }; }),
      whoCount: CHATS.filter(match).length + ' chats',
      whoClear: () => set({ whoSel: [] }),
      whoOpts: (() => {
        const opt = (label, val, n, grp, av) => { const sel = val ? whoSel.includes(val) : !whoSel.length; return { avBg: av ? av[0] : '#F5EBE3', avFg: av ? av[1] : '#4E2F20', head: false, sel, unsel: !sel, label, n, hasN: n > 0, noN: n === 0,
          isGroup: !!grp, isPerson: !grp, isAll: !!grp && !val, isTeam: !!grp && !!val, letter: val && val.startsWith('team:') ? val.slice(10, 11) : '', tint: grp ? grp[0] : '', color: grp ? grp[1] : '', ini: label.split(' ').map(w => w[0]).join('').slice(0, 2),
          pick: () => set(st => { const cur = st.whoSel || []; if (!val) return { whoSel: [] }; return { whoSel: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] }; }) }; };
        const out = [opt('Everyone', null, CHATS.length, ['#F5EBE3', '#806B60']), opt('Principal', 'Principal', CHATS.filter(c => c[5] === 'Principal').length, null, ['#FFF0E4', '#BD4A19'])];
        [['Team Kelvin', '#BD4A19', '#FFF0E4'], ['Team Priya', '#2F6FB5', '#E4EDF8'], ['Team Ryan', '#8E4B6E', '#F3E8EF']].forEach(([t, color, tint]) => {
          out.push({ head: true, sel: false, unsel: false, label: t.toUpperCase(), color });
          out.push(opt('Whole team', 'team:' + t, CHATS.filter(c => teamOf(c[5]) === t || c[5] === t + ' · to assign').length, [tint, color]));
          TEAMS[t].forEach(([name], i) => out.push(opt(name, name, CHATS.filter(c => c[5] === name).length, null, i === 0 ? ['#BD4A19', '#FFFFFF'] : ['#FFF0E4', '#BD4A19'])));
        });
        return out;
      })(), kList: listTab, kInsight: tab === 'insight', kAdsPerf: tab === 'adsperf',
      goAdsPerf: () => set({ tab: 'adsperf', pane: 'closed', toast: false }), kCal: tab === 'calendar',
      kpis: [['Appt rate · October', '40%', '10 booked of 25 leads'], ['Leads', '25', 'October'], ['Show-up', '50%', 'Of visits due'], ['Reply 24 h', '38%', 'First reply within 24 h']].map(([label, value, sub2]) => ({ label, value, sub: sub2 })),
      teams: [['Revenue Director', 'Peter', '0', '—', '—', '—', '—'], ['Team Kelvin', 'Senior TL Marcus Tan', '15', '40%', '50%', '13%', '7%'], ['Team Priya', 'Senior TL Marcus Tan', '5', '60%', '50%', '0%', '20%'], ['Team Ryan', 'Senior TL Marcus Tan', '1', '100%', '—', '0%', '0%']].map(([name, lead, leads, appt, show, won, lost], i) => ({ name, lead, leads, appt, show, won, lost,
        dot: ['#387557', '#BD4A19', '#2F6FB5', '#8E4B6E'][i],
        open: () => set({ pane: 'overlay', kind: 'team', team: name, person: null }) })),
      teamName: S.team || 'Team Kelvin',
      teamPeople: !S.person, personChats: !!S.person,
      people: (TEAMS[S.team || 'Team Kelvin'] || []).map(([name, leads, appt, show]) => ({ name, leads, appt, show,
        ini: name.split(' ').map(w => w[0]).join('').slice(0, 2),
        chats: (() => { const n = CHATS.filter(c => c[5] === name).length; return n + (n === 1 ? ' lead' : ' leads'); })(),
        open: () => set({ person: name }) })),
      pChats: CHATS.filter(c => c[5] === S.person).map(c => { const key = c[6].startsWith('Overdue') ? 'Overdue' : c[6]; return { ini: c[0], name: c[1], time: c[2], ad: c[3], msg: c[4], status: c[6], stBg: ST[key][0], stFg: ST[key][1],
        open: () => set({ kind: 'chat', chat: CHATS.indexOf(c), fromTeam: true }) }; }),
      chatFromTeam: kind === 'chat' && pane === 'overlay' && !!S.fromTeam && !!S.person,
      backPersonLabel: (S.person || '') + ' · their leads',
      backToPerson: () => set({ kind: 'team', fromTeam: false }),
      menuOpen: !!S.menu, menuBtnBg: S.menu ? '#FFF1E6' : '#fff',
      toggleMenu: () => set(st => ({ menu: !st.menu })),
      closeMenu: () => set({ menu: false }),
      showAssign: !mine, showMove: mine,
      openAssign: () => set({ menu: false, kind: 'assign' }),
      backToChat: () => set({ kind: 'chat' }),
      assignGroups: [['Team Kelvin', '#BD4A19'], ['Team Priya', '#2F6FB5'], ['Team Ryan', '#8E4B6E']].map(([label, color]) => ({ label: label.toUpperCase(), color,
        people: (TEAMS[label] || []).map(([name]) => ({ name, ini: name.split(' ').map(w => w[0]).join('').slice(0, 2),
          sub: label,
          pick: () => { clearTimeout(R.tt); set({ kind: 'chat', toast: true, toastName: name }); R.tt = setTimeout(() => set({ toast: false }), 3000); } })) })),
      canUndo: !!S.undoKey,
      undoSend: () => { clearTimeout(R.tt); set(st => { const sent = { ...(st.sent || {}) }; delete sent[st.undoKey]; return { sent, toast: false, toastMsg: null, undoKey: null }; }); },
      toastText: S.toastMsg || 'Sent ' + CHATS[S.chat ?? 0][1] + ' to ' + (S.toastName || 'Joanne Teh'),
      pNoChats: !!S.person && !CHATS.some(c => c[5] === S.person),
      backToTeam: () => set({ person: null }),
      ...(() => {
        const view = S.calView || 'upcoming';
        const team = S.calTeam || 'all';
        let last = '';
        const vs = VISITS.map((v, i) => { if (v[0]) last = v[0]; const dayStr = last.replace('Today · ', ''); const num = parseInt(dayStr.split(' ')[1], 10); const rep2 = v[3].split(' · ')[0]; const tm = REP_TEAM[rep2] || 'Team Kelvin';
          const st2 = ST[v[4]] || ST.Booked;
          return { i, num, dayStr, time: v[1], short: v[1].replace(':00', '').replace(' ', ''), name: v[2], who: v[3], rep: rep2, team: tm, status: v[4], stBg: st2[0], stFg: st2[1], color: TEAM_C[tm][0], tint: TEAM_C[tm][1],
            open: () => set({ pane: 'overlay', kind: 'info', visit: i, infoName: null }) }; })
          .filter(v => team === 'all' || v.team === team)
          .filter(v => (S.calShowroom || 'all') === 'all' || v.who.includes(S.calShowroom))
          .filter(v => !(S.calWho || []).length || (S.calWho || []).includes(v.rep))
          .filter(v => { const r = S.calRange || [1, 31]; return v.num >= r[0] && v.num <= r[1]; });
        const TODAY = 12;
        const cells = [];
        [28, 29, 30].forEach(n => cells.push({ num: n, muted: true }));
        for (let n = 1; n <= 31; n++) cells.push({ num: n });
        cells.push({ num: 1, muted: true });
        const monthCells = cells.map(c => ({ num: c.num, bg: c.muted ? '#FAF7F4' : '#fff', numBg: !c.muted && c.num === TODAY ? '#BD4A19' : 'transparent', numFg: c.muted ? '#C9B8AC' : (c.num === TODAY ? '#fff' : '#3F2B22'), visits: c.muted ? [] : vs.filter(v => v.num === c.num) }));
        const weekCols = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, k) => { const n = 12 + k; return { dow: d, num: n, fg: n === TODAY ? '#BD4A19' : '#3F2B22', bd: n === TODAY ? '#BD4A19' : '#EBDDD2', visits: vs.filter(v => v.num === n) }; });
        const daySlots = ['11:00 am', '1:00 pm', '3:00 pm', '5:00 pm', '7:00 pm'].map(t => { const list = vs.filter(v => v.num === TODAY && v.time === t); return { time: t, visits: list, free: !list.length }; });
        const upcoming = vs.filter(v => view === 'today' ? v.num === TODAY : v.num >= TODAY);
        const days = [...new Set(upcoming.map(v => v.num))];
        const upDays = days.map(n => { const v0 = upcoming.find(v => v.num === n); return { label: (n === TODAY ? 'Today · ' : '') + v0.dayStr, fg: n === TODAY ? '#BD4A19' : '#806B60', visits: upcoming.filter(v => v.num === n) }; });
        const teamsList = [['all', 'All teams', null], ['Team Kelvin', 'Team Kelvin', '#BD4A19'], ['Team Priya', 'Team Priya', '#2F6FB5'], ['Team Ryan', 'Team Ryan', '#8E4B6E']];
        const showed = vs.filter(v => v.status === 'Showed up').length; const due = vs.filter(v => v.num < TODAY).length;
        return {
          ...(() => { const r = S.calRange || [1, 31]; const fmt = (n) => n + ' Oct'; const iso = (n) => '2026-10-' + String(n).padStart(2, '0');
            const P = [['This month', [1, 31], '1 – 31 Oct'], ['This week', [12, 18], '12 – 18 Oct'], ['Today', [12, 12], 'Mon 12 Oct'], ['Next 7 days', [12, 18], '12 – 18 Oct'], ['Last week', [5, 11], '5 – 11 Oct']];
            const same = (a2) => a2[0] === r[0] && a2[1] === r[1];
            return { rangeLabel: r[0] === r[1] ? fmt(r[0]) : fmt(r[0]) + ' – ' + fmt(r[1]), rangeOpen: !!S.rangeOpen,
              toggleRange: () => set(st => ({ rangeOpen: !st.rangeOpen })),
              rangeOpts: P.map(([label, rr, hint]) => ({ label, hint, bg: same(rr) ? '#FFF1E6' : 'transparent', fg: same(rr) ? '#BD4A19' : '#3F2B22', pick: () => set({ calRange: rr, rangeOpen: false }) })),
              rangeFrom: iso(r[0]), rangeTo: iso(r[1]),
              setFrom: (e) => { const n = parseInt(e.target.value.slice(8), 10) || 1; set({ calRange: [n, Math.max(n, r[1])] }); },
              setTo: (e) => { const n = parseInt(e.target.value.slice(8), 10) || 31; set({ calRange: [Math.min(r[0], n), n] }); } }; })(),
          ...(() => { const sel = S.calWho || [];
            const groups = [['Team Kelvin', '#BD4A19', '#FFF0E4', ['Principal', ...AD_MEMBERS['Team Kelvin'].map(x => x[0])]], ['Team Priya', '#2F6FB5', '#E4EDF8', AD_MEMBERS['Team Priya'].map(x => x[0])], ['Team Ryan', '#8E4B6E', '#F3E8EF', AD_MEMBERS['Team Ryan'].map(x => x[0])]];
            const opt = (label, val, av) => { const on = val ? sel.includes(val) : !sel.length; return { head: false, sel: on, unsel: !on, label, ini: val ? label.split(' ').map(w => w[0]).join('').slice(0, 2) : 'ALL', avBg: av[0], avFg: av[1],
              pick: () => set(st => { const cur = st.calWho || []; if (!val) return { calWho: [] }; return { calWho: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] }; }) }; };
            const out = [opt('Everyone', null, ['#F5EBE3', '#806B60'])];
            groups.forEach(([g, color, tint, names]) => { out.push({ head: true, sel: false, unsel: false, label: g.toUpperCase(), color }); names.forEach(n => out.push(opt(n, n, [tint, color]))); });
            return { calWhoOpts: out, calWhoOpen: !!S.calWhoOpen, toggleCalWho: () => set(st => ({ calWhoOpen: !st.calWhoOpen })), calWhoClear: () => set({ calWho: [] }),
              calWhoLabel: !sel.length ? 'Everyone' : sel.length === 1 ? sel[0] : sel[0] + ' +' + (sel.length - 1) }; })(),
          calShowroom: S.calShowroom || 'all',
          pickShowroom: (e) => set({ calShowroom: e.target.value }), pickRep: (e) => set({ calRep: e.target.value }),
          showroomOpts: [['all', 'All showrooms'], ['Kuala Lumpur Showroom', 'Kuala Lumpur Showroom'], ['Penang Showroom', 'Penang Showroom']].map(([v, label]) => ({ v, label })),
          repOpts: [['all', 'Everyone'], ...[...new Set(VISITS.map(v => v[3].split(' · ')[0]))].map(n => [n, n])].map(([v, label]) => ({ v, label })),
          calTeams: teamsList.map(([k, label, dot]) => ({ label, dot, bg: k === team ? '#3F2B22' : '#fff', fg: k === team ? '#fff' : '#3F2B22', bd: k === team ? '#3F2B22' : '#EBDDD2', pick: () => set({ calTeam: k }) })),
          calViews: [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['upcoming', 'Upcoming']].map(([k, label]) => ({ label, on: k === view, off: k !== view, pick: () => set({ calView: k, calRange: k === 'month' ? [1, 31] : k === 'week' ? [12, 18] : k === 'day' ? [12, 12] : [12, 31] }) })),
          goToday: () => set({ calView: 'today', calRange: [12, 12] }), todayN: vs.filter(v => v.num === TODAY).length,
          todayBg: view === 'today' ? '#FFF1E6' : '#fff', todayBd: view === 'today' ? '#BD4A19' : '#E2CFC1',
          calMonth: view === 'month', calWeek: view === 'week', calDay: view === 'day', calUp: view === 'upcoming' || view === 'today',
          calTitle: view === 'month' ? 'October 2026' : view === 'week' ? '12 – 18 Oct' : view === 'day' ? 'Today · Mon 12 Oct' : view === 'today' ? "Today's appt" : 'Upcoming',
          calSub: vs.length + ' visits · ' + upcoming.length + ' upcoming',
          calStats: [[team === 'all' ? '25' : '—', 'Leads', '#fff'], [String(upcoming.length), 'Upcoming', '#F6B48A'], [String(showed), 'Showed up', '#fff'], [due ? Math.round(showed / due * 100) + '%' : '—', 'Show-up', '#fff']].map(([value, label, color]) => ({ value, label, color, open: () => set({ pane: 'overlay', kind: 'clist', clist: label, infoName: null }) })),
          calTeamBars: teamsList.slice(1).filter(([k]) => team === 'all' || k === team).map(([k, label, color]) => { const n = VISITS.filter(v => (REP_TEAM[v[3].split(' · ')[0]] || 'Team Kelvin') === k).length; return { name: label.replace('Team ', ''), color, pct: Math.round(n / VISITS.length * 100), label: n + ' visits' }; }),
          dow: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(l => ({ l })), monthCells, weekCols, daySlots, upDays,
        };
      })(),
      visits: VISITS.map(([day, time, name, who, status], i) => ({ day, time, name, who, status, open: () => set({ pane: 'overlay', kind: 'info', visit: i }), stBg: ST[status][0], stFg: ST[status][1], dayColor: day.startsWith('Today') ? '#BD4A19' : '#3F2B22', rowBg: day.startsWith('Today') ? '#FFFBF7' : '#fff' })),
      ...(() => {
        const D = [['Akemi Mattress · October Fair', 'WhatsApp', 1850, 24300, 812, 11, 5], ['Bedframe Bundle · Reels', 'Messenger', 920, 15800, 455, 7, 2], ['Sofa Clearance · Carousel', 'Messenger', 640, 9100, 238, 5, 2], ['Dining Set · Stories', 'Messenger', 180, 2600, 61, 2, 0], ['Akemi Mattress · September', 'Messenger', 0, 0, 0, 0, 1]];
        const rm = (n) => 'RM ' + n.toLocaleString('en-MY'); const num = (n) => n.toLocaleString('en-MY');
        const sp = D.reduce((x, d) => x + d[2], 0), lead = D.reduce((x, d) => x + d[5], 0), clk = D.reduce((x, d) => x + d[4], 0), rch = D.reduce((x, d) => x + d[3], 0);
        const ap = D.reduce((x, d) => x + d[6], 0);
        const rmN = (n) => n.toLocaleString('en-MY');
        return { adTot: { n: D.length, spend: rmN(sp), reach: num(rch), clicks: num(clk), ctr: rch ? (clk / rch * 100).toFixed(1) + '%' : '—', leads: String(lead), cpl: lead ? '' + (sp / lead).toFixed(2) : '—', appt: String(ap) },
          adTotals: [['Spend · October', rm(sp)], ['Reach', num(rch)], ['Clicks', num(clk)], ['Cost / lead', lead ? 'RM ' + (sp / lead).toFixed(2) : '—']].map(([label, value]) => ({ label, value })),
          adPerf: D.map(([name, ch, spend, reach, clicks, leads, appt]) => { const st3 = AD_STATUS[name] || 'Running'; const m = ST_META[st3]; const cpl = leads ? spend / leads : null;
            return { name, channel: ch, chFg: ch === 'WhatsApp' ? '#387557' : '#2F6FB5', status: st3, stDot: m[1], stInk: m[4], spend: spend ? rmN(spend) : '—', reach: reach ? num(reach) : '—', clicks: clicks ? num(clicks) : '—', ctr: reach ? (clicks / reach * 100).toFixed(1) + '%' : '—', leads: String(leads), cpl: cpl ? cpl.toFixed(2) : '—', cplColor: cpl && cpl > 150 ? '#A3371A' : '#3F2B22', appt: String(appt) }; }) };
      })(),
      leadStatus: (() => { const n = (k) => CHATS.filter(c2 => c2[6].startsWith(k)).length; const rows = [['New', n('New'), '#3B8FD9', 'st:New'], ['Attention', n('Overdue'), '#A3371A', 'st:Overdue'], ['Appointment', n('Appointment'), '#8E4B6E', 'st:Appointment'], ['Follow up', n('Follow up'), '#A46312', 'st:Follow up'], ['Cold leads', 1, '#3D5A75', 'st:Cold']];
        const max = Math.max(...rows.map(r => r[1]), 1); const tot = rows.reduce((a2, r) => a2 + r[1], 0) || 1; return rows.map(([label, cnt, color, list]) => ({ label, n: cnt, color, share: Math.round(cnt / tot * 100) + '%', pct: Math.round(cnt / max * 100), open: () => set({ pane: 'overlay', kind: 'clist', clist: list, infoName: null }) })); })(),
      hero: { label: 'Appt rate · October', value: '40%', sub: '10 booked of 25 leads', open: () => set({ pane: 'overlay', kind: 'clist', clist: 'Booked', infoName: null }) },
      heroStats: [['Leads', '25', 'October', 'Leads'], ['Show-up', '50%', 'Of visits due', 'Show-up'], ['Reply 24 h', '38%', 'First reply within 24 h', 'Leads']].map(([label, value, sub2, lk], i) => ({ label, value, sub: sub2, open: () => set({ pane: 'overlay', kind: 'clist', clist: lk, infoName: null }), bl: i ? '1px solid rgba(255,255,255,.28)' : '0', pl: i ? 22 : 0 })),
      openInfo: () => set({ pane: 'overlay', kind: 'info' }),
      ci: (() => { const nm = S.infoName; let vi2 = nm ? VISITS.findIndex(x => x[2] === nm) : (S.visit ?? 8); const c0 = nm ? CHATS.find(x => x[1] === nm) : null;
        const v = vi2 >= 0 ? VISITS[vi2] : ['', '—', nm, (c0 ? c0[5] : '—') + ' · —', c0 ? c0[6] : '—']; if (vi2 < 0) vi2 = CHATS.indexOf(c0) % 9; const c = CHATS.find(x => x[1] === v[2]);
        const ad = c ? c[3] : 'Akemi Mattress · October Fair'; const plat = ad.includes('October Fair') ? 'WhatsApp' : 'Messenger';
        const phone = '01' + (6 + (vi2 % 4)) + '-' + (220 + vi2 * 37) + ' ' + (8812 - vi2 * 113);
        const rows = [['Phone', phone], ['First contact', (20 + (vi2 % 9)) + '/09/2026, 3:00 pm'], ['Last chat', c ? (/am|pm/.test(c[2]) ? '12/10/2026, ' + c[2] : c[2]) : '—'], ['Platform', plat], ['Ad', ad], ['Status', v[4]],
          ['Visit', v[1] === '—' ? '—' : (v[0] || 'Wed 14 Oct').replace('Today · ', '') + ', ' + v[1]], ['Showroom', v[3].split(' · ')[1]], ['Salesperson', v[3].split(' · ')[0]],
          ['Property type', '—'], ['Unit size', '—'], ['Location', '—'], ['Requirement', '—'], ['Budget', '—']];
        return { name: v[2], ini: v[2].split(' ').map(w => w[0]).join('').slice(0, 2), rows: rows.map(([k, val], i) => ({ k, v: val, bt: i ? '1px solid #F1E7DF' : '0', w: val === '—' ? 400 : 650, c: val === '—' ? '#A08E82' : '#3F2B22' })) }; })(),
      infoChat: kind === 'info' && pane === 'overlay' && CHATS.some(c => c[1] === (S.infoName || VISITS[S.visit ?? 8][2])),
      chatFromList: kind === 'chat' && pane === 'overlay' && !!S.fromList && (S.clist || '').startsWith('st:'),
      backStatusLabel: ({ 'st:New': 'New', 'st:Overdue': 'Attention', 'st:Appointment': 'Appointment', 'st:Follow up': 'Follow up', 'st:Cold': 'Cold leads' }[S.clist] || '') + ' · all chats',
      backToStatus: () => set({ kind: 'clist', fromList: false }),
      clistEmpty: kind === 'clist' && (S.clist || '').startsWith('st:') && !CHATS.some(c => c[6].startsWith((S.clist || '').slice(3))),
      infoBack: !!S.infoName, infoBackLabel: (S.clist || 'Leads') + ' · all customers', backToList: () => set({ kind: 'clist', infoName: null }),
      clSortLabel: S.clSort || 'Last chat', clSortOpen: !!S.clSortOpen, clSortToggle: () => set(st => ({ clSortOpen: !st.clSortOpen })),
      clSorts: ['Last chat', 'Oldest chat', 'Status', 'Salesperson', 'Name A–Z'].map(k => { const on = (S.clSort || 'Last chat') === k; return { label: k, bg: on ? '#FFF1E6' : 'transparent', fg: on ? '#BD4A19' : '#3F2B22', w: on ? 700 : 500, pick: () => set({ clSort: k, clSortOpen: false }) }; }),
      clistRows: sortCl(S, (() => { const key = S.clist || 'Leads'; const stc = (st2) => { const k = st2.startsWith('Overdue') ? 'Overdue' : st2; return ST[k] || ST['Follow up']; };
        let rows;
        if (key.startsWith('st:')) { const k = key.slice(3); return CHATS.map((c, i) => [c, i]).filter(([c]) => c[6].startsWith(k)).map(([c, i]) => { const c2 = stc(c[6]); return { name: c[1], ini: c[0], sub: c[3] + ' · ' + c[5], status: c[6], ord: i, rep: c[5], stBg: c2[0], stFg: c2[1], open: () => set({ kind: 'chat', chat: i, fromList: true }) }; }); }
        if (key === 'Leads') rows = CHATS.map((c, i) => ({ name: c[1], ini: c[0], sub: c[3] + ' · ' + c[5], status: c[6], ord: i, rep: c[5] }));
        else { let last = ''; const vv = VISITS.map(v => { if (v[0]) last = v[0]; return { v, num: parseInt(last.replace('Today · ', '').split(' ')[1], 10), day: last.replace('Today · ', '') }; });
          const pick = key === 'Booked' ? vv : key === 'Upcoming' ? vv.filter(x => x.num >= 12) : key === 'Showed up' ? vv.filter(x => x.v[4] === 'Showed up') : vv.filter(x => x.num < 12);
          rows = pick.map(({ v, day }, j) => ({ ord: j, rep: (CHATS.find(c => c[1] === v[2]) || [])[5] || '', name: v[2], ini: v[2].split(' ').map(w => w[0]).join('').slice(0, 2), sub: day + ', ' + v[1] + ' · ' + v[3], status: key === 'Show-up' && v[4] !== 'Showed up' ? 'No show yet' : v[4] })); }
        return rows.map(r => { const c2 = r.status === 'No show yet' ? ['#F2F0EB', '#6B645A'] : stc(r.status); return { ...r, stBg: c2[0], stFg: c2[1], open: () => set({ kind: 'info', infoName: r.name }) }; }); })()),
      openInfoChat: () => { const idx = CHATS.findIndex(c => c[1] === (S.infoName || VISITS[S.visit ?? 8][2])); set({ kind: 'chat', chat: idx, fromInfo: true }); },
      chatMsg: chat[4], chatOut: chat[4].startsWith('You: '), chatIn: !chat[4].startsWith('You: '), chatText: chat[4].replace(/^You: /, ''), chatTime: chat[2], chatOwner: chat[5].includes('to assign') ? "No one yet's customer" : chat[5] + "'s customer", chatReply: 'Reply to ' + chat[1].split(' ')[0] + '…',
      opKicker: sc[0].toUpperCase(), opTitle: opItem[0], opChip: sc[2], opSub: subFor(opItem[0], opItem[1]),
      openSheet: () => set({ stage: 'menu' }),
      W, H, me, sbW, sbOpen: !collapsed, sbClosed: collapsed, sections,
      appTop, appBottom, crmItems, profileOpen, profileRot: profileOpen ? 0 : -90, showScope: teamMine,
      toggleProfile: () => set(st => ({ fold: { ...(st.fold || {}), profile: !(st.fold || {}).profile } })),
      toggleSb: () => set({ collapsed: !collapsed }),
      crmLabel: mine ? 'CRM · MINE' : (teamMine ? 'CRM · TEAM' : 'CRM'),
      pageTitle: curTab[1], pageBadge: curTab[2] || null,
      appNav: NAV.map(([label, d, count]) => ({ label, d, count: count || null, on: label === 'Profile', off: label !== 'Profile' })),
      showTeamMine: teamMine, scopeOpts, tabs,
      showPeriod: tab === 'insight' && W === 1440 && !teamMine, showPeriodCompact: tab === 'insight' && (W !== 1440 || teamMine),
      periodNow: periodLabels[2], alertsLabel: W === 1440, periodOpts,
      openAlerts: () => set({ pane: 'overlay', kind: 'alerts' }),
      isWide, isCenter, notWide: !isWide && !isCenter && !sheetMode,
      pageLabel: (tabList.find(t => t[0] === tab) || ['', ''])[1].toUpperCase(),
      pageDims: `${pageW} × ${bodyH}`,
      openLabel: labels[tab] || 'Open',
      openItem,
      skeleton: [[42, 70], [36, 82], [48, 64], [30, 76], [44, 58], [38, 72], [46, 66], [34, 80]].map(([a, b]) => ({ a, b })),
      listCards,
      showScrim: isOverlay,
      paneShown, paneStyle,
      paneEmpty: pane === 'empty' || pane === 'wideEmpty',
      paneFull: pane === 'docked' || pane === 'overlay' || pane === 'wide',
      emptyText: em[0], emptyHint: em[1], emptyIcon: em[2],
      ph,
      kChat: effKind === 'chat', kAlerts: effKind === 'alerts', kSection: effKind === 'section', kInfo: effKind === 'info', kClist: effKind === 'clist', clistN: (() => { const k = S.clist || 'Leads'; if (k.startsWith('st:')) { const n = CHATS.filter(c => c[6].startsWith(k.slice(3))).length; return n + (n === 1 ? ' customer' : ' customers'); } if (k === 'Leads') return CHATS.length + ' customers'; return 'Visits'; })(), kMetrics: effKind === 'metrics', kTeam: effKind === 'team', kAssign: effKind === 'assign',
      closePane: () => closePane(P, S, set),
      ...(() => {
        const M = [
          ['Popular', 'Meta Ads', [['spend', 'Amount spent', 'Total charged in the period', 'rm'], ['impr', 'Impressions', 'Times the ad was on screen', 'n'], ['reach', 'Reach', 'People who saw the ad at least once', 'n'], ['results', 'Results', 'Messaging conversations started', 'n'], ['cpr', 'Cost per result', 'Amount spent ÷ results', 'rm2'], ['delivery', 'Delivery', 'Running, paused or in review', 't']]],
          ['Delivery', 'Meta Ads', [['freq', 'Frequency', 'Impressions ÷ reach', 'x'], ['cpm', 'CPM', 'Cost per 1,000 impressions', 'rm2'], ['cpp', 'Cost per 1,000 reached', 'Amount spent ÷ reach × 1,000', 'rm2']]],
          ['Messaging', 'Meta Ads', [['msgconv', 'Messaging conversations started', 'Chats opened from the ad', 'n'], ['cpmsg', 'Cost per conversation started', 'Amount spent ÷ conversations started', 'rm2'], ['newmsg', 'New messaging contacts', 'People who messaged the page for the first time', 'n'], ['msgreply', 'Conversations replied', 'Chats where the page replied', 'n'], ['blocks', 'Messaging blocks', 'People who blocked the page after the ad', 'n']]],
          ['Clicks', 'Meta Ads', [['clicks', 'Link clicks', 'Clicks on the ad link', 'n'], ['cpc', 'Cost per link click', 'Amount spent ÷ link clicks', 'rm2'], ['ctr', 'CTR (link)', 'Link clicks ÷ impressions', 'pct'], ['allclk', 'Clicks (all)', 'Every click on the ad, incl. profile and likes', 'n'], ['ctrall', 'CTR (all)', 'Clicks (all) ÷ impressions', 'pct'], ['cpcall', 'CPC (all)', 'Amount spent ÷ clicks (all)', 'rm2'], ['outclk', 'Outbound clicks', 'Clicks that left Facebook or Instagram', 'n']]],
          ['Engagement', 'Meta Ads', [['eng', 'Post engagement', 'Reactions, comments, shares, saves and clicks', 'n'], ['reacts', 'Post reactions', 'Likes and other reactions', 'n'], ['comments', 'Post comments', 'Comments on the ad', 'n'], ['shares', 'Post shares', 'Times the ad was shared', 'n'], ['saves', 'Post saves', 'Times the ad was saved', 'n'], ['follows', 'Page follows', 'New followers from the ad', 'n'], ['cpe', 'Cost per engagement', 'Amount spent ÷ post engagement', 'rm2']]],
          ['Video', 'Meta Ads', [['v3', '3-second video plays', 'Plays of at least 3 seconds', 'n'], ['thru', 'ThruPlays', 'Played to the end or at least 15 seconds', 'n'], ['cpthru', 'Cost per ThruPlay', 'Amount spent ÷ ThruPlays', 'rm2'], ['v25', 'Video plays at 25%', 'Watched a quarter of the video', 'n'], ['v50', 'Video plays at 50%', 'Watched half of the video', 'n'], ['v75', 'Video plays at 75%', 'Watched three quarters of the video', 'n'], ['v100', 'Video plays at 100%', 'Watched the whole video', 'n'], ['hook', 'Hook rate', '3-second plays ÷ impressions', 'pct']]],
          ['From this CRM', 'Revenue app', [['leads', 'Leads', 'Chats that came in from the ad', 'n'], ['cpl', 'Cost per lead', 'Amount spent ÷ leads', 'rm2'], ['appt', 'Appointments', 'Leads who booked a visit', 'n'], ['showup', 'Showed up', 'Visits marked as showed up', 'n'], ['won', 'Won', 'Leads marked won', 'n'], ['apptrate', 'Appointment rate', 'Appointments ÷ leads', 'pct'], ['cpappt', 'Cost per appointment', 'Amount spent ÷ appointments', 'rm2'], ['showrate', 'Show-up rate', 'Showed up ÷ appointments', 'pct'], ['winrate', 'Win rate', 'Won ÷ leads', 'pct'], ['cpwon', 'Cost per won', 'Amount spent ÷ won', 'rm2']]],
        ];
        const ALL = M.flatMap(g => g[2]); const DEF = ['spend', 'impr', 'reach', 'results', 'cpr', 'leads', 'appt'];
        const sel = S.apSel || DEF; const dsel = S.mDraft || sel; const q = (S.mq || '').toLowerCase();
        const apStF = S.apStF || 'all'; const AD0 = [['Akemi Mattress · October Fair', 'WhatsApp', 1850, 24300, 812, 11, 5, 3, 2, 1.12], ['Bedframe Bundle · Reels', 'Messenger', 920, 15800, 455, 7, 2, 1, 0, 0.86], ['Sofa Clearance · Carousel', 'Messenger', 640, 9100, 238, 5, 2, 1, 1, 1.24], ['Dining Set · Stories', 'Messenger', 180, 2600, 61, 2, 0, 0, 0, 0.7], ['Akemi Mattress · September', 'Messenger', 0, 0, 0, 0, 1, 0, 0, 0]]; const AD = AD0.filter(d => apStF === 'all' || (AD_STATUS[d[0]] || 'Running') === apStF);
        const calc = (d, k) => { const [, , sp, rc, ck, ld, ap, sh, wn] = d; const im = Math.round(rc * 1.9), res = Math.round(ck * 0.09);
          return { spend: sp, impr: im, reach: rc, results: res, cpr: res ? sp / res : null, freq: rc ? im / rc : null, cpm: im ? sp / im * 1000 : null, clicks: ck, cpc: ck ? sp / ck : null, ctr: im ? ck / im * 100 : null, leads: ld, cpl: ld ? sp / ld : null, appt: ap, showup: sh, won: wn,
            cpp: rc ? sp / rc * 1000 : null, msgconv: res, cpmsg: res ? sp / res : null, newmsg: Math.round(res * 0.8), msgreply: Math.round(res * 0.65), blocks: Math.round(res * 0.03),
            allclk: Math.round(ck * 1.6), ctrall: im ? ck * 1.6 / im * 100 : null, cpcall: ck ? sp / (ck * 1.6) : null, outclk: Math.round(ck * 0.7),
            eng: Math.round(ck * 2.4), reacts: Math.round(ck * 0.9), comments: Math.round(ck * 0.08), shares: Math.round(ck * 0.05), saves: Math.round(ck * 0.04), follows: Math.round(ck * 0.03), cpe: ck ? sp / (ck * 2.4) : null,
            v3: Math.round(im * 0.22), thru: Math.round(im * 0.07), cpthru: im ? sp / (im * 0.07) : null, v25: Math.round(im * 0.12), v50: Math.round(im * 0.08), v75: Math.round(im * 0.05), v100: Math.round(im * 0.03), hook: im ? 22 : null,
            apptrate: ld ? ap / ld * 100 : null, cpappt: ap ? sp / ap : null, showrate: ap ? sh / ap * 100 : null, winrate: ld ? wn / ld * 100 : null, cpwon: wn ? sp / wn : null }[k]; };
        const fmt = (v, t) => v == null ? '—' : t === 'rm' ? Math.round(v).toLocaleString('en-MY') : t === 'rm2' ? v.toFixed(2) : t === 'pct' ? v.toFixed(2) + '%' : t === 'x' ? v.toFixed(2) : Math.round(v).toLocaleString('en-MY');
        const cols = sel.map(k => ALL.find(m => m[0] === k)).filter(Boolean); const dcols = dsel.map(k => ALL.find(m => m[0] === k)).filter(Boolean);
        const cmp = !!S.apCmp; const tot = AD.reduce((acc, d) => d.map((x, i) => typeof x === 'number' ? (acc[i] || 0) + x : x), []);
        const dlen = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 864e5) + 1 : 31;
        const hsh = (x) => [...(x || 'm')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7);
        const mLen = S.apRange === 'custom' ? dlen(S.apF, S.apT) : 31, cLen = dlen(S.apCF, S.apCT) || mLen;
        const scl = (d, len, seed) => d.map((x, i) => i >= 2 && i <= 8 && typeof x === 'number' ? Math.round(x * len / 31 * (0.8 + ((seed * (i + 3) + d[0].length * 7) % 41) / 100)) : x);
        const sM = hsh(S.apF), sC = hsh(S.apCF);
        const sumA = (arr) => arr.reduce((acc, d) => d.map((x, i) => typeof x === 'number' ? (acc[i] || 0) + x : x), []);
        const custom = S.apRange === 'custom';
        const totM = ['Total', '', ...sumA(AD.map(d => custom ? scl(d, mLen, sM) : d)).slice(2)];
        const totC = ['Total', '', ...sumA(AD.map(d => scl(d, cLen, sC))).slice(2)];
        const cell = (d, m) => { if (m[0] === 'delivery') return { v: d[0] === 'Total' ? '' : (AD_STATUS[d[0]] || 'Running'), cv: '', d: '', dc: '', db: '' };
          const isT = d[0] === 'Total'; const dm = isT ? totM : custom ? scl(d, mLen, sM) : d; const v = calc(dm, m[0]);
          if (!cmp) return { v: fmt(v, m[3]), cv: '', d: '', dc: '', db: '' };
          const pv = calc(isT ? totC : scl(d, cLen, sC), m[0]); let dd = '—', dc = '#806B60', db = '#F5EBE3';
          if (v != null && pv) { const p = (v - pv) / pv * 100; const costy = /^(cpr|cpm|cpc|cpl|spend|cpp|cpmsg|cpcall|cpe|cpthru|cpappt|cpwon|blocks)$/.test(m[0]); dd = Math.abs(p) < 0.5 ? '0%' : (p > 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(0) + '%'; const good = (p > 0) !== costy; if (Math.abs(p) >= 0.5) { dc = good ? '#387557' : '#A3371A'; db = good ? '#E4F1EA' : '#FBE9E4'; } }
          else if (v && !pv) { dd = 'New'; dc = '#387557'; db = '#E4F1EA'; }
          return { v: fmt(v, m[3]), cv: fmt(pv, m[3]), d: dd, dc, db }; };
        const R = [['This month', '1 – 31 Oct', 'vs Sep'], ['Last 7 days', '5 – 11 Oct', 'vs 28 Sep – 4 Oct'], ['Last 30 days', '12 Sep – 11 Oct', 'vs 13 Aug – 11 Sep'], ['Last month', '1 – 30 Sep', 'vs Aug'], ['Today', '12 Oct', 'vs yesterday']];
        const ri0 = S.apRange ?? 0;
        const dfmt = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return parseInt(d, 10) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m, 10) - 1]; };
        if (ri0 === 'custom') { const sameDay = S.apF === S.apT; R.push([S.apPreset || 'Custom', sameDay ? dfmt(S.apF) : dfmt(S.apF) + ' – ' + dfmt(S.apT), 'vs previous period']); }
        const ri = ri0 === 'custom' ? R.length - 1 : ri0;
        const CM = [['Previous period', R[ri][2].replace('vs ', '')], ['Same period last month', 'Sep'], ['Same period last year', 'Oct 2025']];
        const cmode = S.apCmpMode; if (cmode === 'custom') CM.push(['Custom', dfmt(S.cmF) + ' – ' + dfmt(S.cmT)]);
        const srt = S.apSort; const sv = (d, k) => { if (k === 'name') return d[0]; if (k === 'delivery') return AD_STATUS[d[0]] || 'Running'; const v = calc(custom ? scl(d, mLen, sM) : d, k); return v == null ? -Infinity : v; };
        const ADs = srt ? AD.slice().sort((a, b) => { const x = sv(a, srt.k), y = sv(b, srt.k); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return srt.dir === 'asc' ? c : -c; }) : AD;
        const rows = ADs.map((d, i) => ({ name: d[0], meta: d[1] + ' · ' + (AD_STATUS[d[0]] || 'Running'), dot: ST_META[AD_STATUS[d[0]] || 'Running'][1], bg: '#fff', w: 600, cells: cols.map(m => cell(d, m)) }));
        rows.push({ name: 'Total · ' + AD.length + ' ads', meta: R[ri][1], dot: 'transparent', bg: '#FBF6F2', w: 700, cells: cols.map(m => m[0] === 'delivery' ? { v: '', cv: '', d: '', dc: '', db: '' } : cell(['Total', '', ...tot.slice(2)], m)) });
        return {
          apStOpen: !!S.apStOpen, apStToggle: () => set(st => ({ apStOpen: !st.apStOpen })),
          apStCur: { label: ST_META[apStF][0], dot: ST_META[apStF][1], n: AD.length },
          apStOpts: ['all', 'Running', 'Paused', 'Pending'].map(k => { const on = apStF === k; const n = k === 'all' ? AD0.length : AD0.filter(d => (AD_STATUS[d[0]] || 'Running') === k).length; return { label: ST_META[k][0], dot: ST_META[k][1], n, bg: on ? ST_META[k][3] : 'transparent', fg: on ? ST_META[k][4] : '#3F2B22', pick: () => set({ apStF: k, apStOpen: false }) }; }),
          apHead: cols.map(m => { const on = srt && srt.k === m[0]; return { label: m[1] + (m[3] === 'rm' || m[3] === 'rm2' ? ' (RM)' : ''), arrow: on ? (srt.dir === 'asc' ? '▲' : '▼') : '↕', ac: on ? '#BD4A19' : '#C9B8AC', fg: on ? '#3F2B22' : '#806B60',
            sort: () => set(st => { const c = st.apSort; if (!c || c.k !== m[0]) return { apSort: { k: m[0], dir: 'desc' } }; if (c.dir === 'desc') return { apSort: { k: m[0], dir: 'asc' } }; return { apSort: null }; }) }; }),
          apNameArrow: srt && srt.k === 'name' ? (srt.dir === 'asc' ? '▲' : '▼') : '↕', apNameAc: srt && srt.k === 'name' ? '#BD4A19' : '#C9B8AC',
          apSortName: () => set(st => { const c = st.apSort; if (!c || c.k !== 'name') return { apSort: { k: 'name', dir: 'asc' } }; if (c.dir === 'asc') return { apSort: { k: 'name', dir: 'desc' } }; return { apSort: null }; }), apRows: rows, apNSel: cols.length,
          apCols: 'minmax(220px, 1.6fr) repeat(' + Math.max(cols.length, 1) + ', minmax(104px, 1fr))', apMinW: 260 + cols.length * 116,
          apRangeLabel: R[ri][0] + ' · ' + R[ri][1], apRangeOpen: !!S.apRangeOpen, apToggleRange: () => set(st => ({ apRangeOpen: !st.apRangeOpen })),
          apCmpOn: cmp, apMainShort: R[ri][1], apCmpShort: S.apCF === S.apCT ? dfmt(S.apCF) : dfmt(S.apCF) + ' – ' + dfmt(S.apCT),
          ...(() => { const d = S.dp || {}; const iso = (n, m) => '2026-' + String(m || 10).padStart(2, '0') + '-' + String(n).padStart(2, '0');
            const PR = [['Today', iso(12), iso(12)], ['Yesterday', iso(11), iso(11)], ['This week (Mon – today)', iso(12), iso(12)], ['Last 7 days', iso(5), iso(11)], ['Last week (Mon – Sun)', iso(5), iso(11)], ['Last 14 days', '2026-09-28', iso(11)], ['This month', iso(1), iso(12)], ['Last 30 days', '2026-09-12', iso(11)], ['Last month', '2026-09-01', '2026-09-30'], ['All time', '2026-01-01', iso(12)]];
            const shown = (x) => { const [y, m, dd] = x.split('-'); return dd + '/' + m + '/' + y; };
            const open = () => set(st => ({ dp: { open: true, from: st.apF || iso(1), to: st.apT || iso(12), cf: st.apCF || '2026-09-01', ct: st.apCT || '2026-09-12', preset: st.apPreset || 'This month', cmp: !!st.apCmp, days: 30, step: 0, target: 'main', month: 10 } }));
            const upd = (x) => set(st => ({ dp: { ...(st.dp || {}), ...x } }));
            const mo = d.month || 10; const cells = [];
            if (mo === 10) { [28, 29, 30].forEach(n => cells.push({ num: n, off: true, iso: '2026-09-' + n })); for (let n = 1; n <= 31; n++) cells.push({ num: n, iso: iso(n), future: n > 12 }); cells.push({ num: 1, off: true, iso: '2026-11-01' }); }
            else { cells.push({ num: 31, off: true, iso: '2026-08-31' }); for (let n = 1; n <= 30; n++) cells.push({ num: n, iso: iso(n, 9) }); [1, 2, 3, 4].forEach(n => cells.push({ num: n, off: true, iso: iso(n) })); }
            const f = d.from || '', t = d.to || '', cf = d.cf || '', ct = d.ct || ''; const tg = d.target || 'main'; const fKey = tg === 'cmp' ? 'cf' : 'from', tKey = tg === 'cmp' ? 'ct' : 'to';
            return { dpOpen: open, dpCancel: () => upd({ open: false }), dpToggleCmp: () => upd({ cmp: !d.cmp, target: !d.cmp ? 'cmp' : 'main', step: 0 }), dpPrev: () => upd({ month: 9 }), dpNext: () => upd({ month: 10 }),
              dpSetDays: (e) => { const n = Math.max(1, parseInt(e.target.value, 10) || 1); const dt = new Date(2026, 9, 12 - n + 1); upd({ days: n, preset: 'Last ' + n + ' days', from: dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'), to: iso(12) }); },
              dpApply: () => set(st => { const x = st.dp || {}; return { apRange: 'custom', apF: x.from, apT: x.to, apCF: x.cf, apCT: x.ct, apPreset: x.preset, apCmp: !!x.cmp, apCmpMode: 'range', dp: { ...x, open: false } }; }),
              dp: { open: !!d.open, days: d.days || 30, cmp: !!d.cmp, cmpTrack: d.cmp ? '#BD4A19' : '#E2CFC1', cmpKnob: d.cmp ? 19 : 3, cmpHint: 'Compared with the period just before',
                monthLabel: mo === 10 ? 'October 2026' : 'September 2026',
                from: f ? shown(f) : '', to: t ? shown(t) : '', cf: cf ? shown(cf) : '', ct: ct ? shown(ct) : '',
                fromBd: tg === 'main' && d.step !== 1 ? '#BD4A19' : tg === 'main' ? '#E2CFC1' : '#EBDDD2', toBd: tg === 'main' && d.step === 1 ? '#BD4A19' : '#EBDDD2',
                cfBd: tg === 'cmp' && d.step !== 1 ? '#2F6FB5' : '#EBDDD2', ctBd: tg === 'cmp' && d.step === 1 ? '#2F6FB5' : '#EBDDD2',
                pickMain: () => upd({ target: 'main', step: 0 }), pickCmp: () => upd({ target: 'cmp', step: 0 }),
                ...(() => { const o = {}; const raw = d.txt || {}; const src = { from: f, to: t, cf, ct };
                  const parse = (v) => { const m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); if (!m) return null; const dd = +m[1], mm = +m[2], yy = +m[3]; const dt = new Date(yy, mm - 1, dd); if (dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null; return yy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0'); };
                  ['from', 'to', 'cf', 'ct'].forEach(k => { const isCmp = k === 'cf' || k === 'ct'; const bad = raw[k] != null && raw[k] !== '' && !parse(raw[k]);
                    o[k + 'V'] = raw[k] != null ? raw[k] : (src[k] ? shown(src[k]) : ''); o[k + 'Err'] = bad ? '#A3371A' : 'transparent';
                    o[k + 'In'] = (e) => { const v = e.target.value; set(st => ({ dp: { ...(st.dp || {}), txt: { ...((st.dp || {}).txt || {}), [k]: v } } })); };
                    o[k + 'Focus'] = () => upd({ target: isCmp ? 'cmp' : 'main', step: k === 'to' || k === 'ct' ? 1 : 0 });
                    o[k + 'Blur'] = (e) => { const p = parse(e.target.value); set(st => { const x = st.dp || {}; const tx = { ...(x.txt || {}) }; if (p) { delete tx[k]; const mon = +p.slice(5, 7); return { dp: { ...x, [k]: p, txt: tx, preset: 'Custom', month: mon === 9 ? 9 : 10 } }; } if (!e.target.value) delete tx[k]; return { dp: { ...x, txt: tx } }; }); };
                    o[k + 'Key'] = (e) => { if (e.key === 'Enter') e.target.blur(); }; });
                  return o; })(),
                tgtHint: tg === 'cmp' ? 'Picking the compare range (blue) · tap a date on the calendar' : 'Picking the main range (orange) · tap Compare start to pick the blue one',
                presets: PR.map(([label, a, b]) => { const on = d.preset === label; return { label, bg: on ? '#FFF1E6' : 'transparent', fg: on ? '#BD4A19' : '#3F2B22', w: on ? 700 : 550, pick: () => { if (tg === 'cmp') { upd({ cf: a, ct: b, step: 0 }); return; } const len = (new Date(b) - new Date(a)) / 864e5 + 1; const pe = new Date(new Date(a) - 864e5), ps = new Date(pe - (len - 1) * 864e5); const io = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); upd({ preset: label, from: a, to: b, cf: io(ps), ct: io(pe), step: 0 }); } }; }),
                cells: cells.map(c => { const inM = !c.off && f && t && c.iso >= f && c.iso <= t; const edgeM = !c.off && (c.iso === f || c.iso === t);
                  const inC = d.cmp && !c.off && cf && ct && c.iso >= cf && c.iso <= ct && !inM; const edgeC = d.cmp && !c.off && !edgeM && (c.iso === cf || c.iso === ct); const isToday = c.iso === iso(12);
                  const [rf, rt] = inM || edgeM ? [f, t] : [cf, ct];
                  return { num: c.num, off: !!c.off || !!c.future, band: inM && f !== t ? '#FFF1E6' : inC && cf !== ct ? '#E4EDF8' : 'transparent', br: c.iso === rf && rf !== rt ? '19px 0 0 19px' : c.iso === rt && rf !== rt ? '0 19px 19px 0' : '0',
                    dotBg: edgeM ? '#BD4A19' : edgeC ? '#2F6FB5' : 'transparent', fg: edgeM || edgeC ? '#fff' : (c.off || c.future) ? '#D3C4B8' : '#3F2B22', w: edgeM || edgeC || isToday ? 700 : 500, ring: isToday && !edgeM && !edgeC ? '1.5px solid #BD4A19' : '0',
                    pick: () => { if (c.off || c.future) return; const F = d[fKey]; if (!d.step) upd({ [fKey]: c.iso, [tKey]: c.iso, step: 1, ...(tg === 'main' ? { preset: 'Custom' } : {}) }); else upd({ [fKey]: c.iso < F ? c.iso : F, [tKey]: c.iso < F ? F : c.iso, step: 0 }); } }; }) } };
          })(),
          apFrom: S.apFDraft || S.apF || '2026-10-01', apTo: S.apTDraft || S.apT || '2026-10-11',
          apSetFrom: (e) => set({ apFDraft: e.target.value }), apSetTo: (e) => set({ apTDraft: e.target.value }),
          apApplyCustom: () => set(st => ({ apRange: 'custom', apF: st.apFDraft || st.apF || '2026-10-01', apT: st.apTDraft || st.apT || '2026-10-11', apRangeOpen: false })),
          cmpFrom: S.cmFDraft || S.cmF || '2026-09-01', cmpTo: S.cmTDraft || S.cmT || '2026-09-11',
          cmpSetFrom: (e) => set({ cmFDraft: e.target.value }), cmpSetTo: (e) => set({ cmTDraft: e.target.value }),
          cmpApplyCustom: () => set(st => ({ apCmp: true, apCmpMode: 'custom', cmF: st.cmFDraft || st.cmF || '2026-09-01', cmT: st.cmTDraft || st.cmT || '2026-09-11', apCmpOpen: false })),
          apCmpOpen: !!S.apCmpOpen,
          apCmps: [['Off', '', null], ...CM.map(([l, h], i) => [l, h, i === 3 ? 'custom' : i])].map(([label, hint, k]) => { const on = k === null ? !cmp : cmp && (cmode ?? 0) === k; return { label, hint, bg: on ? '#FFF1E6' : 'transparent', fg: on ? '#BD4A19' : '#3F2B22', pick: () => set({ apCmp: k !== null, apCmpMode: k, apCmpOpen: false }) }; }),
          apRanges: R.slice(0, 5).map(([label, hint], i) => ({ label, hint, bg: i === ri ? '#FFF1E6' : 'transparent', fg: i === ri ? '#BD4A19' : '#3F2B22', pick: () => set({ apRange: i, apRangeOpen: false }) })),
          apCmpLabel: cmp ? 'vs ' + (cmode === 'range' ? (S.apCF === S.apCT ? dfmt(S.apCF) : dfmt(S.apCF) + ' – ' + dfmt(S.apCT)) : (CM[cmode === 'custom' ? 3 : (cmode ?? 0)] || CM[0])[1]) : 'Compare', apCmpBg: cmp ? '#FFF1E6' : '#fff', apCmpBd: cmp ? '#BD4A19' : '#E2CFC1', apCmpFg: cmp ? '#BD4A19' : '#3F2B22', apToggleCmp: () => set(st => ({ apCmpOpen: !st.apCmpOpen })),
          apDlOpen: !!S.apDlOpen, apToggleDl: () => set(st => ({ apDlOpen: !st.apDlOpen })),
          apDl: [['XLS', 'Excel (.xlsx)', '#E4F1EA', '#387557'], ['CSV', 'CSV', '#F5EBE3', '#806B60'], ['PDF', 'PDF report', '#FBE9E4', '#A3371A']].map(([tag, label, bg, fg]) => ({ tag, label, bg, fg, pick: () => set({ apDlOpen: false }) })),
          openMetrics: () => set({ pane: 'docked', kind: 'metrics', mDraft: null, mDrag: null }),
          saveMetrics: () => set(st => ({ apSel: st.mDraft || st.apSel || DEF, mDraft: null, mDrag: null, pane: 'closed' })), mDirty: !!S.mDraft && JSON.stringify(S.mDraft) !== JSON.stringify(sel),
          mq: S.mq || '', setMq: (e) => set({ mq: e.target.value }), resetMetrics: () => set({ mDraft: [...DEF] }),
          mAllOpen: !M.every(g => (S.mFold || {})[g[0]]), mFoldAllLabel: M.every(g => (S.mFold || {})[g[0]]) ? 'Expand all' : 'Collapse all',
          mFoldAll: () => set(st => { const all = M.every(g => (st.mFold || {})[g[0]]); const f = {}; M.forEach(g => { f[g[0]] = !all; }); return { mFold: f }; }),
          mGroups: M.map(([label, src, items]) => ({ label, src, open: !!q || !(S.mFold || {})[label], rot: (!!q || !(S.mFold || {})[label]) ? 0 : -90, nSel: items.filter(m => dsel.includes(m[0])).length + ' of ' + items.length,
            fold: () => set(st => ({ mFold: { ...(st.mFold || {}), [label]: !(st.mFold || {})[label] } })), items: items.filter(m => !q || m[1].toLowerCase().includes(q)).map(m => { const on = dsel.includes(m[0]); return { label: m[1], hint: m[2], on, bg: on ? '#BD4A19' : '#fff', bd: on ? '#BD4A19' : '#CDBCAE',
            toggle: () => set(st => { const cur = st.mDraft || st.apSel || DEF; return { mDraft: cur.includes(m[0]) ? cur.filter(x => x !== m[0]) : [...cur, m[0]] }; }) }; }) })).filter(g => g.items.length),
          mOrder: dcols.map((m, i) => { const mvTo = (j) => set(st => { const cur = [...(st.mDraft || st.apSel || DEF)].filter(k => ALL.some(x => x[0] === k)); const [x] = cur.splice(i, 1); cur.splice(j, 0, x); return { mDraft: cur, mDrag: null }; });
            const dragging = S.mDrag === i; return { n: i + 1, label: m[1], first: i === 0, last: i === dcols.length - 1, upC: i === 0 ? '#D8C9BE' : '#6B574C', dnC: i === dcols.length - 1 ? '#D8C9BE' : '#6B574C', bg: '#fff', sh: dragging ? '0 6px 18px rgba(63,43,34,.22)' : 'none', bd: dragging ? 'transparent' : '#F1E7DF', z: dragging ? 2 : 1,
              up: () => { if (i > 0) mvTo(i - 1); }, down: () => { if (i < dcols.length - 1) mvTo(i + 1); },
              rm: () => set(st => ({ mDraft: (st.mDraft || st.apSel || DEF).filter(k => k !== m[0]) })),
              dStart: (e) => { e.dataTransfer.effectAllowed = 'move'; set({ mDrag: i }); }, dOver: (e) => { e.preventDefault(); const f = S.mDrag; if (f == null || f === i) return; set(st => { const cur = [...(st.mDraft || st.apSel || DEF)].filter(k => ALL.some(x => x[0] === k)); const [x] = cur.splice(f, 1); cur.splice(i, 0, x); return { mDraft: cur, mDrag: i }; }); }, dDrop: (e) => { e.preventDefault(); set({ mDrag: null }); }, dEnd: () => set({ mDrag: null }) }; }),
          mOrdOpen: !(S.mFold || {}).__order, mOrdRot: (S.mFold || {}).__order ? -90 : 0, mOrdFold: () => set(st => ({ mFold: { ...(st.mFold || {}), __order: !(st.mFold || {}).__order } })),
        };
      })(),
      alerts: [
        { kind: 'Overdue 9 h+', color: '#A3371A', time: '9:40 am', title: 'Rosli Ismail · Overdue 47 h', sub: 'Daniel Ong · Team Kelvin' },
        { kind: 'Move', color: '#8E4B6E', time: '9:12 am', title: 'Datin Rosnah was moved to you', sub: 'From Kelvin Lee · Akemi Mattress · October Fair' },
        { kind: 'Won', color: '#387557', time: 'Tue', title: 'Marcus Yeo · Won', sub: 'Farah Aziz · Akemi Mattress · October Fair' },
        { kind: 'Lost', color: '#806B60', time: 'Wed', title: 'Wong Kah Hou · Lost', sub: 'Principal · Sofa Clearance · Carousel' },
      ],
      showToast: (S.toast ?? p.toast) === true,
    };
  }

export { keyHandler };
