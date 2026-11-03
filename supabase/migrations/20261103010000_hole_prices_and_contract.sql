-- 타공 단가와 계약 금액 자동 계산.
--
-- 1) 타입별 월패드·분전/통신함 수량
--    타입의 타공 수 중 몇 개가 월패드, 몇 개가 분전/통신함 타공인지 적는다. 전체 타공 수는 바뀌지 않는다
--    (타공 20개 타입에 월패드 1개를 적어도 타공은 20개이고, 그중 1개가 월패드 단가로 계산된다).
--    옵션(확장 등)과는 무관하게 타입에만 달린다.
-- 2) 현장별 타공 단가(site_hole_prices)
--    기본 / 월패드 / 분전·통신함 세 가지. 행이 없으면 기본값 1000 / 2000 / 3000원으로 본다.
--    타공 수와 같이 세대표 원본 현장 기준이다(세대표를 공유받는 현장은 원본의 단가·타공 수를 쓴다).
-- 3) 계약 금액 자동 계산(site_hole_totals)
--    계약 금액 = 전체 타공 수 × 기본 단가
--              + 월패드 수 × (월패드 단가 − 기본 단가) + 분전·통신함 수 × (분전 단가 − 기본 단가)
--    sites.contract_amount는 이제 "직접 입력한 값"이고, null이면 자동 계산 값을 쓴다.

alter table public.site_unit_types
  add column if not exists wallpad_count integer not null default 0 check (wallpad_count >= 0),
  add column if not exists panel_count integer not null default 0 check (panel_count >= 0);

-- 타공 수가 정해진 타입은 월패드·분전 수가 전체 타공 수를 넘을 수 없다
alter table public.site_unit_types drop constraint if exists site_unit_types_parts_within_holes;
alter table public.site_unit_types
  add constraint site_unit_types_parts_within_holes
  check (hole_count is null or wallpad_count + panel_count <= hole_count);

create table if not exists public.site_hole_prices (
  site_id bigint primary key references public.sites (id) on delete cascade,
  base_price integer not null default 1000 check (base_price >= 0),
  wallpad_price integer not null default 2000 check (wallpad_price >= 0),
  panel_price integer not null default 3000 check (panel_price >= 0),
  team_id bigint not null default public.current_team_id() references public.teams (id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_site_hole_prices_team on public.site_hole_prices (team_id);
alter table public.site_hole_prices enable row level security;

-- 단가는 현장 타공 현황·결제(팀장 이상)에서만 보고 고친다
drop policy if exists "타공 단가 관리" on public.site_hole_prices;
create policy "타공 단가 관리" on public.site_hole_prices
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists "팀 격리" on public.site_hole_prices;
create policy "팀 격리" on public.site_hole_prices as restrictive for all
  using (team_id = (select public.current_team_id()))
  with check (team_id = (select public.current_team_id()));

grant select, insert, update, delete on public.site_hole_prices to authenticated;

-- 계약 금액: 0은 "아직 안 적음"이었으므로 자동 계산(null)으로 돌린다. 이미 적어 둔 금액은 직접 입력 값으로 남긴다.
alter table public.sites alter column contract_amount drop default;
update public.sites set contract_amount = null where contract_amount = 0;

-- 세대표 원본 현장별 타공 합계와 자동 계약 금액.
-- 세대 타공 수 계산은 앱(src/lib/holes.js unitHoleCount)과 같다: 타입 타공 수 + 옵션 가감, 0 미만은 0.
-- 타입이 없거나 타공 수가 비어 있는 세대는 unset_units로 따로 세고 금액에는 넣지 않는다.
-- security invoker라 부른 사람의 권한(RLS·팀 격리)이 그대로 걸린다.
create or replace function public.site_hole_totals()
returns table (
  site_id bigint,
  total_holes bigint,
  wallpad_holes bigint,
  panel_holes bigint,
  unset_units bigint,
  base_price integer,
  wallpad_price integer,
  panel_price integer,
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
    -- 단가 행이 없으면 테이블 기본값과 같은 1000 / 2000 / 3000원
    select
      totals.*,
      coalesce(p.base_price, 1000) as base,
      coalesce(p.wallpad_price, 2000) as wallpad,
      coalesce(p.panel_price, 3000) as panel
    from totals
    left join public.site_hole_prices p on p.site_id = totals.site_id
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
    (priced.total_holes * priced.base
      + priced.wallpad_holes * (priced.wallpad - priced.base)
      + priced.panel_holes * (priced.panel - priced.base))::bigint
  from priced
$$;

revoke execute on function public.site_hole_totals() from public, anon;
grant execute on function public.site_hole_totals() to authenticated;
