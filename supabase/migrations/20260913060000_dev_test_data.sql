-- 개발자 페이지의 "임시 데이터 생성/초기화" 버튼은 지정된 테스트 계정에서만 보인다.
-- role과 마찬가지로 본인이 스스로 켤 수 없도록 기존 가드 트리거에 포함시킨다.
alter table public.profiles add column if not exists is_test_account boolean not null default false;

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
  if not public.is_dev() and new.is_test_account is distinct from old.is_test_account then
    new.is_test_account := old.is_test_account;
  end if;
  return new;
end;
$$;

-- 개발자 페이지가 만드는 임시 현장을 구분하는 플래그. 초기화 버튼은 이 값이 true인
-- 현장만 지우도록 제한해서, 실제 현장이 실수로 삭제되는 일을 DB 레벨에서 막는다.
alter table public.sites add column if not exists is_test_data boolean not null default false;

-- sites는 원래 하드 삭제 정책이 없다(20260913040000_site_archive 참고: 실제 현장은
-- 보관 처리만 한다). 임시 데이터는 되돌릴 필요가 없으므로, is_test_data가 true인
-- 행에 한해서만 개발자가 진짜로 지울 수 있게 허용한다.
drop policy if exists "테스트 현장 삭제" on public.sites;
create policy "테스트 현장 삭제" on public.sites
  for delete
  using (public.is_dev() and is_test_data);
