insert into public.work_categories(category_code, category_name, icon_key, sort_order, is_active)
values
  ('operation', '운영', 'ClipboardList', 10, true),
  ('volume', '물동량', 'Boxes', 20, true),
  ('quality', '품질', 'BadgeCheck', 30, true),
  ('safety', '안전', 'ShieldCheck', 40, true),
  ('hr', '인사', 'Users', 50, true),
  ('facility', '시설', 'Building2', 60, true),
  ('customer', '고객', 'Handshake', 70, true),
  ('system', '시스템', 'MonitorCog', 80, true),
  ('etc', '기타', 'MoreHorizontal', 90, true)
on conflict (category_code) do update
set category_name = excluded.category_name,
    icon_key = excluded.icon_key,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

create or replace view public.safe_department_users
with (security_invoker = true)
as
select id, full_name, department_id, app_role, is_active
from public.profiles
where is_active = true;
