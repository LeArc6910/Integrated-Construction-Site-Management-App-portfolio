-- 현장에는 동·세대표·출역·영수증이 전부 ON DELETE CASCADE로 딸려 있어서 행을 실제로 지우면
-- 되돌릴 방법이 없다. 보관 시각만 남기는 소프트 삭제로 처리하고 목록 조회에서 제외한다.
-- archived_at이 null이면 사용 중인 현장, 값이 있으면 삭제(보관)된 현장이다.
alter table public.sites add column if not exists archived_at timestamptz;

-- 목록 조회가 항상 archived_at is null로 걸러지므로 부분 인덱스로 받쳐둔다.
create index if not exists sites_active_idx on public.sites (id) where archived_at is null;

-- 삭제는 archived_at을 채우는 UPDATE라서 기존 "현장 수정" 정책(is_manager())이
-- 그대로 적용된다. 즉 팀장·개발자만 현장을 삭제할 수 있고 별도 정책이 필요 없다.
