alter table public.department_weekly_contents
  add column if not exists current_importance public.importance_level not null default 'medium',
  add column if not exists current_work_category_id uuid references public.work_categories(id),
  add column if not exists next_importance public.importance_level not null default 'medium',
  add column if not exists next_work_category_id uuid references public.work_categories(id);
