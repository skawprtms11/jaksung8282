-- 업무구분 목록 개편: 의미 매칭 6종은 이름/정렬 변경(FK 보존), 미매칭 3종 비활성, 7종 신규
-- (category_code 기준으로 재현 가능하게 작성)
update public.work_categories set category_name='정상운영', icon_key='ClipboardList', sort_order=10, is_active=true where category_code='operation';
update public.work_categories set category_name='인사관련', icon_key='Users', sort_order=20, is_active=true where category_code='hr';
update public.work_categories set category_name='고객방문', icon_key='Handshake', sort_order=80, is_active=true where category_code='customer';
update public.work_categories set category_name='시설물이슈', icon_key='Building2', sort_order=100, is_active=true where category_code='facility';
update public.work_categories set category_name='안전사고', icon_key='ShieldCheck', sort_order=120, is_active=true where category_code='safety';
update public.work_categories set category_name='기타이슈', icon_key='MoreHorizontal', sort_order=130, is_active=true where category_code='etc';

update public.work_categories set is_active=false where category_code in ('volume','quality','system');

insert into public.work_categories (category_code, category_name, icon_key, sort_order, is_active) values
 ('event','행사이슈','BadgeCheck',30,true),
 ('storage','보관이슈','Boxes',40,true),
 ('distribution','유통가공','MonitorCog',50,true),
 ('inventory','재고이슈','Boxes',60,true),
 ('kpi_meeting','KPI회의','BadgeCheck',70,true),
 ('key_meeting','중요회의','Users',90,true),
 ('complaint','고객클래임','Handshake',110,true)
on conflict (category_code) do nothing;
