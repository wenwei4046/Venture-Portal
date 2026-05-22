-- ============ FULL REPLACE: HV opening from final TB 22.05 (1,676,933.38) ============
-- Step 1: wipe existing manual_jv opening + Director Pool opening
DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE reference_type='manual_jv');
DELETE FROM journal_entries WHERE reference_type='manual_jv';
DELETE FROM dept_pools WHERE department_id=(SELECT id FROM departments WHERE name='Director')
  AND description LIKE 'Opening Director Pool%';

-- Step 2a: BS opening
WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','期初 BS @20/05/2026 (TB 22.05)','manual_jv','unallocated'::gl_segment,1046573.16,'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ('1500',NULL::numeric,3000.00::numeric),
  ('1510',2024.00::numeric,NULL::numeric),
  ('2000',9803.37::numeric,NULL::numeric),
  ('3030',91.26::numeric,NULL::numeric),
  ('3071',15179.16::numeric,NULL::numeric),
  ('3000',8415.67::numeric,NULL::numeric),
  ('3010',922.47::numeric,NULL::numeric),
  ('3051',266666.67::numeric,NULL::numeric),
  ('3053',564700.00::numeric,NULL::numeric),
  ('3063',38333.33::numeric,NULL::numeric),
  ('3055',95381.63::numeric,NULL::numeric),
  ('3058',28575.50::numeric,NULL::numeric),
  ('3052',12216.40::numeric,NULL::numeric),
  ('3059',2904.00::numeric,NULL::numeric),
  ('4052',NULL::numeric,473163.78::numeric),
  ('4062',NULL::numeric,38333.33::numeric),
  ('4051',NULL::numeric,118613.75::numeric),
  ('4058',NULL::numeric,100000.00::numeric),
  ('4057',NULL::numeric,50000.00::numeric),
  ('4054',NULL::numeric,133000.00::numeric),
  ('4056',NULL::numeric,49000.00::numeric),
  ('4055',NULL::numeric,73200.00::numeric),
  ('4050',NULL::numeric,749.40::numeric),
  ('4070',1058.50::numeric,NULL::numeric),
  ('4071',278.00::numeric,NULL::numeric),
  ('4072',15.80::numeric,NULL::numeric),
  ('4073',2.80::numeric,NULL::numeric),
  ('4074',4.60::numeric,NULL::numeric),
  ('1900',NULL::numeric,7512.90::numeric)
) AS x(code,dr,cr);

-- Step 2b: P&L segment entries
WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','期初 P&L marketing @20/05/2026 (TB 22.05)','manual_jv','marketing'::gl_segment,142657.33,'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ('5000',NULL::numeric,122209.79::numeric),
  ('5010',NULL::numeric,3846.87::numeric),
  ('5020',NULL::numeric,8362.70::numeric),
  ('9000',230.00::numeric,NULL::numeric),
  ('9020',1607.90::numeric,NULL::numeric),
  ('9030',99065.19::numeric,NULL::numeric),
  ('9081',13078.00::numeric,NULL::numeric),
  ('9082',1788.50::numeric,NULL::numeric),
  ('9083',204.40::numeric,NULL::numeric),
  ('9084',15157.03::numeric,NULL::numeric),
  ('9085',89.00::numeric,NULL::numeric),
  ('9086',631.58::numeric,NULL::numeric),
  ('9087',2001.95::numeric,NULL::numeric),
  ('9090',67.25::numeric,NULL::numeric),
  ('9091',828.09::numeric,NULL::numeric),
  ('9092',19.30::numeric,NULL::numeric),
  ('9094',7889.14::numeric,NULL::numeric),
  ('1900',NULL::numeric,8237.97::numeric)
) AS x(code,dr,cr);

WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','期初 P&L finance @20/05/2026 (TB 22.05)','manual_jv','finance'::gl_segment,61906.13,'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ('5020',NULL::numeric,61906.13::numeric),
  ('9030',52257.83::numeric,NULL::numeric),
  ('9081',6621.00::numeric,NULL::numeric),
  ('9082',908.50::numeric,NULL::numeric),
  ('9083',103.80::numeric,NULL::numeric),
  ('9084',2015.00::numeric,NULL::numeric)
) AS x(code,dr,cr);

WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','期初 P&L hr @20/05/2026 (TB 22.05)','manual_jv','hr'::gl_segment,74614.42,'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ('5020',NULL::numeric,74614.42::numeric),
  ('9030',61294.41::numeric,NULL::numeric),
  ('9081',7488.00::numeric,NULL::numeric),
  ('9082',807.85::numeric,NULL::numeric),
  ('9083',92.30::numeric,NULL::numeric),
  ('9084',4931.86::numeric,NULL::numeric)
) AS x(code,dr,cr);

WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','期初 P&L director_office @20/05/2026 (TB 22.05)','manual_jv','director_office'::gl_segment,17447.95,'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ('5020',NULL::numeric,17447.95::numeric),
  ('9030',14400.00::numeric,NULL::numeric),
  ('9081',1872.00::numeric,NULL::numeric),
  ('9082',249.45::numeric,NULL::numeric),
  ('9083',28.50::numeric,NULL::numeric),
  ('9084',898.00::numeric,NULL::numeric)
) AS x(code,dr,cr);

WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','期初 P&L director @20/05/2026 (TB 22.05)','manual_jv','director'::gl_segment,333865.26,'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ('5020',NULL::numeric,333865.26::numeric),
  ('9010',300.00::numeric,NULL::numeric),
  ('9030',256005.04::numeric,NULL::numeric),
  ('9081',28080.00::numeric,NULL::numeric),
  ('9082',1666.40::numeric,NULL::numeric),
  ('9083',190.40::numeric,NULL::numeric),
  ('9093',22360.38::numeric,NULL::numeric),
  ('1900',25263.04::numeric,NULL::numeric)
) AS x(code,dr,cr);

WITH s AS (SELECT nextval('journal_entry_no_seq') AS seq),
e AS (INSERT INTO journal_entries (entry_no,transaction_date,period_month,description,reference_type,segment,total_amount,created_by)
 SELECT format('JE-%s-%s',to_char(DATE '2026-05-20','YYYYMM'),lpad(s.seq::text,4,'0')),DATE '2026-05-20',DATE '2026-05-01','期初 P&L corporate @20/05/2026 (TB 22.05)','manual_jv','corporate'::gl_segment,25132.17,'cbc6a18a-3f38-4567-b8c3-385d00b9e6b3' FROM s RETURNING id)
INSERT INTO journal_lines (entry_id,account_code,debit,credit)
SELECT e.id,x.code,x.dr,x.cr FROM e,(VALUES
  ('7000',NULL::numeric,15620.00::numeric),
  ('9010',9330.00::numeric,NULL::numeric),
  ('9085',1201.00::numeric,NULL::numeric),
  ('9087',2793.38::numeric,NULL::numeric),
  ('9088',2807.34::numeric,NULL::numeric),
  ('9089',0.40::numeric,NULL::numeric),
  ('9091',0.05::numeric,NULL::numeric),
  ('9094',9000.00::numeric,NULL::numeric),
  ('1900',NULL::numeric,9512.17::numeric)
) AS x(code,dr,cr);

-- Director Pool: mirror director-segment NP into the operational dept pool
INSERT INTO dept_pools(department_id,transaction_type,amount,period_month,description,created_by)
SELECT id,'np_in'::dept_pool_txn_type,25263.04,DATE '2026-05-01','Opening Director Pool balance (ledger DIRECTOR dept net P&L)','cbc6a18a-3f38-4567-b8c3-385d00b9e6b3'
FROM departments WHERE name='Director';

-- Deactivate the now-unused Director Pool Payable account (reclass approach dropped).
UPDATE chart_of_accounts SET is_active=false WHERE code='4080';
