-- 20260914010000에서 "revoke update (rate) on profiles from authenticated"만 했는데,
-- Postgres는 테이블 레벨 UPDATE 권한(GRANT ALL ON TABLE ... TO authenticated로 이미 부여돼
-- 있던 것)이 있으면 그게 모든 컬럼에 대한 UPDATE를 포괄해서, 컬럼 레벨 revoke만으로는
-- 막히지 않는다. 실제로 테스트해보니(db advisors/query로 직접 확인) authenticated가
-- 여전히 rate 컬럼을 포함해 UPDATE 권한을 갖고 있었다 — 이전 조치가 무력화된 상태였음.
--
-- 올바른 방법: 테이블 레벨 UPDATE 권한을 통째로 회수하고, 클라이언트가 실제로 직접
-- 고치는 컬럼(name, phone)과 트리거로 이미 보호되는 컬럼(role, is_test_account)만
-- 다시 컬럼 단위로 내준다. rate는 제외해서 update_profile_rate RPC로만 가능하게 한다.
revoke update on public.profiles from authenticated;
grant update (name, phone, role, is_test_account) on public.profiles to authenticated;
