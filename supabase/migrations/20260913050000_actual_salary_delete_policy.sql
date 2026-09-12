-- actual_salaries에는 조회·입력·수정 정책만 있고 삭제 정책이 없어서, 잘못 입력한 실급여를
-- 앱에서 지울 방법이 없었다 (RLS가 막아 에러 없이 0건 삭제로 끝난다).
-- 입력·수정과 같은 기준으로 팀장·개발자에게만 삭제를 허용한다.
create policy "실급여 삭제"
  on public.actual_salaries
  for delete
  using (public.is_manager());
