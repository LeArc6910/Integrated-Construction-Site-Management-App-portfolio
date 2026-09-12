-- 오프라인 큐가 네트워크 재시도 등으로 같은 기록을 두 번 보내도 서버에 중복 저장되지
-- 않도록, 클라이언트가 생성한 UUID(client_id)를 저장해두고 upsert(onConflict: client_id,
-- ignoreDuplicates: true)로 막는다. 기존 행은 client_id가 비어 있는데, NULL은 서로
-- 충돌하지 않으므로(unique 제약에서 NULL끼리는 다른 값으로 취급) 문제 없다.
alter table public.attendances add column if not exists client_id uuid;
create unique index if not exists attendances_client_id_key on public.attendances (client_id);

alter table public.expenses add column if not exists client_id uuid;
create unique index if not exists expenses_client_id_key on public.expenses (client_id);
