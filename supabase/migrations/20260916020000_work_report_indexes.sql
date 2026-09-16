-- 개인 > 작업보고는 "오늘 내가 경량/합지를 체크한 세대"를 처리자·시각으로 찾는다.
-- unit_checks는 현장이 커지면 몇천~몇만 행이 되므로, 체크가 살아있는 행만 담는 부분
-- 인덱스로 받쳐둔다(체크를 해제하면 *_at이 null이 되어 인덱스에서도 빠진다).
create index if not exists idx_unit_checks_light_by_at
  on public.unit_checks (light_by, light_at)
  where light_at is not null;

create index if not exists idx_unit_checks_laminate_by_at
  on public.unit_checks (laminate_by, laminate_at)
  where laminate_at is not null;
