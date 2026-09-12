import { idbGet, idbPut, STORES } from '../lib/idb'
import { supabase } from '../lib/supabase'
import { sheetOwnerId } from './sheetSharing'

// 세대표 칸을 식별하는 키. 경량/합지 체크는 메인/석고 세대표가 따로 관리된다.
export function checkKey(buildingId, lineNo, floor, sheet) {
  return `${buildingId}-${lineNo}-${floor}-${sheet}`
}

// 미타공은 메인 세대표 기준이라 sheet 구분이 없다.
export function cellKey(buildingId, lineNo, floor) {
  return `${buildingId}-${lineNo}-${floor}`
}

export function defectSummary(defect) {
  return [(defect.locations ?? []).join(', '), defect.content].filter(Boolean).join(' · ')
}

export async function fetchSiteSheet({ siteId }) {
  const siteRes = await supabase.from('sites').select('id, name, sheet_source_id').eq('id', siteId).single()
  if (siteRes.error) throw siteRes.error

  // 세대표를 공유하는 현장은 동이 원본 현장에 달려 있다. 체크·미타공·기록은 모두
  // building_id로 저장되므로 원본의 동을 읽는 것만으로 데이터가 함께 공유된다.
  const ownerId = sheetOwnerId(siteRes.data)

  const [groupRes, buildingsRes] = await Promise.all([
    supabase
      .from('sites')
      .select('id, name')
      .is('archived_at', null)
      .or(`id.eq.${ownerId},sheet_source_id.eq.${ownerId}`)
      .order('name'),
    supabase
      .from('buildings')
      .select('id, name, building_lines(line_no, max_floor)')
      .eq('site_id', ownerId)
      .order('name'),
  ])
  if (groupRes.error) throw groupRes.error
  if (buildingsRes.error) throw buildingsRes.error

  const site = { id: siteRes.data.id, name: siteRes.data.name }
  const sharedWith = groupRes.data.filter((row) => row.id !== site.id).map((row) => row.name)
  const ownerName = groupRes.data.find((row) => row.id === ownerId)?.name ?? site.name

  const buildings = buildingsRes.data.map((building) => ({
    id: building.id,
    name: building.name,
    lines: [...building.building_lines].sort((a, b) => a.line_no - b.line_no),
  }))

  const buildingIds = buildings.map((building) => building.id)
  if (buildingIds.length === 0) {
    return { site, ownerId, ownerName, sharedWith, buildings, checks: {}, defects: {} }
  }

  const [checksRes, defectsRes] = await Promise.all([
    supabase
      .from('unit_checks')
      .select('building_id, line_no, floor, sheet, light, light_by, light_at, laminate, laminate_by, laminate_at')
      .in('building_id', buildingIds),
    supabase
      .from('defects')
      .select('id, building_id, line_no, floor, locations, content, resolved, created_by, created_at, resolved_by, resolved_at')
      .in('building_id', buildingIds)
      .order('created_at'),
  ])
  if (checksRes.error) throw checksRes.error
  if (defectsRes.error) throw defectsRes.error

  const checks = {}
  checksRes.data.forEach((row) => {
    checks[checkKey(row.building_id, row.line_no, row.floor, row.sheet)] = row
  })

  const defects = {}
  defectsRes.data.forEach((row) => {
    const key = cellKey(row.building_id, row.line_no, row.floor)
    if (!defects[key]) defects[key] = []
    defects[key].push(row)
  })

  return { site, ownerId, ownerName, sharedWith, buildings, checks, defects }
}

async function cacheSiteSheet(siteId, data) {
  await idbPut(STORES.unitSheets, { siteId: String(siteId), data, cachedAt: new Date().toISOString() })
}

async function getCachedSiteSheet(siteId) {
  return idbGet(STORES.unitSheets, String(siteId))
}

// 온라인이면 최신 세대표를 받아와 오프라인 대비용으로 캐시에 저장하고, 오프라인이면
// 마지막으로 캐시된 데이터를 보여준다.
export async function loadSiteSheet({ siteId }) {
  if (navigator.onLine) {
    const data = await fetchSiteSheet({ siteId })
    await cacheSiteSheet(siteId, data)
    return { ...data, offline: false, cachedAt: null }
  }

  const cached = await getCachedSiteSheet(siteId)
  if (!cached) {
    throw new Error('오프라인 상태이며 저장된 세대표 데이터가 없습니다. 온라인 상태에서 한 번 이상 조회해주세요.')
  }
  return { ...cached.data, offline: true, cachedAt: cached.cachedAt }
}

