create index if not exists weekly_report_item_requests_open_type_created_idx
  on public.weekly_report_item_requests(target_type, created_at desc)
  where deleted_at is null and closed_at is null;

create index if not exists weekly_report_item_requests_open_client_item_idx
  on public.weekly_report_item_requests(report_item_id, created_at desc)
  where deleted_at is null
    and closed_at is null
    and target_type = 'client_item';

create index if not exists weekly_report_item_requests_open_common_submission_idx
  on public.weekly_report_item_requests(department_submission_id, created_at desc)
  where deleted_at is null
    and closed_at is null
    and target_type = 'department_common';
