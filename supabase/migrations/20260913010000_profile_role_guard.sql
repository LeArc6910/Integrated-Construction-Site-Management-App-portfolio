-- "본인 프로필 수정" 정책에는 컬럼 제한이 없어서, 일반 사용자가 자기 role을 스스로
-- 바꿀 수 있는 구멍이 있었다. 개발자만 role을 바꿀 수 있도록 트리거로 막는다.
-- (개발자는 "개발자 프로필 관리" 정책으로 이미 제한 없이 수정 가능 — 여기서 건드리지 않음)
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_dev() and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_self_role_change on public.profiles;
create trigger prevent_self_role_change
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

-- 예전에 만든 중복 정책 정리 ("프로필 조회"가 이미 본인+매니저 조회를 다 커버함)
drop policy if exists "본인 프로필 조회" on public.profiles;
