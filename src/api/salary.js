import { deleteReceipt } from './expense'
import { supabase } from '../lib/supabase'

// 실급여 = 본인이 개인 > 급여에 입력한 수령 급여(salary_entries)를 사람·일한 달 단위로 더한 값.
// 한 달에 여러 현장에서 받았으면 현장별로 여러 건이 있다.

// 목록 조회와 제외 전 금액 계산은 src/api/salaryTax.js가 맡는다(세율이 현장·출근일수에 걸려 있어서
// 조회와 계산을 떼어놓으면 화면마다 기준이 어긋난다). 여기에는 입력/수정/삭제만 남긴다.

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
