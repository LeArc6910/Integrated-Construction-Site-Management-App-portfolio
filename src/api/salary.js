import { deleteReceipt } from './expense'
import { supabase } from '../lib/supabase'

// 실급여 = 본인이 개인 > 급여에 입력한 수령 급여(salary_entries)를 사람·일한 달 단위로 더한 값.
// 한 달에 여러 현장에서 받았으면 현장별로 여러 건이 있다.

function sumAmounts(rows) {
  return rows.reduce((sum, row) => sum + Number(row.amount), 0)
}

// 개인 > 급여 목록. 기존 실급여에서 옮겨온 건은 현장이 없다(site_id null).
export async function fetchMonthSalaryEntries({ userId, year, month }) {
  const { data, error } = await supabase
    .from('salary_entries')
    .select('id, site_id, year, month, amount, receipt_path, created_at, sites(name)')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .order('created_at')
  if (error) throw error

  return data.map((row) => ({
    id: row.id,
    siteId: row.site_id,
    siteName: row.sites?.name ?? null,
    year: row.year,
    month: row.month,
    amount: Number(row.amount),
    receiptPath: row.receipt_path,
  }))
}

// 입력된 건이 하나도 없으면 null(미입력)로 돌려준다.
export async function fetchActualSalary({ userId, year, month }) {
  const { data, error } = await supabase
    .from('salary_entries')
    .select('amount')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
  if (error) throw error
  return data.length ? sumAmounts(data) : null
}

// 본인 단가 이력(연/월별). 개인 대시보드에서 그 달 급여(출근일수 × 그 달 유효 단가)를 계산할 때 쓴다.
export async function fetchRateHistory({ userId }) {
  const { data, error } = await supabase
    .from('profile_rate_history')
    .select('user_id, year, month, rate')
    .eq('user_id', userId)
  if (error) throw error
  return data
}

// 증빙 사진은 지출 영수증과 같은 receipts 버킷의 본인 폴더에 올린다(팀장·개발자 조회 가능).
export async function addSalaryEntry({ userId, siteId, year, month, amount, receiptPath, clientId }) {
  const { error } = await supabase.from('salary_entries').upsert(
    { user_id: userId, site_id: siteId, year, month, amount, receipt_path: receiptPath, client_id: clientId },
    { onConflict: 'client_id', ignoreDuplicates: true }
  )
  if (error) throw error
}

export async function updateSalaryEntry({ id, siteId, year, month, amount, receiptPath }) {
  const { error } = await supabase
    .from('salary_entries')
    .update({ site_id: siteId, year, month, amount, receipt_path: receiptPath })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSalaryEntry({ id, receiptPath }) {
  const { error } = await supabase.from('salary_entries').delete().eq('id', id)
  if (error) throw error
  await deleteReceipt(receiptPath)
}

// 인건비 탭·현장 상세 등에서 여러 사람의 실급여를 한 번에 모을 때 쓴다.
// siteId를 주면 그 현장에서 받은 금액만 더한다.
export async function fetchActualSalaryByUser({ year, month, siteId = null }) {
  let query = supabase.from('salary_entries').select('user_id, amount').eq('year', year).eq('month', month)
  if (siteId !== null) query = query.eq('site_id', siteId)
  const { data, error } = await query
  if (error) throw error

  const byUser = {}
  data.forEach((row) => {
    byUser[row.user_id] = (byUser[row.user_id] ?? 0) + Number(row.amount)
  })
  return byUser
}
