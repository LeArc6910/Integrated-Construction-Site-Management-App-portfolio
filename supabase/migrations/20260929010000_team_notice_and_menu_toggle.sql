-- 1.0.10: 팀 공지와 "타공 설정" 메뉴 숨김 설정.
--
-- 팀 공지
-- - 팀마다 공지는 하나만 둔다(team_id가 기본키). 새로 게시하면 덮어쓰고, 내리면 행을 지운다.
-- - 같은 팀 사람은 누구나 읽고, 쓰기·내리기는 팀장·개발자만 한다. 쓰기는 아래 함수로만 열어서
--   게시 시각(updated_at)과 게시자를 앱이 아니라 DB가 찍게 한다. 앱은 updated_at이 바뀌면 새 공지로 보고
--   닫아 둔 공지도 다시 띄운다.
-- - 개발자가 다른 팀으로 전환해 둔 상태면 그 팀의 공지를 읽고 쓴다(current_team_id 기준, 다른 데이터와 같다).
-- - 권한 검사는 coalesce(..., false)로 한다. 로그인하지 않은 호출이면 is_manager()/is_dev()가 null을 돌려주고,
--   plpgsql의 `if not null`은 참이 아니라서 검사를 그냥 지나친다. 그래서 anon 실행 권한도 따로 회수한다
--   (Supabase는 public 스키마 함수에 anon 실행 권한을 기본으로 주므로 `from public` 회수만으로는 남는다).
create table if not exists public.team_notices (
  team_id bigint primary key default public.current_team_id() references public.teams (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.team_notices enable row level security;

drop policy if exists "공지 조회" on public.team_notices;
create policy "공지 조회" on public.team_notices for select using (auth.uid() is not null);

drop policy if exists "팀 격리" on public.team_notices;
create policy "팀 격리" on public.team_notices
  as restrictive
  for all
  using (team_id = (select public.current_team_id()))
  with check (team_id = (select public.current_team_id()));

revoke all on public.team_notices from anon;
grant select on public.team_notices to authenticated;

create or replace function public.set_team_notice(notice_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  body_text text := trim(coalesce(notice_body, ''));
begin
  if not coalesce(public.is_manager(), false) then
    raise exception '팀장만 공지를 올릴 수 있습니다.';
  end if;
  if body_text = '' then
    raise exception '공지 내용을 입력하세요.';
  end if;
  if char_length(body_text) > 500 then
    raise exception '공지는 500자까지 쓸 수 있습니다.';
  end if;

  insert into public.team_notices (team_id, body, updated_by, updated_at)
  values (public.current_team_id(), body_text, auth.uid(), now())
  on conflict (team_id) do update
    set body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.clear_team_notice()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_manager(), false) then
    raise exception '팀장만 공지를 내릴 수 있습니다.';
  end if;

  delete from public.team_notices where team_id = public.current_team_id();
end;
$$;

revoke all on function public.set_team_notice(text) from public, anon;
revoke all on function public.clear_team_notice() from public, anon;
grant execute on function public.set_team_notice(text) to authenticated;
grant execute on function public.clear_team_notice() to authenticated;

-- "타공 설정" 메뉴 숨김
-- - 현장마다 타공 설정을 다 채우고 나면 개발자가 팀별로 메뉴를 숨긴다. 숨기면 개발자 자신을 포함해
--   그 팀 모두에게 안 보인다(현장 세대표의 관리 메뉴에 있는 타공 설정·옵션 지정은 그대로다).
-- - teams는 정책 없이 막혀 있으므로 지금 보는 팀의 값을 읽는 함수와 개발자 전용 변경 함수를 둔다.
alter table public.teams add column if not exists hole_setup_menu_hidden boolean not null default false;

create or replace function public.team_settings()
returns table (hole_setup_menu_hidden boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.hole_setup_menu_hidden from public.teams t where t.id = public.current_team_id();
$$;

create or replace function public.set_hole_setup_menu_hidden(hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(public.is_dev(), false) then
    raise exception '개발자만 메뉴 표시를 바꿀 수 있습니다.';
  end if;

  update public.teams set hole_setup_menu_hidden = coalesce(hidden, false) where id = public.current_team_id();
end;
$$;

revoke all on function public.team_settings() from public, anon;
revoke all on function public.set_hole_setup_menu_hidden(boolean) from public, anon;
grant execute on function public.team_settings() to authenticated;
grant execute on function public.set_hole_setup_menu_hidden(boolean) to authenticated;
