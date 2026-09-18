-- Cash Flow layouts: list the COA PARENT for the two loan/fund sections
-- (2026-09-18). A layout may now carry parent codes — every leaf beneath
-- follows the section unless listed elsewhere (lib/report-layouts
-- placeLeavesInLayout). The 2026-07-30 layouts only listed the leaves dragged
-- that day (3053/3054 · 4202/4051/4052 …), so every other debtor / fund source
-- fell into 其他 and "Loans Receivable" / "Fund Sources Payable" appeared twice
-- on the report (user: "分到太散了"). Other categories are untouched.

update report_layouts r
set layout = (
      select jsonb_build_object(
        'categories',
        jsonb_agg(
          case
            when c->>'id' = 'grp-3020' then jsonb_set(c, '{accounts}', '["3020"]'::jsonb)
            when c->>'id' = 'grp-4000' then jsonb_set(c, '{accounts}', '["4000"]'::jsonb)
            else c
          end
          order by ord
        )
      )
      from jsonb_array_elements(r.layout::jsonb -> 'categories') with ordinality as t(c, ord)
    ),
    updated_at = now()
where r.report_key in ('cash_flow_in', 'cash_flow_out')
  and r.layout::jsonb -> 'categories' is not null;
