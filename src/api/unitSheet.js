import { idbGet, idbPut, STORES } from '../lib/idb'
import { fetchAllRows, supabase } from '../lib/supabase'
import { compareBuildingName } from '../lib/unitSheetLayout'
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

  const [groupRes, buildingsRes, sectionsRes] = await Promise.all([
    supabase
      .from('sites')
      .select('id, name')
      .is('archived_at', null)
      .or(`id.eq.${ownerId},sheet_source_id.eq.${ownerId}`)
      .order('name'),
    supabase
      .from('buildings')
      .select('id, name, section_id, building_lines(line_no, min_floor, max_floor, unit_type, core_label)')
      .eq('site_id', ownerId)
      .order('sort_order'),
    // 공구도 동과 함께 원본 현장에 달려 있다
    supabase.from('site_sections').select('id, name').eq('site_id', ownerId).order('sort_order'),
  ])
  if (groupRes.error) throw groupRes.error
  if (buildingsRes.error) throw buildingsRes.error
  if (sectionsRes.error) throw sectionsRes.error

  const site = { id: siteRes.data.id, name: siteRes.data.name }
  const sharedWith = groupRes.data.filter((row) => row.id !== site.id).map((row) => row.name)
  const ownerName = groupRes.data.find((row) => row.id === ownerId)?.name ?? site.name

  const buildings = buildingsRes.data.map((building) => ({
    id: building.id,
    name: building.name,
    sectionId: building.section_id ?? null,
    lines: [...building.building_lines].sort((a, b) => a.line_no - b.line_no).map(normalizeLine),
  }))
  const sections = sectionsRes.data

  const buildingIds = buildings.map((building) => building.id)
  if (buildingIds.length === 0) {
    return { site, ownerId, ownerName, sharedWith, buildings, sections, checks: {}, defects: {} }
  }

  // 큰 현장은 체크 행이 몇천 건이 될 수 있어 range로 나눠 끝까지 읽는다(PostgREST
  // 기본 1000행 한도에 걸리면 뒷부분 체크 상태가 세대표에 조용히 빠져 보인다).
  const [checksRows, defectsRes] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from('unit_checks')
        .select(
          'building_id, line_no, floor, sheet, light, light_by, light_at, light_site_id, light_cleared_at, ' +
            'laminate, laminate_by, laminate_at, laminate_site_id, laminate_cleared_at'
        )
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

  return { site, ownerId, ownerName, sharedWith, buildings, sections, checks, defects }
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

function sameLocalDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

// 체크를 해제해도 처리자·시각·작업 현장은 지우지 않고 해제 시각(*_cleared_at)만 남긴다.
// 해제한 날 안에 다시 체크하면 실수로 푼 것으로 보고 남아 있던 기록을 되살린다. 그래야 며칠 전에
// 완료한 세대를 드래그하다 풀었다가 다시 칠해도 오늘 작업보고·타공 현황에 새로 잡히지 않는다.
// 다음 날 이후의 체크는 실제로 다시 작업한 것으로 보고 새로 찍는다.
// prev: 체크하기 전 칸 상태(세대표의 checks 값, 없으면 null)
export function canRestoreCheck(prev, field, now = new Date()) {
  const clearedAt = prev?.[`${field}_cleared_at`]
  return Boolean(
    prev && !prev[field] && prev[`${field}_by`] && prev[`${field}_at`] && clearedAt && sameLocalDay(clearedAt, now)
  )
}

// 한 칸에 저장할 경량/합지 값. 같은 방향(체크/해제)의 패치는 칸마다 키가 같아서 한 번에 upsert할 수 있다.
export function checkPatch({ prev, field, value, userId, siteId = null, now = new Date() }) {
  const at = new Date(now).toISOString()
  if (!value) return { [field]: false, [`${field}_cleared_at`]: at }
  const restore = canRestoreCheck(prev, field, now)
  return {
    [field]: true,
    [`${field}_by`]: restore ? prev[`${field}_by`] : userId,
    [`${field}_at`]: restore ? prev[`${field}_at`] : at,
    [`${field}_site_id`]: restore ? (prev[`${field}_site_id`] ?? null) : siteId,
    [`${field}_cleared_at`]: null,
  }
}

// 체크 로그를 남길 칸 묶음. 원래 기록을 되살린 칸은 그 사실을 로그에 따로 적는다.
export function checkLogGroups({ cells, field, value, detail, now = new Date() }) {
  const restored = value ? cells.filter((cell) => canRestoreCheck(cell.prev, field, now)) : []
  const others = cells.filter((cell) => !restored.includes(cell))
  return [
    { cells: others, detail },
    { cells: restored, detail: [detail, '해제 전 기록 유지'].filter(Boolean).join(' · ') },
  ].filter((group) => group.cells.length > 0)
}

