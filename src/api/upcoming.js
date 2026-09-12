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

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 반환값: [{ id, name, location, phone, nextVisit, visits: [{ id, date, alarm }] }]
// 방문 예정일이 가까운 현장이 위로 온다.
export async function fetchUpcomingSites() {
  const { data, error } = await supabase
    .from('upcoming_sites')
    .select('id, name, location, phone, upcoming_visits(id, visit_date, alarm_enabled)')
    .order('created_at')
  if (error) throw error

  const today = todayStr()

  return (
    data
      .map((site) => {
        const visits = (site.upcoming_visits ?? [])
          .map((v) => ({ id: v.id, date: v.visit_date, alarm: v.alarm_enabled }))
          .sort((a, b) => a.date.localeCompare(b.date))

        return {
          id: site.id,
          name: site.name,
          location: site.location ?? '',
          phone: site.phone ?? '',
          visits,
          // 오늘 포함 앞으로 가장 가까운 방문일. 지난 일정만 있거나 일정이 없으면 null이다.
          nextVisit: visits.find((v) => v.date >= today)?.date ?? null,
        }
      })
      // 다가오는 방문일 순. 예정이 없는 현장은 뒤로 보내고 등록 순서를 그대로 둔다.
      .sort((a, b) => {
        if (a.nextVisit && b.nextVisit) return a.nextVisit.localeCompare(b.nextVisit)
        if (a.nextVisit) return -1
        if (b.nextVisit) return 1
        return 0
      })
  )
}

export async function createUpcomingSite({ name, location, phone, visits }) {
  const { data, error } = await supabase
    .from('upcoming_sites')
    .insert({ name, location, phone })
    .select('id')
    .single()
  if (error) throw error

  if (visits.length > 0) {
    const { error: visitError } = await supabase
      .from('upcoming_visits')
      .insert(visits.map((v) => ({ upcoming_site_id: data.id, visit_date: v.date, alarm_enabled: v.alarm })))
    if (visitError) throw visitError
  }
}

// 방문일자는 수정 화면에서 자유롭게 추가/삭제되므로, 기존 것을 모두 지우고 현재 목록을 다시 넣는다
export async function updateUpcomingSite({ id, name, location, phone, visits }) {
  const { error } = await supabase.from('upcoming_sites').update({ name, location, phone }).eq('id', id)
  if (error) throw error

  const { error: deleteError } = await supabase.from('upcoming_visits').delete().eq('upcoming_site_id', id)
  if (deleteError) throw deleteError

  if (visits.length > 0) {
    const { error: insertError } = await supabase
      .from('upcoming_visits')
      .insert(visits.map((v) => ({ upcoming_site_id: id, visit_date: v.date, alarm_enabled: v.alarm })))
    if (insertError) throw insertError
  }
}

export async function deleteUpcomingSite({ id }) {
  const { error } = await supabase.from('upcoming_sites').delete().eq('id', id)
  if (error) throw error
}

// 개인 출근체크 달력에 어느 현장을 방문할 예정인지 같이 보여주기 위한 월별 조회.
// 반환값: { 'YYYY-MM-DD': ['A 현장', 'B 현장'] }
export async function fetchMonthVisits({ year, month }) {
  const { from, to } = monthRange(year, month)
  const { data, error } = await supabase
    .from('upcoming_visits')
    .select('visit_date, upcoming_sites(name)')
    .gte('visit_date', from)
    .lte('visit_date', to)
    .order('visit_date')
  if (error) throw error

  const byDate = {}
  data.forEach((visit) => {
    const name = visit.upcoming_sites?.name
    if (!name) return
    if (!byDate[visit.visit_date]) byDate[visit.visit_date] = []
    byDate[visit.visit_date].push(name)
  })
  return byDate
}
