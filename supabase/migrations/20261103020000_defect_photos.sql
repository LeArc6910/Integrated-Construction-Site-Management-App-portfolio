-- 미타공 사진 첨부.
--
-- 사진 경로는 defects.photo_paths에 배열로 담는다. 파일은 비공개 버킷 defect-photos에
-- "{building_id}/{uuid}.jpg"로 올린다. 위치를 여러 개 골라 한 번에 등록하면 위치마다 미타공 건이 나뉘는데,
-- 그때 올린 사진은 한 번만 올리고 각 건이 같은 경로를 함께 가리킨다(지울 때는 다른 건이 쓰지 않는지 확인한다).
--
-- 미타공은 세대표처럼 로그인한 팀원이면 누구나 등록·처리한다. 사진도 같은 범위로 연다.
-- 경로 첫 폴더(동 id)가 지금 팀의 동인지로 확인한다. buildings의 RLS(팀 격리)가 이 하위 조회에도 걸린다.
-- buildings에도 name 컬럼이 있어서, 파일 경로는 반드시 objects.name으로 적어야 한다(그냥 name이면 동 이름으로 읽힌다).

alter table public.defects add column if not exists photo_paths text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('defect-photos', 'defect-photos', false)
on conflict (id) do nothing;

drop policy if exists "미타공 사진 조회" on storage.objects;
create policy "미타공 사진 조회" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'defect-photos'
    and exists (select 1 from public.buildings b where b.id::text = (storage.foldername(objects.name))[1])
  );

drop policy if exists "미타공 사진 업로드" on storage.objects;
create policy "미타공 사진 업로드" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'defect-photos'
    and exists (select 1 from public.buildings b where b.id::text = (storage.foldername(objects.name))[1])
  );

drop policy if exists "미타공 사진 삭제" on storage.objects;
create policy "미타공 사진 삭제" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'defect-photos'
    and exists (select 1 from public.buildings b where b.id::text = (storage.foldername(objects.name))[1])
  );

-- 대기 큐가 같은 사진을 다시 보낼 때 덮어쓰기(upsert)로 올리므로 수정 권한도 연다
drop policy if exists "미타공 사진 덮어쓰기" on storage.objects;
create policy "미타공 사진 덮어쓰기" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'defect-photos'
    and exists (select 1 from public.buildings b where b.id::text = (storage.foldername(objects.name))[1])
  )
  with check (
    bucket_id = 'defect-photos'
    and exists (select 1 from public.buildings b where b.id::text = (storage.foldername(objects.name))[1])
  );
