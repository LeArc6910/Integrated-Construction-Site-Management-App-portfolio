import { cached } from '../lib/cachedCall'
import { supabase } from '../lib/supabase'

// 삭제된 현장은 archived_at에 보관 시각이 찍힌다. 목록은 항상 사용 중인 현장만 보여준다.
export const fetchSites = cached('fetchSites', fetchSitesFromServer)
async function fetchSitesFromServer() {
  const { data, error } = await supabase.from('sites').select('id, name').is('archived_at', null).order('name')
  if (error) throw error
  return data
}

// 총 세대수/완료 세대수는 DB 함수(site_completion_counts)가 세대표 원본 현장별로 집계해 준다.
// 예전에는 회사 전체 세대 체크를 앱으로 전부 받아 직접 셌는데, 1000행씩 나눠 차례로 받느라
// 체크가 쌓일수록 목록이 느려졌다(2026-10). 세대표를 공유하는 현장은 원본의 값을 그대로 쓴다.
async function fetchCompletionByOwner() {
  const { data, error } = await supabase.rpc('site_completion_counts')
  if (error) throw error
  const totalByOwner = {}
  const completedByOwner = {}
  data.forEach((row) => {
    totalByOwner[row.site_id] = Number(row.total_units)
    completedByOwner[row.site_id] = Number(row.completed_units)
  })
  return { totalByOwner, completedByOwner }
}

// 현장 id → 세대표 원본 현장 id. sites는 { id, sheet_source_id }만 있으면 된다.
function ownerMapOf(sites) {
  return Object.fromEntries(sites.map((site) => [site.id, site.sheet_source_id ?? site.id]))
}

// 결제〉완료 현장 탭처럼 현장별 완료 상태만 필요한 곳에서 쓴다.
export async function fetchSiteStatusMap() {
  const [sitesRes, { totalByOwner, completedByOwner }] = await Promise.all([
    supabase.from('sites').select('id, sheet_source_id').is('archived_at', null),
    fetchCompletionByOwner(),
  ])
  if (sitesRes.error) throw sitesRes.error
  const ownerBySite = ownerMapOf(sitesRes.data)

  return Object.fromEntries(
    sitesRes.data.map((site) => {
      const owner = ownerBySite[site.id]
      const total = totalByOwner[owner] ?? 0
      const completed = completedByOwner[owner] ?? 0
      return [site.id, { total, completed, status: total > 0 && completed === total ? '완료' : '진행중' }]
    })
  )
}

export const fetchSiteList = cached('fetchSiteList', fetchSiteListFromServer)
async function fetchSiteListFromServer({ userId }) {
  // 모두 서로 기다릴 필요가 없어 한 번에 보낸다(서버를 한 번만 오가는 시간에 끝난다)
  const [sitesRes, defectsRes, favoritesRes, buildingsRes, { totalByOwner, completedByOwner }] = await Promise.all([
    supabase.from('sites').select('id, name, sheet_source_id').is('archived_at', null),
    supabase.from('defects').select('building_id, line_no, floor').eq('resolved', false),
    supabase.from('site_favorites').select('site_id').eq('user_id', userId),
    // 미타공은 동 번호로만 와서, 어느 현장 것인지 알려면 동→현장 표가 필요하다
    supabase.from('buildings').select('id, site_id'),
    fetchCompletionByOwner(),
  ])
  const error = sitesRes.error || defectsRes.error || favoritesRes.error || buildingsRes.error
  if (error) throw error

  const siteIdByBuilding = Object.fromEntries(buildingsRes.data.map((b) => [b.id, b.site_id]))
  const ownerBySite = ownerMapOf(sitesRes.data)

  const favoriteSiteIds = new Set(favoritesRes.data.map((f) => f.site_id))

  // 동은 항상 세대표 원본 현장에 달려 있다. 세대표를 공유하는 현장은 원본의 집계를
  // 그대로 가져다 쓰므로, 집계는 현장별이 아니라 원본별로 한 번만 한다.
  const nameById = Object.fromEntries(sitesRes.data.map((site) => [site.id, site.name]))

  const groupByOwner = {}
  sitesRes.data.forEach((site) => {
    const owner = ownerBySite[site.id]
    if (!groupByOwner[owner]) groupByOwner[owner] = []
    groupByOwner[owner].push(site.id)
  })

  // 같은 세대에 미처리 미타공이 여러 건이어도 세대 단위로 한 건만 센다
  const defectCellKeys = new Set()
  const defectsByOwner = {}
  defectsRes.data.forEach((defect) => {
    const cellKey = `${defect.building_id}-${defect.line_no}-${defect.floor}`
    if (defectCellKeys.has(cellKey)) return
    defectCellKeys.add(cellKey)
    const owner = siteIdByBuilding[defect.building_id]
    defectsByOwner[owner] = (defectsByOwner[owner] ?? 0) + 1
  })

  return sitesRes.data
    .map((site) => {
      const owner = ownerBySite[site.id]
      const total = totalByOwner[owner] ?? 0
      const completed = completedByOwner[owner] ?? 0
      return {
        id: site.id,
        name: site.name,
        total,
        completed,
        defectCount: defectsByOwner[owner] ?? 0,
        status: total > 0 && completed === total ? '완료' : '진행중',
        favorite: favoriteSiteIds.has(site.id),
        sharedWith: (groupByOwner[owner] ?? []).filter((id) => id !== site.id).map((id) => nameById[id]),
      }
    })
    .sort((a, b) => b.favorite - a.favorite)
}

export async function setSiteFavorite({ userId, siteId, favorite }) {
  if (favorite) {
    const { error } = await supabase.from('site_favorites').insert({ user_id: userId, site_id: siteId })
    if (error) throw error
  } else {
    const { error } = await supabase.from('site_favorites').delete().eq('user_id', userId).eq('site_id', siteId)
    if (error) throw error
  }
}

export async function createSite({ name }) {
  const { error } = await supabase.from('sites').insert({ name })
  if (error) throw error
}

// 현장을 실제로 지우면 딸린 세대표·출역·영수증까지 cascade로 사라지므로, 보관 시각만 남겨
// 목록에서 감춘다. 팀장·개발자가 아니면 RLS의 "현장 수정" 정책에서 막힌다.
export async function archiveSite({ siteId }) {
  const { error } = await supabase
    .from('sites')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', siteId)
    .is('archived_at', null)
  if (error) throw error
}
