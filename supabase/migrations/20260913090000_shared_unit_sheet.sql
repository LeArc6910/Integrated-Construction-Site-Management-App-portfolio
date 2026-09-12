-- 같은 도면을 쓰는 현장(예: 같은 아파트 2차·3차)이 세대표 하나를 함께 쓰도록 한다.
-- 모양만 복사하는 게 아니라 경량·합지·석고 시공·미타공 기록까지 같은 것을 본다.
--
-- unit_checks·defects·unit_logs는 모두 building_id로 저장되므로, 여러 현장이 같은
-- buildings 행을 보게 만들면 데이터는 자동으로 공유된다. 그래서 세대표를 소유한 현장
-- 하나를 두고, 나머지 현장은 sheet_source_id로 그 현장을 가리키게 한다.
-- sheet_source_id가 null이면 자기 세대표를 쓰는 기존 동작 그대로다.
alter table public.sites add column if not exists sheet_source_id bigint references public.sites (id);

create index if not exists sites_sheet_source_idx on public.sites (sheet_source_id)
  where sheet_source_id is not null;

-- 원본을 가리키는 현장이 다시 원본이 되면(A→B→C) 세대표를 어디서 찾아야 할지 정할 수
-- 없다. 공유 관계는 항상 "원본 1 : 참조 N" 한 단계로만 유지한다.
create or replace function public.check_sheet_source() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sheet_source_id is null then
    return new;
  end if;

  if new.sheet_source_id = new.id then
    raise exception '자기 현장의 세대표를 원본으로 지정할 수 없습니다.';
  end if;

  if exists (select 1 from public.sites where id = new.sheet_source_id and sheet_source_id is not null) then
    raise exception '이미 다른 현장의 세대표를 쓰는 현장은 원본이 될 수 없습니다.';
  end if;

  if exists (select 1 from public.sites where sheet_source_id = new.id) then
    raise exception '다른 현장이 이 현장의 세대표를 쓰고 있어 다른 원본을 지정할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists sites_sheet_source_check on public.sites;
create trigger sites_sheet_source_check
  before insert or update of sheet_source_id on public.sites
  for each row execute function public.check_sheet_source();

-- 공유 설정은 sheet_source_id만 바꾸면 되지만, sites의 UPDATE는 "현장 수정" 정책이
-- 팀장·개발자로 제한한다(현장 삭제용 archived_at과 계약금액이 같은 테이블에 있다).
-- 팀원도 세대표를 묶을 수 있어야 해서, sheet_source_id만 건드리는 함수를 두고 이 함수로만
-- 허용한다. 두 UPDATE가 한 번에 처리되니 절반만 적용되는 일도 없다.
create or replace function public.set_sheet_sharing(owner_site_id bigint, site_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_ids bigint[] := coalesce(site_ids, '{}');
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- 목록에서 빠진 현장은 공유를 풀어 자기 세대표로 돌려보낸다. 그 현장의 동과 기록은
  -- 지우지 않으므로 공유를 풀면 예전 세대표가 그대로 다시 보인다.
  update public.sites
     set sheet_source_id = null
   where sheet_source_id = owner_site_id
     and not (id = any (keep_ids));

  update public.sites
     set sheet_source_id = owner_site_id
   where id = any (keep_ids)
     and id <> owner_site_id;
end;
$$;

revoke all on function public.set_sheet_sharing(bigint, bigint[]) from public;
grant execute on function public.set_sheet_sharing(bigint, bigint[]) to authenticated;
