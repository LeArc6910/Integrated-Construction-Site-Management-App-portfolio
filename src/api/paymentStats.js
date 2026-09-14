import { effectiveRate } from './payment'
import { supabase } from '../lib/supabase'

function pad2(n) {
  return String(n).padStart(2, '0')
}

// 'year' 모드면 그 해 1/1~12/31, 'month' 모드면 선택한 달만.
function periodRange(mode, year, month) {
  if (mode === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
  const lastDay = new Date(year, month, 0).getDate()
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(lastDay)}` }
}

function periodMonths(mode, month) {
  return mode === 'year' ? Array.from({ length: 12 }, (_, i) => i + 1) : [month]
}

// 매출(계약금액·수령금액), 매입(급여·지출), 단기 순이익을 연 단위 또는 월 단위로 본다.
// 계약금액은 현장 계약 시 정해지는 한 번뿐인 값이라 기간과 무관하게 전체 합산이다.
// 매입(급여·지출)은 현장별로 나뉘지 않는 값이라 전체 대시보드에만 있고, 하단 현장별
// 표에는 현장에 귀속되는 매출(계약금액·수령금액)만 보여준다.
// 급여는 실제 입력된 실급여가 아니라, 인건비 탭과 같은 기준(그 달 출근일수 × 그 달
// 유효 단가)으로 계산한 값이다. 연 단위일 땐 달마다 유효했던 단가가 다를 수 있어
// 달별로 따로 계산해서 더한다.
export async function fetchPaymentStats({ mode, year, month }) {
  const { from, to } = periodRange(mode, year, month)
  const months = periodMonths(mode, month)

  const [sitesRes, receiptsRes, profilesRes, attendancesRes, rateHistoryRes, expensesRes] = await Promise.all([
    supabase.from('sites').select('id, name, contract_amount').is('archived_at', null).order('name'),
    supabase.from('site_receipts').select('site_id, amount').eq('year', year).in('month', months),
    supabase.from('profiles').select('id, name').order('name'),
    supabase.from('attendances').select('user_id, hours, work_date').gte('work_date', from).lte('work_date', to),
    supabase.from('profile_rate_history').select('user_id, year, month, rate'),
    supabase.from('expenses').select('user_id, amount').gte('spent_on', from).lte('spent_on', to),
  ])

  const error =
    sitesRes.error ||
    receiptsRes.error ||
    profilesRes.error ||
    attendancesRes.error ||
    rateHistoryRes.error ||
    expensesRes.error
  if (error) throw error

  const receivedBySite = {}
  receiptsRes.data.forEach((r) => {
    receivedBySite[r.site_id] = (receivedBySite[r.site_id] ?? 0) + r.amount
  })

  // 사람 × 달 단위로 출근일수를 모아서, 그 달에 유효했던 단가를 곱한다.
  const hoursByUserMonth = {}
  attendancesRes.data.forEach((row) => {
    const rowMonth = Number(row.work_date.slice(5, 7))
    const key = `${row.user_id}-${rowMonth}`
    hoursByUserMonth[key] = (hoursByUserMonth[key] ?? 0) + Number(row.hours)
  })

  const expenseByUser = {}
  expensesRes.data.forEach((e) => {
    expenseByUser[e.user_id] = (expenseByUser[e.user_id] ?? 0) + e.amount
  })

  // 대시보드 카드를 눌렀을 때 그 계산에 쓰인 인원별 급여·지출 목록을 보여주기 위해
  // 0인 사람은 걸러내고 이름순으로 남긴다.
  const byPerson = profilesRes.data
    .map((profile) => {
      let salary = 0
      months.forEach((m) => {
        const days = hoursByUserMonth[`${profile.id}-${m}`] ?? 0
        if (days === 0) return
        salary += days * effectiveRate(rateHistoryRes.data, profile.id, year, m)
      })
      return { userId: profile.id, name: profile.name, salary, expense: expenseByUser[profile.id] ?? 0 }
    })
    .filter((p) => p.salary > 0 || p.expense > 0)

  const salaryTotal = byPerson.reduce((sum, p) => sum + p.salary, 0)
  const expenseTotal = byPerson.reduce((sum, p) => sum + p.expense, 0)
  const purchaseTotal = salaryTotal + expenseTotal

  const bySite = sitesRes.data.map((site) => ({
    id: site.id,
    name: site.name,
    contractAmount: site.contract_amount ?? 0,
    received: receivedBySite[site.id] ?? 0,
  }))

  // 합계는 항상 bySite(보관되지 않은 현장만)에서 뽑아야 한다. 원본 쿼리 결과를 그대로
  // 더하면, 이미 보관 처리된 현장에 남아있는 계약금액·영수증까지 합계에 끼어들어
  // "합계는 있는데 목록엔 안 보이는" 모순이 생긴다.
  const contractTotal = bySite.reduce((sum, s) => sum + s.contractAmount, 0)
  const receivedTotal = bySite.reduce((sum, s) => sum + s.received, 0)

  return {
    summary: {
      contractTotal,
      receivedTotal,
      salaryTotal,
      expenseTotal,
      purchaseTotal,
      netProfit: receivedTotal - purchaseTotal,
    },
    bySite,
    byPerson,
  }
}
