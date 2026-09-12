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

// 인사관리 목록: 인원별 그 달 출근일수·지출비용·단가·권한
export async function fetchHrList({ year, month }) {
  const { from, to } = monthRange(year, month)
  const [profilesRes, attendancesRes, expensesRes] = await Promise.all([
    supabase.from('profiles').select('id, name, role, rate').order('name'),
    supabase.from('attendances').select('user_id, hours').gte('work_date', from).lte('work_date', to),
    supabase.from('expenses').select('user_id, amount').gte('spent_on', from).lte('spent_on', to),
  ])

  const error = profilesRes.error || attendancesRes.error || expensesRes.error
  if (error) throw error

  const daysByUser = sumByUser(attendancesRes.data, 'hours')
  const expenseByUser = sumByUser(expensesRes.data, 'amount')

  return profilesRes.data.map((profile) => ({
    userId: profile.id,
    name: profile.name,
    role: profile.role,
    rate: profile.rate,
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

export async function updateRate({ userId, rate }) {
  const { error } = await supabase.from('profiles').update({ rate }).eq('id', userId)
  if (error) throw error
}

// role은 DB 트리거로 개발자 권한 계정만 실제로 반영된다 (prevent_self_role_change)
export async function updateRole({ userId, role }) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  if (error) throw error
}