// 드래그로 여러 칸을 한 번에 칠할 수 있어서, 체크는 항상 칸 목록을 받아 한 번에 저장한다.
// upsert는 넘긴 컬럼만 갱신하므로 경량을 칠해도 같은 칸의 합지 기록은 그대로 남는다.
// siteId: 체크한 현장 화면. 공유 세대표에서는 원본이 아니라 지금 보고 있는 현장이 들어간다(작업보고 기준).
// cells[].prev: 체크하기 전 칸 상태(되살릴지 판단용). now: 실제로 체크한 시각(오프라인 큐는 나중에 전송된다).
export async function setUnitChecks({ cells, sheet, field, value, userId, siteId = null, now = new Date() }) {
  if (cells.length === 0) return []
  const rows = cells.map((cell) => ({
    building_id: cell.buildingId,
    line_no: cell.lineNo,
    floor: cell.floor,
    sheet,
    ...checkPatch({ prev: cell.prev ?? null, field, value, userId, siteId, now }),
    updated_at: new Date().toISOString(),
  }))

  const { data, error } = await supabase
    .from('unit_checks')
    .upsert(rows, { onConflict: 'building_id,line_no,floor,sheet' })
    .select()
  if (error) throw error
  return data
}

// 세대 패널의 [체크 취소]. 드래그 해제와 마찬가지로 체크돼 있던 작업만 해제 시각을 남기고 기록은 둔다.
// prev가 없으면(이전 버전 오프라인 큐) 해제 시각을 남기지 않아 다시 체크할 때 새로 찍힌다.
export function clearPatch(prev, now = new Date()) {
  const at = new Date(now).toISOString()
  return {
    light: false,
    laminate: false,
    ...(prev?.light ? { light_cleared_at: at } : {}),
    ...(prev?.laminate ? { laminate_cleared_at: at } : {}),
  }
}

export async function clearUnitCheck({ buildingId, lineNo, floor, sheet, prev = null, now = new Date() }) {
  const { data, error } = await supabase
    .from('unit_checks')
    .upsert(
      {
        building_id: buildingId,
        line_no: lineNo,
        floor,
        sheet,
        ...clearPatch(prev, now),
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
export async function addDefect({ buildingId, lineNo, floor, locations, content, userId, clientId, siteId = null }) {
  const { data, error } = await supabase
    .from('defects')
    .upsert(
      {
        building_id: buildingId,
        line_no: lineNo,
        floor,
        locations,
        content,
        created_by: userId,
        client_id: clientId,
        created_site_id: siteId,
      },
      { onConflict: 'client_id', ignoreDuplicates: true }
    )
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

export async function resolveDefect({ id, userId, siteId = null }) {
  const { error } = await supabase
    .from('defects')
    .update({ resolved: true, resolved_by: userId, resolved_at: new Date().toISOString(), resolved_site_id: siteId })
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
  // 새 동은 이름순 자리에 끼워 넣는다. 지금 순서를 앞에서부터 보다가 이름이 처음으로 뒤인 동
  // 앞에 넣는다. 드래그로 순서를 바꿔 둔 현장이어도 나머지 동의 순서는 그대로 유지된다.
  const { data: existing, error: existingError } = await supabase
    .from('buildings')
    .select('id, name')
    .eq('site_id', siteId)
    .order('sort_order')
  if (existingError) throw existingError
  const found = existing.findIndex((building) => compareBuildingName(building.name, name) > 0)
  const index = found === -1 ? existing.length : found

  const { data, error } = await supabase
    .from('buildings')
    .insert({ site_id: siteId, name, sort_order: index })
    .select('id')
    .single()
  if (error) throw error

  const { error: linesError } = await supabase.from('building_lines').insert(lineRows(data.id, lines))
  if (linesError) throw linesError

  // 맨 뒤가 아니면 뒤쪽 동들의 순서 번호를 한 칸씩 민다
  if (index < existing.length) {
    const ordered = existing.map((building) => building.id)
    ordered.splice(index, 0, data.id)
    await reorderBuildings({ orderedIds: ordered })
  }

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

// 공구 수정 화면에서 한 번에 저장한다. 공구 목록(추가·이름변경·삭제)과 동별 공구 지정이
// 따로 놀면 방금 만든 공구에 동을 넣지 못하므로, 공구를 먼저 반영하고 동을 나중에 지정한다.
// sections: [{ id, name }] — id가 null이면 새로 만드는 공구다. removedIds에 없는 기존 공구만 남는다.
// assignments: { [buildingId]: sectionId | null | '새 공구의 임시 키' }
export async function saveSiteSections({ siteId, sections, removedIds, assignments }) {
  if (removedIds.length > 0) {
    // 지운 공구에 속해 있던 동은 section_id가 null이 되어 "미지정"으로 돌아간다
    const { error } = await supabase.from('site_sections').delete().in('id', removedIds)
    if (error) throw error
  }

  // 새 공구의 임시 키를 실제 id로 바꿔줄 대응표
  const idByTempKey = {}

  for (const [index, section] of sections.entries()) {
    if (section.id) {
      const { error } = await supabase
        .from('site_sections')
        .update({ name: section.name, sort_order: index })
        .eq('id', section.id)
      if (error) throw error
      continue
    }

    const { data, error } = await supabase
      .from('site_sections')
      .insert({ site_id: siteId, name: section.name, sort_order: index })
      .select('id')
      .single()
    if (error) throw error
    idByTempKey[section.tempKey] = data.id
  }

  const results = await Promise.all(
    Object.entries(assignments).map(([buildingId, sectionId]) =>
      supabase
        .from('buildings')
        .update({ section_id: idByTempKey[sectionId] ?? (sectionId || null) })
        .eq('id', buildingId)
    )
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
