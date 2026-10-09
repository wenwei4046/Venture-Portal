-- The CRM's tables in the app-wide audit register (mig 20261008190000 left
-- them as placeholders: "whoever lands it registers these tables with its
-- migration"). A person's change is recorded — status, Lost reason,
-- assignment, appointments, the Boss / HOD's settings — under the Revenue key;
-- what Meta delivers is not (the conversation and the delivery log are the
-- record already).

-- Customers: a person's change (status, Lost reason, who has them). The unread
-- count and the time of the customer's last message move on every message.
SELECT public.audit_register('crm_contacts', 'CRM customers', 'Member services', '{revenue}', 'people',
  p_labels => '{name}', p_ignore => '{unread,last_customer_at}');
SELECT public.audit_register('crm_appointments', 'CRM appointments', 'Member services', '{revenue}', 'people',
  p_labels => '{start_at}');
SELECT public.audit_register('crm_showrooms', 'CRM showrooms', 'Member services', '{revenue}', 'people',
  p_labels => '{name}');
SELECT public.audit_register('crm_assign_rules', 'CRM ad assignment', 'Member services', '{revenue}', 'people',
  p_keys => '{ad_source_id}', p_labels => '{ad_label}');
SELECT public.audit_register('crm_team_settings', 'CRM team settings', 'Member services', '{revenue}', 'people',
  p_keys => '{tl_id}');
SELECT public.audit_register('crm_staff', 'CRM full time / part time', 'Member services', '{revenue}', 'people',
  p_keys => '{staff_id}');
SELECT public.audit_register('crm_role_map', 'CRM roles by title', 'Member services', '{revenue}', 'people',
  p_keys => '{title_id}');

-- What Meta delivers.
SELECT public.audit_register('crm_messages', 'CRM messages', 'Member services', '{}', 'none',
  p_reason => 'The conversation itself — every message kept with who sent it and when, a record already.');
SELECT public.audit_register('crm_channel_events', 'WhatsApp and Messenger deliveries', 'Member services', '{}', 'none',
  p_reason => 'Meta''s delivery log — every delivery kept with its payload, a record already.');
