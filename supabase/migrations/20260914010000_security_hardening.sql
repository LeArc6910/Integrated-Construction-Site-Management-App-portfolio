-- 보안 점검(1.0.4)에서 발견한 두 구멍을 막는다.

-- 1) "본인 프로필 수정" 정책에 컬럼 제한이 없어서, 팀원이 devtools로 자기 rate를
--    직접 바꿀 수 있었다(UI는 update_profile_rate RPC만 쓰지만 RLS가 이를 강제하지
--    않음). rate 변경은 이 RPC(security definer라 authenticated의 컬럼 권한과
--    무관하게 동작)로만 가능하도록, authenticated에서 rate 컬럼 UPDATE 권한 자체를
--    회수한다. 개발자 프로필 관리 정책도 authenticated로 실행되므로 이후 UI에서
--    rate를 함께 바꾸려면 마찬가지로 RPC를 거쳐야 한다.
revoke update ("rate") on public.profiles from authenticated;

-- 2) 영수증 스토리지 조회 정책이 "로그인만 하면 전체 열람 가능"이라, 다른 사람의
--    개인 경비 영수증을 경로만 알면 볼 수 있었다. expenses 테이블 조회 정책
--    (본인 OR 매니저)과 맞추고, 이미 있는 "영수증 삭제" 정책의 폴더-소유자 확인
--    패턴을 그대로 재사용한다.
drop policy if exists "영수증 조회" on storage.objects;
create policy "영수증 조회"
  on storage.objects
  as permissive
  for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and ((storage.foldername(name))[1] = (auth.uid())::text or public.is_manager())
  );
