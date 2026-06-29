-- External ("Other") payer contact details, shown on the invoice Bill-to block.
-- Only populated when billable_to_type = 'freetext'. Applied to remote via MCP
-- apply_migration; this file mirrors it for repo history.
alter table invoices
  add column if not exists billable_to_freetext_address text,
  add column if not exists billable_to_freetext_phone text,
  add column if not exists billable_to_freetext_email text;

comment on column invoices.billable_to_freetext_address is 'External (Other) payer postal address — shown on the invoice Bill-to block.';
comment on column invoices.billable_to_freetext_phone is 'External (Other) payer contact phone — shown on the invoice Bill-to block.';
comment on column invoices.billable_to_freetext_email is 'External (Other) payer contact email — shown on the invoice Bill-to block.';
