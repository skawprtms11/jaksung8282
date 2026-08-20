-- 제목만 작성한 화주자료 항목도 저장할 수 있도록 내용 공백 제약을 제거한다.
-- 제목 제약(weekly_client_report_items_title_not_blank)은 유지한다.
alter table weekly_client_report_items
  drop constraint if exists weekly_client_report_items_content_check;
