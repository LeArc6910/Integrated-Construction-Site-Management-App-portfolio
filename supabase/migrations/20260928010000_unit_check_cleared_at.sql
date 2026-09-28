-- 체크를 해제해도 처리자·시각·작업 현장(*_by / *_at / *_site_id)을 지우지 않고, 해제한 시각만 남긴다.
--
-- 예전에는 해제하면 기록을 모두 비웠다. 그래서 며칠 전에 완료한 세대를 드래그하다 실수로 풀고
-- 다시 칠하면 처리자·시각이 "지금, 나"로 새로 찍혀서, 오늘 작업보고에 들어가고 타공 현황의
-- 완료일도 오늘로 옮겨졌다.
--
-- - 해제한 날(기기 날짜 기준) 안에 다시 체크하면 실수로 푼 것으로 보고 남아 있던 기록을 되살린다.
-- - 다음 날 이후에 체크하면 실제로 다시 작업한 것으로 보고 새 처리자·시각으로 찍는다.
-- - 체크 여부는 light/laminate 값으로만 판단한다. 해제된 행에도 *_at이 남아 있으므로, 처리자·시각을
--   읽는 쪽(작업보고·타공 현황·세대 패널)은 반드시 체크된 행만 봐야 한다.
-- - 작업보고용 부분 인덱스(idx_unit_checks_*_by_at, where *_at is not null)는 그대로 둔다. 해제된 행이
--   조금 더 들어갈 뿐이고, 조회 조건에 *_at 범위가 있어 인덱스는 계속 쓰인다.
alter table public.unit_checks
  add column if not exists light_cleared_at timestamptz,
  add column if not exists laminate_cleared_at timestamptz;
