-- 예정현장에 준공일을 추가한다. 입력칸에서 받고, 목록 정렬 기준(방문일/이름/준공일)으로 쓴다.
-- 기존 현장은 준공일을 모르는 상태이므로 null을 허용하고, 목록에서는 항상 뒤로 보낸다.
alter table public.upcoming_sites add column if not exists completion_date date;
