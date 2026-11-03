-- CRC 타공 단가, 팀 전체 단가, 계약 금액 전부 자동 계산.
--
-- 1) CRC 단가
--    CRC 현장(세대표 원본 현장 이름에 CRC가 들어간 현장, src/lib/siteMode.js isCrcSite와 같은 기준)은
--    자동 계약 금액을 "전체 타공 × CRC 단가"로 계산한다(월패드·분전/통신함 단가 차이는 쓰지 않는다).
-- 2) 팀 전체 단가(team_hole_prices)
--    현장별 단가(site_hole_prices)를 따로 정하지 않은 현장은 팀 전체 단가를 따른다.
--    전체 단가도 없으면 기본 1000 / 2000 / 3000 / CRC 1000원이다.
-- 3) 계약 금액을 모두 자동 계산으로
--    지금까지 직접 입력해 둔 계약 금액(sites.contract_amount)을 비워 자동 계산 값을 쓰게 한다.
--    이후에도 결제 > 현장 상세에서 직접 입력할 수 있다.

alter table public.site_hole_prices
  add column if not exists crc_price integer not null default 1000 check (crc_price >= 0);

create table if not exists public.team_hole_prices (
  team_id bigint primary key default public.current_team_id() references public.teams (id) on delete cascade,
  base_price integer not null default 1000 check (base_price >= 0),
  wallpad_price integer not null default 2000 check (wallpad_price >= 0),
  panel_price integer not null default 3000 check (panel_price >= 0),
  crc_price integer not null default 1000 check (crc_price >= 0),
  updated_at timestamptz not null default now()
);

alter table public.team_hole_prices enable row level security;

drop policy if exists "전체 타공 단가 관리" on public.team_hole_prices;
create policy "전체 타공 단가 관리" on public.team_hole_prices
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "팀 격리" on public.team_hole_prices;
create policy "팀 격리" on public.team_hole_prices as restrictive for all
  using (team_id = (select public.current_team_id()))
  with check (team_id = (select public.current_team_id()));

grant select, insert, update, delete on public.team_hole_prices to authenticated;

update public.sites set contract_amount = null where contract_amount is not null;

-- 돌려주는 컬럼이 바뀌어서 지우고 다시 만든다
drop function if exists public.site_hole_totals();

-- 세대표 원본 현장별 타공 합계와 단가, 자동 계약 금액.
-- has_site_price: 현장별 단가를 따로 정했는지(false면 팀 전체 단가를 따른다)
create function public.site_hole_totals()
returns table (
  site_id bigint,
  total_holes bigint,
  wallpad_holes bigint,
  panel_holes bigint,
  unset_units bigint,
  base_price integer,
  wallpad_price integer,
  panel_price integer,
  crc_price integer,
  has_site_price boolean,
  is_crc boolean,
  auto_contract bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with units as (
    select b.site_id, l.building_id, l.line_no, f.floor, nullif(trim(l.unit_type), '') as unit_type
    from public.building_lines l
    join public.buildings b on b.id = l.building_id
    cross join lateral generate_series(l.min_floor, l.max_floor) as f (floor)
  ),
  deltas as (
    select uo.building_id, uo.line_no, uo.floor, sum(o.hole_delta) as delta
    from public.unit_options uo
    join public.site_unit_options o on o.id = uo.option_id
    group by uo.building_id, uo.line_no, uo.floor
  ),
  per_unit as (
    select u.site_id, t.hole_count, t.wallpad_count, t.panel_count, coalesce(d.delta, 0) as delta
    from units u
    left join public.site_unit_types t on t.site_id = u.site_id and t.name = u.unit_type
    left join deltas d on d.building_id = u.building_id and d.line_no = u.line_no and d.floor = u.floor
  ),
  totals as (
    select
      per_unit.site_id,
      coalesce(sum(greatest(0, hole_count + delta)) filter (where hole_count is not null), 0)::bigint as total_holes,
      coalesce(sum(wallpad_count) filter (where hole_count is not null), 0)::bigint as wallpad_holes,
      coalesce(sum(panel_count) filter (where hole_count is not null), 0)::bigint as panel_holes,
      count(*) filter (where hole_count is null)::bigint as unset_units
    from per_unit
    group by per_unit.site_id
  ),
  priced as (
    -- 현장 단가 → 팀 전체 단가 → 기본값(1000 / 2000 / 3000 / CRC 1000) 순서로 쓴다
    select
      totals.*,
      coalesce(p.base_price, tp.base_price, 1000) as base,
      coalesce(p.wallpad_price, tp.wallpad_price, 2000) as wallpad,
      coalesce(p.panel_price, tp.panel_price, 3000) as panel,
      coalesce(p.crc_price, tp.crc_price, 1000) as crc,
      p.site_id is not null as own_price,
      coalesce(s.name ~* 'crc', false) as crc_site
    from totals
    left join public.sites s on s.id = totals.site_id
    left join public.site_hole_prices p on p.site_id = totals.site_id
    left join public.team_hole_prices tp on tp.team_id = s.team_id
  )
  select
    priced.site_id,
    priced.total_holes,
    priced.wallpad_holes,
    priced.panel_holes,
    priced.unset_units,
    priced.base,
    priced.wallpad,
    priced.panel,
    priced.crc,
    priced.own_price,
    priced.crc_site,
    case
      when priced.crc_site then priced.total_holes * priced.crc
      else priced.total_holes * priced.base
        + priced.wallpad_holes * (priced.wallpad - priced.base)
        + priced.panel_holes * (priced.panel - priced.base)
    end::bigint
  from priced
$$;

revoke execute on function public.site_hole_totals() from public, anon;
grant execute on function public.site_hole_totals() to authenticated;
