-- ============================================================================
-- INFOTECH NUMBER — the code InfoTech knows a person by (user, 2026-09-12)
--
-- "infotech 的 code 不会跟着这里一起换哦，所以到时如果这样说，能不能用名字去来
--  对标呢？" — settled as B: keep InfoTech's number in a column of its own,
-- match on it first and on the name second; the portal's HV code is the
-- portal's own.
--
-- Until 20260915040000 the portal's `employee_code` WAS InfoTech's number —
-- the March import copied it — so both imports (the payroll summary, the
-- employee list) matched a file row to a person by it. The renumbering broke
-- that identity: an old file's HV013 is KHO WEI JIE in InfoTech and TAMMY on
-- the portal now. `infotech_code` restores the identity as a separate fact.
--
-- Backfilled here for the 27 people InfoTech had numbered: their
-- `employee_code` as it stood before the renumbering. 22 of them are
-- cross-checked against the codes snapshotted on payroll_voucher_lines; the
-- other five come from the pre-renumbering roster (three had left, one was a
-- September hire with no voucher yet, one read HVI001). From here on the
-- employee-list import writes it — the file's code, verbatim, for a new
-- person and for one it could only match by name. Unique where present: one
-- person per InfoTech number.
--
-- Idempotent: the column is added if missing, only rows still null are
-- backfilled, and the check at the end is a notice, so a fresh database
-- without these people goes through as well.
-- ============================================================================

alter table public.hr_staff_costs add column if not exists infotech_code text;

comment on column public.hr_staff_costs.infotech_code is
  'The employee number InfoTech HRMS knows this person by (its "Code" column). The imports match on it first and on the name second; employee_code is the portal''s own HV number.';

create unique index if not exists idx_hr_staff_infotech_code
  on public.hr_staff_costs (infotech_code)
  where infotech_code is not null;

do $$
declare
  v_updated integer;
  v_unplaced text;
begin
  create temp table infotech_numbers (name text, code text);
  insert into infotech_numbers values
    ('CHOW WAI MAN',                          'HV007'),
    ('CHEW WEE HO',                           'HV008'),
    ('SITI RAFIDAH BINTI FADLULLAH TEY',      'HV009'),
    ('LOW CHENG AN',                          'HV010'),
    ('SITI AISYAH BINTI MUHAMMAD MENG',       'HV011'),
    ('SIA JOSIAH',                            'HV012'),
    ('KHO WEI JIE',                           'HV013'),
    ('BOON YEW FENG',                         'HV014'),
    ('LIAN WEI EN',                           'HV015'),
    ('LUM NI KER',                            'HV016'),
    ('IZZUL BIN ISMAIL',                      'HV017'),
    ('CHIN YEE RU',                           'HV018'),
    ('EDWIN LIEW GAO NAN',                    'HV019'),
    ('RACHAEL LIM SHEUE LYNN',                'HV020'),
    ('NURAZIRA BINTI ALI',                    'HV021'),
    ('TAMMY KHOO KHIM LING',                  'HV022'),
    ('LIN XIAO LING',                         'HV023'),
    ('SIA JONAS',                             'HV024'),
    ('NUR AIN MASTURINA BINTI MOHD JUSAIDI',  'HV025'),
    ('LING HONG XIANG',                       'HV026'),
    ('THIEN YEE MUN',                         'HV027'),
    ('WONG JOEY',                             'HV028'),
    ('TAN YONG HONG',                         'HV029'),
    ('WONG LIN KHAI',                         'HV030'),
    ('LI SEAN',                               'HV031'),
    ('SHANEN SOON LEN YUNG',                  'HV032'),
    ('NUR HAKIIMAH ZULAIKHA SYED NOR HAKIM',  'HVI001');

  -- The name is the key: it is what the March import wrote from the same
  -- file, and the TEST-SEP26 rows carry their own longer names.
  update public.hr_staff_costs h
     set infotech_code = v.code
    from infotech_numbers v
   where h.employee_name = v.name
     and h.infotech_code is null;
  get diagnostics v_updated = row_count;

  select string_agg(v.code || ' (' || v.name || ')', ', ' order by v.code)
    into v_unplaced
    from infotech_numbers v
   where (select count(*) from public.hr_staff_costs h where h.infotech_code = v.code) <> 1;

  raise notice 'infotech_code: % rows backfilled; not held by exactly one person: %',
    v_updated, coalesce(v_unplaced, 'none');

  drop table infotech_numbers;
end $$;
