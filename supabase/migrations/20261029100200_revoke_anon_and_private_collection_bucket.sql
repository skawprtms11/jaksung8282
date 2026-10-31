-- 보안 보완(2026-10-28 점검) 4·6번.
--
-- 되돌리기(새 migration 파일로 적용):
--   4번: grant all on all tables in schema public to anon;
--        grant all on all sequences in schema public to anon;
--        alter default privileges for role postgres in schema public grant all on tables to anon;
--        alter default privileges for role postgres in schema public grant all on sequences to anon;
--        (Supabase 초기 기본 권한 상태. 원래 정의는 이 저장소 migration이 아니라 Supabase 프로젝트 기본값)
--   6번: update storage.buckets set public = true, file_size_limit = null, allowed_mime_types = null
--          where id = 'data-collections';   (원래 정의: 20260820070000_data_collection_entries.sql:36)
--        image_url 경로 → 공개 URL 복원:
--          update public.data_collections
--          set image_url = '<SUPABASE_URL>/storage/v1/object/public/data-collections/' || image_url
--          where image_url is not null and image_url !~ '^https?://';

-- 4. 비로그인(anon) 권한 회수.
-- 로그인 전 화면(로그인·가입·비밀번호 찾기)은 서버에서 service_role 클라이언트 또는 Auth API만 쓰므로
-- anon 으로 읽는 public 표·시퀀스가 없다. RLS 가 한 번 누락돼도 외부에 노출되지 않도록 권한 자체를 회수한다.
-- 함수 실행 권한은 20260803003614_harden_function_permissions.sql 에서 함수별로 이미 정리했다.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 운영 적용 전 확인: Supabase 는 supabase_admin 역할 명의의 기본 권한(default privileges)도 anon 에 부여한다.
-- psql 의 \ddp (또는 pg_default_acl 조회)로 supabase_admin 항목이 남아 있는지 확인하고,
-- 남아 있으면 해당 역할 권한으로 같은 revoke 를 별도 실행해야 이후 새 표가 anon 에 자동 개방되지 않는다.
--   alter default privileges for role supabase_admin in schema public revoke all on tables from anon;
--   alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;

-- 6. 자료취합 안내 사진 버킷 비공개 전환.
-- 업로드·서명 주소 발급은 서버 액션의 service_role 클라이언트로만 수행하고 storage.objects 에는 정책을 두지 않는다
-- (정책 없음 = authenticated·anon 직접 접근 차단). 화면에는 서버가 발급한 만료 1시간 서명 주소만 내려간다.
-- 허용 형식은 src/actions/data-collections.ts 의 업로드 검사(PNG·JPG·WEBP·GIF, 5MB)와 같다.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'data-collections';

-- 기존 공개 URL 을 버킷 내 저장 경로로 변환한다. (예: https://x.supabase.co/storage/v1/object/public/data-collections/guides/a.png → guides/a.png)
update public.data_collections
set image_url = split_part(
      regexp_replace(image_url, '^.*/storage/v1/object/(public|sign|authenticated)/data-collections/', ''),
      '?',
      1
    )
where image_url ~ '/storage/v1/object/(public|sign|authenticated)/data-collections/';
