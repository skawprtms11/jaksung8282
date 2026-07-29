create table if not exists public.notice_comments (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices(id) on delete cascade,
  parent_id uuid references public.notice_comments(id) on delete cascade,
  content text not null check (length(btrim(content)) > 0),
  author_name text not null,
  author_department_name text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id)
);

create or replace function public.ensure_notice_comment_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_notice_id uuid;
begin
  if tg_op = 'UPDATE'
    and new.notice_id = old.notice_id
    and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  if new.parent_id is null then
    return new;
  end if;

  select notice_id into parent_notice_id
  from public.notice_comments
  where id = new.parent_id
    and deleted_at is null;

  if parent_notice_id is null then
    raise exception '답글 대상 댓글을 찾을 수 없습니다.';
  end if;

  if parent_notice_id <> new.notice_id then
    raise exception '같은 게시글의 댓글에만 답글을 등록할 수 있습니다.';
  end if;

  return new;
end;
$$;

create or replace function public.protect_notice_comment_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.deleted_at is not null then
    raise exception '삭제된 댓글은 수정할 수 없습니다.';
  end if;

  if new.notice_id <> old.notice_id
    or new.parent_id is distinct from old.parent_id
    or new.created_by <> old.created_by
    or new.created_at <> old.created_at
    or new.author_name <> old.author_name
    or new.author_department_name is distinct from old.author_department_name then
    raise exception '댓글의 작성자와 연결 정보는 변경할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists notice_comments_set_updated_at on public.notice_comments;
create trigger notice_comments_set_updated_at
  before update on public.notice_comments
  for each row execute function public.set_updated_at();

drop trigger if exists notice_comments_protect_immutable on public.notice_comments;
create trigger notice_comments_protect_immutable
  before update on public.notice_comments
  for each row execute function public.protect_notice_comment_immutable_fields();

drop trigger if exists notice_comments_ensure_parent on public.notice_comments;
create trigger notice_comments_ensure_parent
  before insert or update on public.notice_comments
  for each row execute function public.ensure_notice_comment_parent();

alter table public.notice_comments enable row level security;

drop policy if exists "notice_comments_select_active_notice" on public.notice_comments;
create policy "notice_comments_select_active_notice" on public.notice_comments
  for select to authenticated using (
    deleted_at is null
    and exists (
      select 1
      from public.notices n
      where n.id = notice_id
        and n.deleted_at is null
        and n.is_active = true
    )
  );

drop policy if exists "notice_comments_insert_authenticated" on public.notice_comments;
create policy "notice_comments_insert_authenticated" on public.notice_comments
  for insert to authenticated with check (
    created_by = auth.uid()
    and deleted_at is null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_active = true
    )
    and exists (
      select 1
      from public.notices n
      where n.id = notice_id
        and n.deleted_at is null
        and n.is_active = true
    )
  );

drop policy if exists "notice_comments_update_owner_or_admin" on public.notice_comments;
create policy "notice_comments_update_owner_or_admin" on public.notice_comments
  for update to authenticated using (
    deleted_at is null
    and (created_by = auth.uid() or public.is_admin())
  ) with check (
    created_by = auth.uid() or public.is_admin()
  );

create index if not exists notice_comments_notice_created_idx
  on public.notice_comments(notice_id, created_at)
  where deleted_at is null;

create index if not exists notice_comments_parent_created_idx
  on public.notice_comments(parent_id, created_at)
  where deleted_at is null;

create index if not exists notice_comments_created_by_idx
  on public.notice_comments(created_by)
  where deleted_at is null;
