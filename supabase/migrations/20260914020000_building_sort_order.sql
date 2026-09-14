-- 세대표 수정에서 동 순서를 드래그로 바꿀 수 있게, 정렬 기준 컬럼을 추가한다.
-- 지금까지는 이름순 고정이었으니, 기존 동은 그 순서 그대로 초기값을 채운다.
alter table public.buildings add column if not exists sort_order integer;

update public.buildings b
set sort_order = sub.rn
from (
  select id, row_number() over (partition by site_id order by name) - 1 as rn
  from public.buildings
  where sort_order is null
) sub
where b.id = sub.id;

alter table public.buildings alter column sort_order set default 0;
alter table public.buildings alter column sort_order set not null;
