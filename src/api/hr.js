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

function sumByUser(rows, field) {
  const byUser = {}
  rows.forEach((row) => {
    byUser[row.user_id] = (byUser[row.user_id] ?? 0) + Number(row[field])
  })
  return byUser
}

// 단가를 수정해도 과거 달 계산이 최신 단가로 바뀌지 않도록, 연/월별 이력(profile_rate_history)
// 중 그 달 1일 기준으로 가장 최근 적용된 값을 찾는다. 이력이 아예 없으면 0(미설정)으로 본다.
function effectiveRate(historyRows, userId, year, month) {
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

// 인사관리 목록: 인원별 그 달 출근일수·지출비용·단가·권한
export async function fetchHrList({ year, month }) {
  const { from, to } = monthRange(year, month)
  const [profilesRes, attendancesRes, expensesRes, rateHistoryRes] = await Promise.all([
    supabase.from('profiles').select('id, name, role').order('name'),
    supabase.from('attendances').select('user_id, hours').gte('work_date', from).lte('work_date', to),
    supabase.from('expenses').select('user_id, amount').gte('spent_on', from).lte('spent_on', to),
    supabase.from('profile_rate_history').select('user_id, year, month, rate'),
  ])

  const error = profilesRes.error || attendancesRes.error || expensesRes.error || rateHistoryRes.error
  if (error) throw error

  const daysByUser = sumByUser(attendancesRes.data, 'hours')
  const expenseByUser = sumByUser(expensesRes.data, 'amount')

  return profilesRes.data.map((profile) => ({
    userId: profile.id,
    name: profile.name,
    role: profile.role,
    rate: effectiveRate(rateHistoryRes.data, profile.id, year, month),
    days: daysByUser[profile.id] ?? 0,
    expenseTotal: expenseByUser[profile.id] ?? 0,
  }))
}

export async function fetchHrProfile({ userId }) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, rate')
    .eq('id', userId)
    .single()
  if (error) throw error
  return { userId: data.id, name: data.name, role: data.role, rate: data.rate }
}

// profiles.rate 컬럼은 authenticated의 직접 UPDATE 권한을 막아뒀다. 단가 수정은 항상
// update_profile_rate RPC(팀장 이상 검증)로, 적용 연/월과 함께 이력에 남긴다.
export async function updateRate({ userId, rate, year, month }) {
  const { error } = await supabase.rpc('update_profile_rate', {
    target_user_id: userId,
    new_rate: rate,
    target_year: year,
    target_month: month,
  })
  if (error) throw error
}

// role은 DB 트리거로 개발자 권한 계정만 실제로 반영된다 (prevent_self_role_change)
export async function updateRole({ userId, role }) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}
