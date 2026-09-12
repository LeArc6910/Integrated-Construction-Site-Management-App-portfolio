import { supabase } from '../lib/supabase'

// 삭제된 현장은 archived_at에 보관 시각이 찍힌다. 목록은 항상 사용 중인 현장만 보여준다.
export async function fetchSites() {
  const { data, error } = await supabase.from('sites').select('id, name').is('archived_at', null).order('name')
  if (error) throw error
  return data
}

// 총 세대수/완료 세대수/미타공 건수는 buildings·building_lines·unit_checks·defects에
// 걸쳐 있어서, 몇 개 안 되는 현장 규모를 감안해 통째로 가져온 뒤 building_id로 묶어 집계한다.
export async function fetchSiteList({ userId }) {
  const [sitesRes, buildingsRes, linesRes, checksRes, defectsRes, favoritesRes] = await Promise.all([
    supabase.from('sites').select('id, name, sheet_source_id').is('archived_at', null),
    supabase.from('buildings').select('id, site_id'),
    supabase.from('building_lines').select('building_id, max_floor'),
    supabase.from('unit_checks').select('building_id, line_no, floor, light, laminate').eq('sheet', 'main'),
    supabase.from('defects').select('building_id, line_no, floor').eq('resolved', false),
    supabase.from('site_favorites').select('site_id').eq('user_id', userId),
  ])

  const error =
    sitesRes.error || buildingsRes.error || linesRes.error || checksRes.error || defectsRes.error || favoritesRes.error
  if (error) throw error

  const siteIdByBuilding = Object.fromEntries(buildingsRes.data.map((b) => [b.id, b.site_id]))
  const favoriteSiteIds = new Set(favoritesRes.data.map((f) => f.site_id))

  // 동은 항상 세대표 원본 현장에 달려 있다. 세대표를 공유하는 현장은 원본의 집계를
  // 그대로 가져다 쓰므로, 집계는 현장별이 아니라 원본별로 한 번만 한다.
  const nameById = Object.fromEntries(sitesRes.data.map((site) => [site.id, site.name]))
  const ownerBySite = Object.fromEntries(sitesRes.data.map((site) => [site.id, site.sheet_source_id ?? site.id]))

  const groupByOwner = {}
  sitesRes.data.forEach((site) => {
    const owner = ownerBySite[site.id]
    if (!groupByOwner[owner]) groupByOwner[owner] = []
    groupByOwner[owner].push(site.id)
  })

  const totalByOwner = {}
  linesRes.data.forEach((line) => {
    const owner = siteIdByBuilding[line.building_id]
    totalByOwner[owner] = (totalByOwner[owner] ?? 0) + line.max_floor
  })

  const completedByOwner = {}
  checksRes.data.forEach((check) => {
    if (!check.light || !check.laminate) return
    const owner = siteIdByBuilding[check.building_id]
    completedByOwner[owner] = (completedByOwner[owner] ?? 0) + 1
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
