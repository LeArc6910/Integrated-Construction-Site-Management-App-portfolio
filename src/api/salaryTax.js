import { fetchAllRows, supabase } from '../lib/supabase'

// 실급여로 입력하는 금액은 세금이 빠진 뒤 실제로 받은 돈이다. 급여(출근일수 × 단가)는 세금을
// 떼기 전 금액이라 둘을 그대로 빼면 세금만큼 차이가 난다. 그래서 실급여를 "제외 전 금액"으로
// 되돌린 뒤 비교한다.
//
// 몇 %가 빠진 것으로 볼지는 그 사람이 그 현장에서 그 달에 일한 출근일수로 정한다.
// 기준 일수 이하면 낮은 %, 초과하면 높은 %(기본 7일 / 3.3% / 9.6%).
// 현장마다 다를 수 있어서 결제 > 인건비 > 급여 세금 설정에서 현장별로 바꾼다.

export const DEFAULT_TAX = { dayThreshold: 7, lowPercent: 3.3, highPercent: 9.6 }

function pad2(n) {
  return String(n).padStart(2, '0')
}

function monthRange(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  return { from: `${year}-${pad2(month)}-01`, to: `${year}-${pad2(month)}-${pad2(lastDay)}` }
}

// 기준 일수 "이하"면 낮은 %, "초과"면 높은 %. 기준이 7일이면 7일은 낮은 쪽, 7.5일은 높은 쪽이다.
export function taxPercentFor(days, tax = DEFAULT_TAX) {
  return Number(days) > Number(tax.dayThreshold) ? Number(tax.highPercent) : Number(tax.lowPercent)
}

// 받은 금액 → 세금 제외 전 금액. 10원 단위로 올린다(1원 자리를 올림).
// 입력값 자체가 이미 원 단위로 정리된 금액이라 역산에는 수십 원 오차가 있을 수 있다.
export function grossUp(amount, percent) {
  const net = Number(amount) || 0
  if (net <= 0) return 0
  const rate = 1 - Number(percent) / 100
  if (!(rate > 0)) return net
  return Math.ceil(net / rate / 10) * 10
}

function toTax(site) {
  return {
    dayThreshold: Number(site.tax_day_threshold ?? DEFAULT_TAX.dayThreshold),
    lowPercent: Number(site.tax_low_percent ?? DEFAULT_TAX.lowPercent),
    highPercent: Number(site.tax_high_percent ?? DEFAULT_TAX.highPercent),
  }
}

// 현장별 세금 설정 맵 { [siteId]: { dayThreshold, lowPercent, highPercent } }.
// 보관된 현장도 과거 달 계산에 필요해서 함께 가져온다.
export async function fetchSiteTaxMap() {
  const { data, error } = await supabase
    .from('sites')
    .select('id, tax_day_threshold, tax_low_percent, tax_high_percent')
  if (error) throw error
  return Object.fromEntries(data.map((site) => [site.id, toTax(site)]))
}

// 급여 세금 설정 화면 목록. 현장관리 목록과 같은 기준(보관되지 않은 현장)으로 보여준다.
export async function fetchTaxSettingList() {
  const { data, error } = await supabase
    .from('sites')
    .select('id, name, tax_day_threshold, tax_low_percent, tax_high_percent')
    .is('archived_at', null)
    .order('name')
  if (error) throw error
  return data.map((site) => ({ id: site.id, name: site.name, ...toTax(site) }))
}

export async function updateSiteTax({ siteId, dayThreshold, lowPercent, highPercent }) {
  const { error } = await supabase
    .from('sites')
    .update({
      tax_day_threshold: dayThreshold,
      tax_low_percent: lowPercent,
      tax_high_percent: highPercent,
    })
    .eq('id', siteId)
  if (error) throw error
}

// 사람·현장별 출근일수 { `${userId}:${siteId}`: 공수합계 }. 세율을 고르는 데 쓴다.
// userId를 주면 그 사람 것만 읽는다(팀원은 어차피 본인 기록만 볼 수 있다).
export async function fetchDaysByUserSite({ year, month, userId = null }) {
  const { from, to } = monthRange(year, month)
  const rows = await fetchAllRows(() => {
    let query = supabase.from('attendances').select('user_id, site_id, hours').gte('work_date', from).lte('work_date', to)
    if (userId) query = query.eq('user_id', userId)
    return query
  })
  const days = {}
  rows.forEach((row) => {
    const key = `${row.user_id}:${row.site_id}`
    days[key] = (days[key] ?? 0) + Number(row.hours)
  })
  return days
}

// 실급여 입력 건들을 사람별로 합친다.
// 돌려주는 값: { [userId]: { actual, gross, entries } }
//   actual: 입력한 그대로의 합계, gross: 제외 전 금액 합계, entries: 건별 내역(펼쳐 보기용)
// siteId를 주면 그 현장에서 받은 건만 센다.
export async function fetchSalaryTotalsByUser({ year, month, siteId = null, userId = null }) {
  let query = supabase
    .from('salary_entries')
    .select('id, user_id, site_id, amount, receipt_path, created_at, sites(name)')
    .eq('year', year)
    .eq('month', month)
    .order('created_at')
  if (siteId !== null) query = query.eq('site_id', siteId)
  if (userId !== null) query = query.eq('user_id', userId)

  const [entriesRes, taxBySite, daysByUserSite] = await Promise.all([
    query,
    fetchSiteTaxMap(),
    fetchDaysByUserSite({ year, month, userId }),
  ])
  if (entriesRes.error) throw entriesRes.error

  const byUser = {}
  entriesRes.data.forEach((row) => {
    const amount = Number(row.amount)
    // 현장을 안 고르고 입력한 옛 기록은 출근일수를 짝지을 수 없어 기본 설정·0일로 계산한다
    const tax = taxBySite[row.site_id] ?? DEFAULT_TAX
    const days = daysByUserSite[`${row.user_id}:${row.site_id}`] ?? 0
    const percent = taxPercentFor(days, tax)
    const gross = grossUp(amount, percent)

    const prev = byUser[row.user_id] ?? { actual: 0, gross: 0, entries: [] }
    prev.actual += amount
    prev.gross += gross
    prev.entries.push({
      id: row.id,
      siteId: row.site_id,
      siteName: row.sites?.name ?? null,
      amount,
      days,
      percent,
      gross,
      receiptPath: row.receipt_path,
    })
    byUser[row.user_id] = prev
  })
  return byUser
}

// 개인 화면(대시보드·급여 탭)용. 본인 한 사람의 그 달 실급여만 계산한다.
// 입력된 건이 하나도 없으면 actual을 null(미입력)로 돌려준다.
export async function fetchSalaryTotalsForUser({ userId, year, month }) {
  const byUser = await fetchSalaryTotalsByUser({ year, month, userId })
  return byUser[userId] ?? { actual: null, gross: 0, entries: [] }
}
