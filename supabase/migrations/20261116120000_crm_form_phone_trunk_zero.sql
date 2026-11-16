-- Instant Form leads whose number was typed with its trunk 0 after +60 ("+60 0186670207") were kept as 600186670207,
-- while WhatsApp delivers to — and the customer writes from — 60186670207, so a reply opened a second customer with no ad
-- (2026-11-16, the owner: "为什么回复会在不同的聊天室？"). The app now drops that 0 (lib/messenger/lead-forms.ts formPhone);
-- this corrects the customers kept so far whose reply has NOT yet opened a second customer. The ones already split
-- are left as they are (the owner: "只修不合并").
update crm_contacts c
   set external_id = '60' || substr(c.external_id, 4),
       phone       = '+60' || substr(c.external_id, 4)
 where c.channel = 'whatsapp'
   and c.external_id ~ '^600[0-9]{8,10}$'
   and not exists (select 1 from crm_contacts d
                    where d.channel = 'whatsapp' and d.account_id = c.account_id
                      and d.external_id = '60' || substr(c.external_id, 4));
