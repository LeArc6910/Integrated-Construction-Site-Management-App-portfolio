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

// 반환값: { [date]: [{ id, siteId, siteName, hours, half }, ...] }
// 하루에 FULL(하루 종일) 하나 또는 AM/PM(반일) 최대 둘까지 있을 수 있다.
export async function fetchMonthAttendance({ userId, year, month }) {
  const { from, to } = monthRange(year, month)
  const { data, error } = await supabase
    .from('attendances')
    .select('id, work_date, hours, half, site_id, sites(name)')
    .eq('user_id', userId)
    .gte('work_date', from)
    .lte('work_date', to)
  if (error) throw error

  const byDate = {}
  data.forEach((row) => {
    const rec = { id: row.id, siteId: row.site_id, siteName: row.sites.name, hours: row.hours, half: row.half }
    ;(byDate[row.work_date] ??= []).push(rec)
  })
  return byDate
}

// clientId(클라이언트에서 생성한 UUID)로 upsert해서, 오프라인 큐가 같은 기록을 두 번
// 보내도(재시도 등) 서버에 중복 저장되지 않는다.
export async function checkIn({ userId, date, siteId, half, clientId }) {
  const hours = half === 'FULL' ? 1 : 0.5
  const { error } = await supabase
    .from('attendances')
    .upsert(
      { user_id: userId, work_date: date, site_id: siteId, hours, half, client_id: clientId },
      { onConflict: 'client_id', ignoreDuplicates: true }
    )
  if (error) throw error
}

export async function updateAttendance({ id, siteId }) {
  const { error } = await supabase.from('attendances').update({ site_id: siteId }).eq('id', id)
  if (error) throw error
}

export async function cancelAttendance({ id }) {
  const { error } = await supabase.from('attendances').delete().eq('id', id)
  if (error) throw error
}
