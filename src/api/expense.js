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

export async function fetchMonthExpenses({ userId, year, month }) {
  const { from, to } = monthRange(year, month)
  const { data, error } = await supabase
    .from('expenses')
    .select('id, spent_on, place, content, amount, receipt_path')
    .eq('user_id', userId)
    .gte('spent_on', from)
    .lte('spent_on', to)
    .order('spent_on')
  if (error) throw error

  return data.map((row) => ({
    id: row.id,
    date: row.spent_on,
    place: row.place,
    content: row.content,
    amount: row.amount,
    receiptPath: row.receipt_path,
  }))
}

// 원본 파일명을 경로에 그대로 쓰면 한글·공백·괄호 등으로 storage key가 유효하지 않다는
// 에러가 나서, 확장자만 남기고 나머지는 uuid로 생성한다.
function safeExtension(filename) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename)
  return match ? match[1].toLowerCase() : 'bin'
}

export async function uploadReceipt({ userId, file }) {
  const path = `${userId}/${crypto.randomUUID()}.${safeExtension(file.name)}`
  const { error } = await supabase.storage.from('receipts').upload(path, file)
  if (error) throw error
  return path
}

export async function getReceiptUrl(path) {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteReceipt(path) {
  if (!path) return
  const { error } = await supabase.storage.from('receipts').remove([path])
  if (error) throw error
}

// clientId(클라이언트에서 생성한 UUID)로 upsert해서, 오프라인 큐가 같은 기록을 두 번
// 보내도(재시도 등) 서버에 중복 저장되지 않는다.
export async function addExpense({ userId, date, place, content, amount, receiptPath, clientId }) {
  const { error } = await supabase.from('expenses').upsert(
    { user_id: userId, spent_on: date, place, content, amount, receipt_path: receiptPath, client_id: clientId },
    { onConflict: 'client_id', ignoreDuplicates: true }
  )
  if (error) throw error
}

export async function updateExpense({ id, date, place, content, amount, receiptPath }) {
  const { error } = await supabase
    .from('expenses')
    .update({ spent_on: date, place, content, amount, receipt_path: receiptPath })
    .eq('id', id)
  if (error) throw error
}

export async function deleteExpense({ id, receiptPath }) {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
  await deleteReceipt(receiptPath)
}
