-- profiles의 UPDATE 정책은 "개발자만" 또는 "본인만" 두 가지뿐이라(role 자기변경을 막으려고
-- 매니저용 정책을 열어두지 않았다), 팀장이 인사관리에서 남의 단가(rate)를 바꾸려 하면
-- RLS가 대상 행을 0건 매칭시켜 조용히 아무 일도 안 일어난다(에러도 없음).
-- role은 그대로 개발자만 만지게 두고, rate만 팀장도 바꿀 수 있도록 좁은 RPC로 길을 낸다.
create or replace function public.update_profile_rate(target_user_id uuid, new_rate integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception '권한이 없습니다.';
  end if;

  update public.profiles
     set rate = new_rate
   where id = target_user_id;
end;
$$;

revoke all on function public.update_profile_rate(uuid, integer) from public;
grant execute on function public.update_profile_rate(uuid, integer) to authenticated;
