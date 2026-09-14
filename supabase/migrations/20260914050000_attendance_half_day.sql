-- 출근체크에서 오전/오후를 서로 다른 현장으로 따로 체크할 수 있게 한다. half가 없으면
-- (기존처럼) unique(user_id, work_date) 하나뿐이라 하루에 한 기록만 가능했다.
alter table public.attendances add column half text;

-- 기존 1일(hours=1) 기록은 하루 종일로, 0.5일 기록은 오전/오후 구분이 없었으므로
-- 최선의 근사치로 오전(AM)에 배정한다(실제로 오전이었는지 알 방법은 없음).
update public.attendances set half = case when hours = 1 then 'FULL' else 'AM' end where half is null;

alter table public.attendances alter column half set not null;
alter table public.attendances add constraint attendances_half_check check (half in ('AM', 'PM', 'FULL'));

alter table public.attendances drop constraint if exists attendances_user_id_work_date_key;
alter table public.attendances add constraint attendances_user_id_work_date_half_key unique (user_id, work_date, half);
