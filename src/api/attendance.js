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

// 반환값: { [date]: { id, siteId, siteName, hours } }
export async function fetchMonthAttendance({ userId, year, month }) {
  const { from, to } = monthRange(year, month)
  const { data, error } = await supabase
    .from('attendances')
    .select('id, work_date, hours, site_id, sites(name)')
    .eq('user_id', userId)
    .gte('work_date', from)
    .lte('work_date', to)
  if (error) throw error

  return Object.fromEntries(
    data.map((row) => [
      row.work_date,
      { id: row.id, siteId: row.site_id, siteName: row.sites.name, hours: row.hours },
    ])
  )
}

// clientId(클라이언트에서 생성한 UUID)로 upsert해서, 오프라인 큐가 같은 기록을 두 번
// 보내도(재시도 등) 서버에 중복 저장되지 않는다.
export async function checkIn({ userId, date, siteId, hours, clientId }) {
  const { error } = await supabase
    .from('attendances')
    .upsert(
      { user_id: userId, work_date: date, site_id: siteId, hours, client_id: clientId },
      { onConflict: 'client_id', ignoreDuplicates: true }
    )
  if (error) throw error
}

export async function updateAttendance({ id, siteId, hours }) {
  const { error } = await supabase.from('attendances').update({ site_id: siteId, hours }).eq('id', id)
  if (error) throw error
}

export async function cancelAttendance({ id }) {
  const { error } = await supabase.from('attendances').delete().eq('id', id)
  if (error) throw error
}
