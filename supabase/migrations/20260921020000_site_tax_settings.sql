-- 급여 세금 설정: 실급여 입력값에서 몇 %가 빠진 것으로 볼지 현장별로 정한다.
-- 차액을 계산할 때 이 값으로 "제외 전 금액"을 역산한다(결제 > 인건비 > 급여 세금 설정).
--
-- 기준: 그 사람이 그 현장에서 그 달에 일한 출근일수가 tax_day_threshold 이하면
-- tax_low_percent, 초과하면 tax_high_percent가 빠진 금액으로 본다.

alter table public.sites
  add column if not exists tax_day_threshold numeric not null default 7,
  add column if not exists tax_low_percent numeric not null default 3.3,
  add column if not exists tax_high_percent numeric not null default 9.6;

-- 역산(금액 / (1 - 율))이 0으로 나눠지거나 음수가 되지 않게 막는다.
alter table public.sites
  drop constraint if exists sites_tax_percent_range;
alter table public.sites
  add constraint sites_tax_percent_range check (
    tax_day_threshold >= 0
    and tax_low_percent >= 0 and tax_low_percent < 100
    and tax_high_percent >= 0 and tax_high_percent < 100
  );

-- 현장 수정은 기존 "현장 수정" 정책(is_manager)이 그대로 적용되고, 조회는 로그인한 사람 전부가
-- 할 수 있다. 팀원도 개인 > 대시보드/급여에서 자기 제외 전 금액을 보려면 이 값을 읽어야 한다.
