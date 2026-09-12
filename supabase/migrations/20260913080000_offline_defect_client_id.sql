-- 미타공 등록도 오프라인 큐 대상이라, attendances/expenses와 같은 방식으로 client_id
-- 기반 중복 방지가 필요하다. unit_checks는 (building_id, line_no, floor, sheet) 기준
-- upsert라서 이미 자연히 멱등이라 별도 컬럼이 필요 없다.
alter table public.defects add column if not exists client_id uuid;
create unique index if not exists defects_client_id_key on public.defects (client_id);
