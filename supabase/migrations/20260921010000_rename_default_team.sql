-- 기본 팀의 이름을 '테라CiC'로 바꾼다.
-- 팀은 id로 묶여 있고(profiles.team_id, 각 테이블의 team_id, 팀 격리 정책 모두 id 기준)
-- 코드 어디에도 '기본팀' 문자열을 쓰는 곳이 없어서, 이름만 바꿔도 데이터는 그대로다.

-- 처음 만들어진 팀(가장 작은 id)이 기존 데이터가 들어간 기본 팀이다.
-- 이름이 이미 바뀌었거나 다시 실행돼도 안전하도록 대상 팀을 id로 찾는다.
update public.teams
   set name = '테라CiC'
 where id = (select min(id) from public.teams)
   and name <> '테라CiC';
