do $$ begin
  alter type public.importance_level add value if not exists 'very_high' before 'high';
exception
  when duplicate_object then null;
end $$;

alter table public.weekly_client_report_items
  add column if not exists title text not null default '제목 없음';

do $$ begin
  alter table public.weekly_client_report_items
    add constraint weekly_client_report_items_title_not_blank check (length(btrim(title)) > 0);
exception
  when duplicate_object then null;
end $$;
