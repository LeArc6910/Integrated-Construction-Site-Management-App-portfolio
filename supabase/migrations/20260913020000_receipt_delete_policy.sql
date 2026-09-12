-- receipts 버킷에는 업로드·조회 정책만 있고 삭제 정책이 없어서, 지출 기록을 지워도
-- 실제 파일은 스토리지에 그대로 남아있었다. 본인이 올린 파일만 지울 수 있게 허용한다.
-- 업로드 경로가 "{user_id}/파일명" 형태이므로 첫 폴더명으로 소유자를 확인한다.
create policy "영수증 삭제"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (auth.uid())::text);
