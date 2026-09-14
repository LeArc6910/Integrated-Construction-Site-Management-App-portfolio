import { fetchSiteStatusMap } from './sites'
import { supabase } from '../lib/supabase'

function pad2(n) {
  return String(n).padStart(2, '0')
}

// year/month: month는 1~12
function monthRange(year, month) {
  const from = `${year}-${pad2(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${pad2(month)}-${pad2(lastDay)}`
  return { from, to }
}

// 출근일수는 공수(hours) 합계다. 1일 근무가 1, 반일이 0.5로 쌓인다.
function sumHoursByUser(rows) {
  const byUser = {}
  rows.forEach((row) => {
    byUser[row.user_id] = (byUser[row.user_id] ?? 0) + Number(row.hours)
  })
  return byUser
}

function amountByUser(rows) {
  return Object.fromEntries(rows.map((row) => [row.user_id, row.amount]))
}

// 차액은 실제 지급액과의 세전 비교가 아니라 기본공제(3.3%)를 뗀 실수령 기준으로 보여준다.
export function afterWithholding(amount) {
  return Math.floor(amount * 0.967)
}

// 단가를 수정해도 과거 달 급여 계산이 최신 단가로 바뀌지 않도록, 연/월별 이력
// (profile_rate_history) 중 그 달 1일 기준으로 가장 최근 적용된 값을 찾는다.
export function effectiveRate(historyRows, userId, year, month) {
  const target = year * 100 + month
  let best = null
  historyRows.forEach((row) => {
    if (row.user_id !== userId) return
    const key = row.year * 100 + row.month
    if (key > target) return
    if (!best || key > best.key) best = { key, rate: row.rate }
  })
  return best?.rate ?? 0
}

// 이미 특정 인원으로 필터링된 이력 목록에서 그 달 유효 단가만 찾을 때 쓴다.
function rateAt(historyRows, year, month) {
  const target = year * 100 + month
  let best = null
  historyRows.forEach((row) => {
    const key = row.year * 100 + row.month
    if (key > target) return
    if (!best || key > best.key) best = { key, rate: row.rate }
  })
  return best?.rate ?? 0
}

// 수령금액은 선택한 달 기준, 남은금액은 전체 누적 기준이라 영수 내역을 통째로 가져와 두 번 집계한다.
// isCompleted로 세대가 전부 체크된(완료) 현장과 진행 중인 현장을 갈라서 각 탭에 보여준다.
async function loadPaymentSites({ year, month, isCompleted }) {
  const [sitesRes, receiptsRes, statusMap] = await Promise.all([
    supabase.from('sites').select('id, name, contract_amount').is('archived_at', null).order('name'),
    supabase.from('site_receipts').select('site_id, year, month, amount'),
    fetchSiteStatusMap(),
  ])

  const error = sitesRes.error || receiptsRes.error
  if (error) throw error

  const totalBySite = {}
  const monthBySite = {}
  receiptsRes.data.forEach((receipt) => {
    totalBySite[receipt.site_id] = (totalBySite[receipt.site_id] ?? 0) + receipt.amount
    if (receipt.year === year && receipt.month === month) {
      monthBySite[receipt.site_id] = (monthBySite[receipt.site_id] ?? 0) + receipt.amount
    }
  })

  return sitesRes.data
    .filter((site) => (statusMap[site.id]?.status === '완료') === isCompleted)
    .map((site) => ({
      id: site.id,
      name: site.name,
      contractAmount: site.contract_amount ?? 0,
      receivedInMonth: monthBySite[site.id] ?? 0,
      remaining: (site.contract_amount ?? 0) - (totalBySite[site.id] ?? 0),
    }))
}

export async function fetchPaymentSiteList({ year, month }) {
  return loadPaymentSites({ year, month, isCompleted: false })
}

export async function fetchCompletedPaymentSiteList({ year, month }) {
  return loadPaymentSites({ year, month, isCompleted: true })
}

