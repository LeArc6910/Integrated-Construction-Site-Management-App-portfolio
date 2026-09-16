-- 세대표 라인(호)에 코어 정보를 추가한다. 실제 현장 세대표처럼 같은 코어를 쓰는 연속된
-- 라인은 화면에서 한 칸으로 합쳐 보여준다(예: 1~3호 "1 core", 4~5호 "2 core").
-- 코어 정보가 없는 현장도 있어서 nullable로 둔다. 추가 컬럼이라 이전 버전 앱은 이 값을
-- 모른 채 그대로 동작한다.
alter table public.building_lines add column if not exists core_label text;
