import { fetchAllRows, supabase } from '../lib/supabase'

// 삭제된 현장은 archived_at에 보관 시각이 찍힌다. 목록은 항상 사용 중인 현장만 보여준다.
export async function fetchSites() {
  const { data, error } = await supabase.from('sites').select('id, name').is('archived_at', null).order('name')
  if (error) throw error
  return data
}

// 총 세대수/완료 세대수는 buildings·building_lines·unit_checks에 걸쳐 있어서, 몇 개 안
// 되는 규모를 감안해 통째로 가져온 뒤 building_id로 묶어 집계한다. 세대표를 공유하는
// 현장은 동이 원본(owner)에만 달려 있어 원본 기준으로 한 번만 계산한다.
// sites는 { id, sheet_source_id }만 있으면 된다.
async function computeCompletion(sites) {
  const [buildingsRes, linesRes, checks] = await Promise.all([
    supabase.from('buildings').select('id, site_id'),
    supabase.from('building_lines').select('building_id, line_no, min_floor, max_floor'),
    // 회사 전체 체크 수가 몇천 건이 될 수 있어 range로 나눠 끝까지 읽는다(그냥 select면
    // PostgREST 기본 1000행 한도에 걸려 큰 현장의 완료 수가 조용히 덜 잡힌다).
    fetchAllRows(() =>
      supabase.from('unit_checks').select('building_id, line_no, floor, light, laminate').eq('sheet', 'main')
    ),
  ])
  const error = buildingsRes.error || linesRes.error
  if (error) throw error

  const siteIdByBuilding = Object.fromEntries(buildingsRes.data.map((b) => [b.id, b.site_id]))
  const ownerBySite = Object.fromEntries(sites.map((site) => [site.id, site.sheet_source_id ?? site.id]))

  // 라인이 실제로 쓰는 층만 센다. 2층부터 시작하는 라인은 1층이 세대수에 들어가지 않는다.
  const totalByOwner = {}
  const rangeByLine = {}
  linesRes.data.forEach((line) => {
    const min = line.min_floor ?? 1
    rangeByLine[`${line.building_id}-${line.line_no}`] = { min, max: line.max_floor }
    const owner = siteIdByBuilding[line.building_id]
    totalByOwner[owner] = (totalByOwner[owner] ?? 0) + Math.max(0, line.max_floor - min + 1)
  })

  // 층 범위를 좁히면 범위 밖 기록이 남아 있을 수 있다. 완료 수가 총 세대수를 넘지 않도록
  // 지금 세대표에 실제로 보이는 칸만 센다.
  const completedByOwner = {}
  checks.forEach((check) => {
    if (!check.light || !check.laminate) return
    const range = rangeByLine[`${check.building_id}-${check.line_no}`]
    if (!range || check.floor < range.min || check.floor > range.max) return
    const owner = siteIdByBuilding[check.building_id]
    completedByOwner[owner] = (completedByOwner[owner] ?? 0) + 1
  })

  return { siteIdByBuilding, ownerBySite, totalByOwner, completedByOwner }
}

// 결제〉완료 현장 탭처럼 현장별 완료 상태만 필요한 곳에서 쓴다.
export async function fetchSiteStatusMap() {
  const sitesRes = await supabase.from('sites').select('id, sheet_source_id').is('archived_at', null)
  if (sitesRes.error) throw sitesRes.error

  const { ownerBySite, totalByOwner, completedByOwner } = await computeCompletion(sitesRes.data)

  return Object.fromEntries(
    sitesRes.data.map((site) => {
      const owner = ownerBySite[site.id]
      const total = totalByOwner[owner] ?? 0
      const completed = completedByOwner[owner] ?? 0
      return [site.id, { total, completed, status: total > 0 && completed === total ? '완료' : '진행중' }]
    })
  )
}

export async function fetchSiteList({ userId }) {
  const [sitesRes, defectsRes, favoritesRes] = await Promise.all([
    supabase.from('sites').select('id, name, sheet_source_id').is('archived_at', null),
    supabase.from('defects').select('building_id, line_no, floor').eq('resolved', false),
    supabase.from('site_favorites').select('site_id').eq('user_id', userId),
  ])
  const error = sitesRes.error || defectsRes.error || favoritesRes.error
  if (error) throw error

  const { siteIdByBuilding, ownerBySite, totalByOwner, completedByOwner } = await computeCompletion(sitesRes.data)

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