// 인건비 표는 투입인원(site_members) 기준으로 만든다. 급여는 그 현장 그 달 출근일수 × 인사관리 단가.
// 실급여는 사람·월 단위(현장별로 나뉘지 않음)라서 같은 달의 실급여를 그대로 가져다 쓴다.
export async function fetchPaymentSiteDetail({ siteId, year, month }) {
  const { from, to } = monthRange(year, month)
  const [siteRes, receiptsRes, membersRes, attendancesRes, salariesRes, rateHistoryRes] = await Promise.all([
    supabase.from('sites').select('id, name, contract_amount').eq('id', siteId).single(),
    supabase.from('site_receipts').select('id, year, month, amount').eq('site_id', siteId).order('year').order('month'),
    supabase.from('site_members').select('user_id, profiles(name)').eq('site_id', siteId),
    supabase.from('attendances').select('user_id, hours').eq('site_id', siteId).gte('work_date', from).lte('work_date', to),
    supabase.from('actual_salaries').select('user_id, amount').eq('year', year).eq('month', month),
    supabase.from('profile_rate_history').select('user_id, year, month, rate'),
  ])

  const error =
    siteRes.error ||
    receiptsRes.error ||
    membersRes.error ||
    attendancesRes.error ||
    salariesRes.error ||
    rateHistoryRes.error
  if (error) throw error

  const daysByUser = sumHoursByUser(attendancesRes.data)
  const actualByUser = amountByUser(salariesRes.data)
  const totalReceived = receiptsRes.data.reduce((sum, r) => sum + r.amount, 0)

  const labor = membersRes.data
    .map((member) => {
      const days = daysByUser[member.user_id] ?? 0
      const salary = days * effectiveRate(rateHistoryRes.data, member.user_id, year, month)
      const actual = actualByUser[member.user_id] ?? 0
      return {
        userId: member.user_id,
        name: member.profiles.name,
        days,
        salary,
        actual,
        gap: afterWithholding(salary - actual),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    id: siteRes.data.id,
    name: siteRes.data.name,
    contractAmount: siteRes.data.contract_amount ?? 0,
    remaining: (siteRes.data.contract_amount ?? 0) - totalReceived,
    receipts: receiptsRes.data,
    labor,
  }
}

// 투입인원 추가 모달에서 고를 후보. 이미 투입된 인원은 화면에서 걸러낸다.
export async function fetchAllProfiles() {
  const { data, error } = await supabase.from('profiles').select('id, name').order('name')
  if (error) throw error
  return data
}

export async function addSiteMember({ siteId, userId }) {
  const { error } = await supabase.from('site_members').insert({ site_id: siteId, user_id: userId })
  if (error) throw error
}

// 투입인원에서 빼도 출근 기록은 그대로 남는다. 인건비 표에서만 사라진다.
export async function removeSiteMember({ siteId, userId }) {
  const { error } = await supabase.from('site_members').delete().eq('site_id', siteId).eq('user_id', userId)
  if (error) throw error
}

export async function updateContractAmount({ siteId, amount }) {
  const { error } = await supabase.from('sites').update({ contract_amount: amount }).eq('id', siteId)
  if (error) throw error
}

export async function addSiteReceipt({ siteId, year, month, amount }) {
  const { error } = await supabase.from('site_receipts').insert({ site_id: siteId, year, month, amount })
  if (error) throw error
}

export async function deleteSiteReceipt({ id }) {
  const { error } = await supabase.from('site_receipts').delete().eq('id', id)
  if (error) throw error
}

// 인건비 탭: 급여는 인사관리 단가 × 전체 현장 합산 출근일수라 현장으로 거르지 않는다.
export async function fetchLaborList({ year, month }) {
  const { from, to } = monthRange(year, month)
  const [profilesRes, attendancesRes, salariesRes, rateHistoryRes] = await Promise.all([
    supabase.from('profiles').select('id, name').order('name'),
    supabase.from('attendances').select('user_id, hours').gte('work_date', from).lte('work_date', to),
    supabase.from('actual_salaries').select('user_id, amount').eq('year', year).eq('month', month),
    supabase.from('profile_rate_history').select('user_id, year, month, rate'),
  ])

  const error = profilesRes.error || attendancesRes.error || salariesRes.error || rateHistoryRes.error
  if (error) throw error

  const daysByUser = sumHoursByUser(attendancesRes.data)
  const actualByUser = amountByUser(salariesRes.data)

  return profilesRes.data.map((profile) => {
    const days = daysByUser[profile.id] ?? 0
    const rate = effectiveRate(rateHistoryRes.data, profile.id, year, month)
    const salary = days * rate
    const actual = actualByUser[profile.id] ?? 0
    return {
      userId: profile.id,
      name: profile.name,
      rate,
      days,
      salary,
      actual,
      gap: afterWithholding(salary - actual),
    }
  })
}

// 실급여 목록은 월 선택과 무관하게 지금까지 입력된 전체를 최신순으로 보여준다.
// 각 줄에 그 달 급여와의 차액을 붙이려고 출근 기록을 통째로 가져와 월별로 묶는다.
export async function fetchLaborDetail({ userId }) {
  const [profileRes, salariesRes, attendancesRes, rateHistoryRes] = await Promise.all([
    supabase.from('profiles').select('name').eq('id', userId).single(),
    supabase
      .from('actual_salaries')
      .select('id, year, month, amount')
      .eq('user_id', userId)
      .order('year', { ascending: false })
      .order('month', { ascending: false }),
    supabase.from('attendances').select('work_date, hours').eq('user_id', userId),
    supabase.from('profile_rate_history').select('year, month, rate').eq('user_id', userId),
  ])

  const error = profileRes.error || salariesRes.error || attendancesRes.error || rateHistoryRes.error
  if (error) throw error

  const daysByMonth = {}
  attendancesRes.data.forEach((row) => {
    const key = row.work_date.slice(0, 7) // 'YYYY-MM'
    daysByMonth[key] = (daysByMonth[key] ?? 0) + Number(row.hours)
  })

  const rateHistory = rateHistoryRes.data
  // 실급여 목록의 각 줄은 그 줄의 연/월 당시 유효했던 단가로 계산한다(지금 단가가 아님).
  const salaries = salariesRes.data.map((row) => {
    const days = daysByMonth[`${row.year}-${pad2(row.month)}`] ?? 0
    const salary = days * rateAt(rateHistory, row.year, row.month)
    return { ...row, days, salary, gap: afterWithholding(salary - row.amount) }
  })

  return { name: profileRes.data.name, rateHistory, salaries }
}

// 인건비 상세 화면 상단 대시보드는 선택된 연/월 기준으로 단가를 보여준다.
export function rateForMonth(rateHistory, year, month) {
  return rateAt(rateHistory, year, month)
}

export async function deleteActualSalary({ id }) {
  const { error } = await supabase.from('actual_salaries').delete().eq('id', id)
  if (error) throw error
}

// (user_id, year, month) 유니크 제약이 있어서 같은 달에 다시 입력하면 덮어쓴다.
export async function saveActualSalary({ userId, year, month, amount }) {
  const { error } = await supabase
    .from('actual_salaries')
    .upsert({ user_id: userId, year, month, amount }, { onConflict: 'user_id,year,month' })
  if (error) throw error
}
