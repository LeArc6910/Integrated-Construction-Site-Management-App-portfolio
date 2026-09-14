-- 세대표 라인(호)에 타입 이름과 시작 층을 추가한다.
--
-- min_floor: 그동안 모든 라인이 1층부터 시작한다고 가정했는데, 2층부터 올라가는 라인이
-- 있는 현장은 세대표를 그릴 수 없었다. 기존 라인은 모두 1층부터였으므로 기본값 1로
-- 채워 넣으면 화면이 지금과 똑같이 보인다.
-- unit_type: 84A 같은 평형 표기. 없는 현장도 있어서 nullable로 둔다.
alter table "public"."building_lines"
  add column if not exists "min_floor" integer not null default 1,
  add column if not exists "unit_type" text;
