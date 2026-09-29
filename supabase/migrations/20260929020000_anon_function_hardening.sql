-- 로그인하지 않은 호출(anon)이 개발자·팀장 전용 함수의 권한 검사를 지나치던 문제를 막는다.
--
-- 원인 두 가지가 겹쳤다.
-- 1) Supabase는 public 스키마에 만든 함수에 anon 실행 권한을 기본으로 준다. 지금까지 마이그레이션은
--    `revoke ... from public`만 해서 anon 권한이 그대로 남아 있었다. 앱 번들에 들어 있는 공개 키만
--    있으면 이 함수들을 부를 수 있다.
-- 2) is_dev()/is_manager()는 로그인하지 않았으면(프로필이 없으면) false가 아니라 null을 돌려준다.
--    plpgsql의 `if not public.is_dev() then raise ...`는 null일 때 참이 아니라서 검사를 그냥 지나친다.
--
-- 2026-09-29 운영 DB에서 트랜잭션 안에서 확인(롤백): anon으로 list_all_members가 전체 인원을 돌려주고,
-- create_team·set_user_team이 에러 없이 실행됐다.
--
-- 조치
-- - is_dev()/is_manager()가 null 대신 false를 돌려주게 한다. 이 두 함수를 쓰는 모든 함수·RLS 정책이
--   한 번에 막힌다(RLS에서는 null과 false가 어차피 같게 동작한다).
-- - 로그인해야만 쓰는 함수에서 anon 실행 권한을 회수한다. 가입 화면(로그인 전)이 쓰는 list_teams와,
--   RLS 정책 안에서 불리는 current_team_id·is_dev·is_manager·my_role, 트리거 함수는 그대로 둔다.
-- - 앞으로 만드는 함수에 anon 실행 권한이 저절로 붙지 않게 기본 권한도 바꾼다. 로그인 전에 불러야 하는
--   함수를 새로 만들면 `grant execute ... to anon`을 직접 적어야 한다.

create or replace function public.is_dev()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce(my_role() = '개발자', false) $$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce(my_role() in ('팀장', '개발자'), false) $$;

revoke execute on function public.create_team(text) from public, anon;
revoke execute on function public.set_user_team(uuid, bigint) from public, anon;
revoke execute on function public.switch_active_team(bigint) from public, anon;
revoke execute on function public.list_all_members() from public, anon;
revoke execute on function public.update_profile_rate(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.set_sheet_sharing(bigint, bigint[]) from public, anon;
revoke execute on function public.user_names() from public, anon;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.set_user_team(uuid, bigint) to authenticated;
grant execute on function public.switch_active_team(bigint) to authenticated;
grant execute on function public.list_all_members() to authenticated;
grant execute on function public.update_profile_rate(uuid, integer, integer, integer) to authenticated;
grant execute on function public.set_sheet_sharing(bigint, bigint[]) to authenticated;
grant execute on function public.user_names() to authenticated;

alter default privileges for role postgres in schema public revoke execute on functions from anon;