// profiles는 본인·매니저만 조회할 수 있어서, 처리자 이름은 전용 함수로 받아온다.
export async function fetchUserNames() {
  const { data, error } = await supabase.rpc('user_names')
  if (error) throw error
  return Object.fromEntries(data.map((row) => [row.id, row.name]))
}

export async function setUnitCheck({ buildingId, lineNo, floor, sheet, field, value, userId }) {
  const now = new Date().toISOString()
  const patch =
    field === 'light'
      ? { light: value, light_by: value ? userId : null, light_at: value ? now : null }
      : { laminate: value, laminate_by: value ? userId : null, laminate_at: value ? now : null }

  const { data, error } = await supabase
    .from('unit_checks')
    .upsert(
      { building_id: buildingId, line_no: lineNo, floor, sheet, ...patch, updated_at: now },
      { onConflict: 'building_id,line_no,floor,sheet' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function clearUnitCheck({ buildingId, lineNo, floor, sheet }) {
  const { data, error } = await supabase
    .from('unit_checks')
    .upsert(
      {
        building_id: buildingId,
        line_no: lineNo,
        floor,
        sheet,
        light: false,
        light_by: null,
        light_at: null,
        laminate: false,
        laminate_by: null,
        laminate_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'building_id,line_no,floor,sheet' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

// clientId(클라이언트에서 생성한 UUID)로 upsert해서, 오프라인 큐가 같은 등록을 두 번
// 보내도 중복 등록되지 않는다. 중복으로 무시된 경우(ignoreDuplicates)에는 행이 반환되지
// 않으니 maybeSingle을 쓴다.
export async function addDefect({ buildingId, lineNo, floor, locations, content, userId, clientId }) {
  const { data, error } = await supabase
    .from('defects')
    .upsert(
      { building_id: buildingId, line_no: lineNo, floor, locations, content, created_by: userId, client_id: clientId },
      { onConflict: 'client_id', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

export async function resolveDefect({ id, userId }) {
  const { error } = await supabase
    .from('defects')
    .update({ resolved: true, resolved_by: userId, resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteDefect({ id }) {
  const { error } = await supabase.from('defects').delete().eq('id', id)
  if (error) throw error
}

export async function addUnitLog({ buildingId, lineNo, floor, sheet, action, detail, userId }) {
  const { error } = await supabase
    .from('unit_logs')
    .insert({ building_id: buildingId, line_no: lineNo, floor, sheet, action, detail, actor_id: userId })
  if (error) throw error
}

export async function fetchCellLogs({ buildingId, lineNo, floor, sheet }) {
  const { data, error } = await supabase
    .from('unit_logs')
    .select('id, action, detail, actor_id, created_at')
    .eq('building_id', buildingId)
    .eq('line_no', lineNo)
    .eq('floor', floor)
    .eq('sheet', sheet)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// 동 이름과 세대별 최대 층수를 고친다. 세대수가 줄면 남는 라인을 지우고, 늘면 새로 넣는다.
// 체크·미타공은 (building_id, line_no, floor)로 저장돼 있어서 지워지지 않는다. 즉 줄였다가
// 다시 늘리면 예전 기록이 그대로 다시 보인다.
export async function updateBuilding({ buildingId, name, maxFloors }) {
  const { error: nameError } = await supabase.from('buildings').update({ name }).eq('id', buildingId)
  if (nameError) throw nameError

  const { error: deleteError } = await supabase
    .from('building_lines')
    .delete()
    .eq('building_id', buildingId)
    .gt('line_no', maxFloors.length)
  if (deleteError) throw deleteError

  const lines = maxFloors.map((maxFloor, index) => ({
    building_id: buildingId,
    line_no: index + 1,
    max_floor: maxFloor,
  }))
  const { error } = await supabase.from('building_lines').upsert(lines, { onConflict: 'building_id,line_no' })
  if (error) throw error
}

export async function createBuilding({ siteId, name, maxFloors }) {
  const { data, error } = await supabase.from('buildings').insert({ site_id: siteId, name }).select('id').single()
  if (error) throw error

  const lines = maxFloors.map((maxFloor, index) => ({
    building_id: data.id,
    line_no: index + 1,
    max_floor: maxFloor,
  }))
  const { error: linesError } = await supabase.from('building_lines').insert(lines)
  if (linesError) throw linesError

  return data.id
}
