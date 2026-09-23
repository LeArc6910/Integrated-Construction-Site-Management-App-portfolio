-- 체크·미타공을 "어느 현장 화면에서" 했는지 남긴다.
--
-- 세대표를 공유하는 현장은 동이 원본 현장에 달려 있어서, 체크와 미타공도 원본의 동에 저장된다.
-- 그래서 공유받은 현장(B)에서 작업해도 작업보고에는 원본 현장(A)으로 나왔다. 작업보고를
-- 본인이 작업한 현장 기준으로 묶으려면 작업한 현장을 따로 기록해야 한다.
--
-- - 경량·합지는 서로 다른 날, 다른 현장 화면에서 체크될 수 있어 작업마다 따로 둔다.
-- - 미타공은 등록한 현장과 처리한 현장을 따로 둔다.
-- - 비어 있으면(이전 버전 앱에서 한 기록, 과거 기록) 지금처럼 원본 현장으로 본다.
-- - 현장은 지우지 않고 보관(archived_at)하지만, 혹시 지워지면 기록은 남기고 값만 비운다.
alter table public.unit_checks
  add column if not exists light_site_id bigint references public.sites (id) on delete set null,
  add column if not exists laminate_site_id bigint references public.sites (id) on delete set null;

alter table public.defects
  add column if not exists created_site_id bigint references public.sites (id) on delete set null,
  add column if not exists resolved_site_id bigint references public.sites (id) on delete set null;
