import { idbGet, idbPut, STORES } from '../lib/idb'
import { fetchAllRows, supabase } from '../lib/supabase'
import { sheetOwnerId } from './sheetSharing'

// 세대표 칸을 식별하는 키. 경량/합지 체크는 메인/석고 세대표가 따로 관리된다.
export function checkKey(buildingId, lineNo, floor, sheet) {
  return `${buildingId}-${lineNo}-${floor}-${sheet}`
}

// 미타공은 메인 세대표 기준이라 sheet 구분이 없다.
export function cellKey(buildingId, lineNo, floor) {
  return `${buildingId}-${lineNo}-${floor}`
}

// 오래된 오프라인 캐시에는 min_floor/unit_type/core_label이 없다. 예전처럼 1층부터 시작하고
// 타입·코어 표기가 없는 라인으로 본다.
function normalizeLine(line) {
  return {
    line_no: line.line_no,
    min_floor: line.min_floor ?? 1,
    max_floor: line.max_floor,
    unit_type: line.unit_type ?? null,
    core_label: line.core_label ?? null,
  }
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
      .select('id, name, building_lines(line_no, min_floor, max_floor, unit_type, core_label)')
      .eq('site_id', ownerId)
      .order('sort_order'),
  ])
  if (groupRes.error) throw groupRes.error
  if (buildingsRes.error) throw buildingsRes.error

  const site = { id: siteRes.data.id, name: siteRes.data.name }
  const sharedWith = groupRes.data.filter((row) => row.id !== site.id).map((row) => row.name)
  const ownerName = groupRes.data.find((row) => row.id === ownerId)?.name ?? site.name

  const buildings = buildingsRes.data.map((building) => ({
    id: building.id,
    name: building.name,
    lines: [...building.building_lines].sort((a, b) => a.line_no - b.line_no).map(normalizeLine),
  }))

  const buildingIds = buildings.map((building) => building.id)
  if (buildingIds.length === 0) {
    return { site, ownerId, ownerName, sharedWith, buildings, checks: {}, defects: {} }
  }

  // 큰 현장은 체크 행이 몇천 건이 될 수 있어 range로 나눠 끝까지 읽는다(PostgREST
  // 기본 1000행 한도에 걸리면 뒷부분 체크 상태가 세대표에 조용히 빠져 보인다).
  const [checksRows, defectsRes] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from('unit_checks')
        .select('building_id, line_no, floor, sheet, light, light_by, light_at, laminate, laminate_by, laminate_at')
        .in('building_id', buildingIds)
    ),
    supabase
      .from('defects')
      .select('id, building_id, line_no, floor, locations, content, resolved, created_by, created_at, resolved_by, resolved_at')
      .in('building_id', buildingIds)
      .order('created_at'),
  ])
  if (defectsRes.error) throw defectsRes.error

  const checks = {}
  checksRows.forEach((row) => {
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

// 드래그로 여러 칸을 한 번에 칠할 수 있어서, 체크는 항상 칸 목록을 받아 한 번에 저장한다.
// upsert는 넘긴 컬럼만 갱신하므로 경량을 칠해도 같은 칸의 합지 기록은 그대로 남는다.
export async function setUnitChecks({ cells, sheet, field, value, userId }) {
  if (cells.length === 0) return []
  const now = new Date().toISOString()
  const patch =
    field === 'light'
      ? { light: value, light_by: value ? userId : null, light_at: value ? now : null }
      : { laminate: value, laminate_by: value ? userId : null, laminate_at: value ? now : null }

  const rows = cells.map((cell) => ({
    building_id: cell.buildingId,
    line_no: cell.lineNo,
    floor: cell.floor,
    sheet,
    ...patch,
    updated_at: now,
  }))

  const { data, error } = await supabase
    .from('unit_checks')
    .upsert(rows, { onConflict: 'building_id,line_no,floor,sheet' })
    .select()
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

export async function addUnitLogs({ cells, sheet, action, detail, userId }) {
  if (cells.length === 0) return
  const rows = cells.map((cell) => ({
    building_id: cell.buildingId,
    line_no: cell.lineNo,
    floor: cell.floor,
    sheet,
    action,
    detail,
    actor_id: userId,
  }))
  const { error } = await supabase.from('unit_logs').insert(rows)
  if (error) throw error
}

export async function addUnitLog({ buildingId, lineNo, floor, sheet, action, detail, userId }) {
  await addUnitLogs({ cells: [{ buildingId, lineNo, floor }], sheet, action, detail, userId })
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

// lines는 호 순서대로 { minFloor, maxFloor, unitType, coreLabel }를 담은 배열이다.
function lineRows(buildingId, lines) {
  return lines.map((line, index) => ({
    building_id: buildingId,
    line_no: index + 1,
    min_floor: line.minFloor,
    max_floor: line.maxFloor,
    unit_type: line.unitType || null,
    core_label: line.coreLabel || null,
  }))
}

// 동 이름과 호별 층 범위·타입을 고친다. 호 수가 줄면 남는 라인을 지우고, 늘면 새로 넣는다.
// 체크·미타공은 (building_id, line_no, floor)로 저장돼 있어서 지워지지 않는다. 즉 줄였다가
// 다시 늘리면 예전 기록이 그대로 다시 보인다.
export async function updateBuilding({ buildingId, name, lines }) {
  const { error: nameError } = await supabase.from('buildings').update({ name }).eq('id', buildingId)
  if (nameError) throw nameError

  const { error: deleteError } = await supabase
    .from('building_lines')
    .delete()
    .eq('building_id', buildingId)
    .gt('line_no', lines.length)
  if (deleteError) throw deleteError

  const { error } = await supabase
    .from('building_lines')
    .upsert(lineRows(buildingId, lines), { onConflict: 'building_id,line_no' })
  if (error) throw error
}

export async function createBuilding({ siteId, name, lines }) {
  // 새 동은 항상 맨 뒤에 붙는다.
  const { data: lastRow, error: lastError } = await supabase
    .from('buildings')
    .select('sort_order')
    .eq('site_id', siteId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastError) throw lastError
  const sortOrder = (lastRow?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('buildings')
    .insert({ site_id: siteId, name, sort_order: sortOrder })
    .select('id')
    .single()
  if (error) throw error

  const { error: linesError } = await supabase.from('building_lines').insert(lineRows(data.id, lines))
  if (linesError) throw linesError

  return data.id
}

// 세대표 수정 화면에서 동을 드래그로 재배열한 뒤, 그 순서 그대로 0부터 다시 매긴다.
export async function reorderBuildings({ orderedIds }) {
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('buildings').update({ sort_order: index }).eq('id', id))
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

// building_lines/defects/unit_checks/unit_logs가 모두 building_id에 ON DELETE CASCADE로
// 걸려 있어, 동을 지우면 그 동의 층·세대·미타공·체크 기록이 DB 레벨에서 같이 지워진다.
export async function deleteBuilding({ buildingId }) {
  const { error } = await supabase.from('buildings').delete().eq('id', buildingId)
  if (error) throw error
}
