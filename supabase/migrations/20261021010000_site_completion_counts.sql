-- 현장별 총 세대수/완료 세대수를 DB에서 집계한다.
--
-- 왜 필요한가: 현장 목록·결제〉완료 현장 탭은 이 숫자를 보여주려고 회사 전체 세대 체크를 앱으로
-- 전부 내려받아 계산했다. PostgREST는 한 번에 1000행까지만 주므로 체크가 1만 건이면 10번을 차례로
-- 오가야 해서, 체크가 쌓일수록 목록이 느려졌다(2026-10 기준 1~2초). 여기서 세면 결과는 현장 수만큼의
-- 짧은 표 하나라 한 번만 오가면 된다.
--
-- 규칙은 앱에서 하던 계산(src/api/sites.js)과 같다.
-- - 동은 세대표 원본 현장에 달려 있다. 결과도 원본 현장 기준이며, 공유하는 현장은 앱이 원본 값을 가져다 쓴다.
-- - 총 세대수는 라인이 실제로 쓰는 층만 센다(min_floor~max_floor).
-- - 층 범위를 좁히면 범위 밖 체크가 남아 있을 수 있어, 지금 범위 안의 칸만 완료로 센다.
-- - CRC 현장(이름에 CRC)은 light 하나, 그 외는 light·laminate 둘 다 되어야 완료다(src/lib/siteMode.js).
--
-- security invoker라 부른 사람의 권한(RLS·팀 격리)이 그대로 걸린다. 자기 팀 현장만 집계된다.
create or replace function public.site_completion_counts()
returns table (site_id bigint, total_units bigint, completed_units bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with lines as (
    select b.site_id, l.building_id, l.line_no, l.min_floor, l.max_floor
    from public.building_lines l
    join public.buildings b on b.id = l.building_id
  ),
  totals as (
    select lines.site_id, sum(greatest(0, lines.max_floor - lines.min_floor + 1))::bigint as total_units
    from lines
    group by lines.site_id
  ),
  done as (
    select lines.site_id, count(*)::bigint as completed_units
    from public.unit_checks c
    join lines
      on lines.building_id = c.building_id
     and lines.line_no = c.line_no
     and c.floor between lines.min_floor and lines.max_floor
    join public.sites s on s.id = lines.site_id
    where c.sheet = 'main'
      and c.light is true
      and (s.name ~* 'crc' or c.laminate is true)
    group by lines.site_id
  )
  select totals.site_id, totals.total_units, coalesce(done.completed_units, 0)::bigint
  from totals
  left join done on done.site_id = totals.site_id
$$;

revoke execute on function public.site_completion_counts() from public, anon;
grant execute on function public.site_completion_counts() to authenticated;
