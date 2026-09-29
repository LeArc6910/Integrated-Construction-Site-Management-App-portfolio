import { unitCompletion, unitHoleCount, localDateOf } from '../lib/holes'
import { isCrcSite } from '../lib/siteMode'
import { fetchAllRows, supabase } from '../lib/supabase'
import { cellKey, fetchUserNames } from './unitSheet'

// ---- 현장 타입표·옵션표 (세대표 화면에서 관리) ----
// 타입·옵션은 동과 같이 세대표 원본 현장에 달린다. siteId에는 항상 원본 현장 id를 넘긴다.

export async function fetchSiteHoleSetup({ siteId, buildingIds }) {
  const [typesRes, optionsRes] = await Promise.all([
    supabase.from('site_unit_types').select('id, name, hole_count').eq('site_id', siteId).order('sort_order').order('name'),
    supabase.from('site_unit_options').select('id, name, hole_delta').eq('site_id', siteId).order('sort_order').order('name'),
  ])
  if (typesRes.error) throw typesRes.error
  if (optionsRes.error) throw optionsRes.error

  const unitOptions = {}
  if (buildingIds.length > 0) {
    const rows = await fetchAllRows(() =>
      supabase.from('unit_options').select('building_id, line_no, floor, option_id').in('building_id', buildingIds)
    )
    rows.forEach((row) => {
      const key = cellKey(row.building_id, row.line_no, row.floor)
      if (!unitOptions[key]) unitOptions[key] = []
      unitOptions[key].push(row.option_id)
    })
  }

  return { types: typesRes.data, options: optionsRes.data, unitOptions }
}

// 세대표 수정에서 새 타입 이름을 적으면 타입표에도 (타공 수 없이) 올려 둔다. 그래야 타공 설정에서
// 바로 보이고, 타공 현황에서 미설정으로 잡힌다. 이미 있는 이름은 건드리지 않는다.
export async function ensureSiteUnitTypes({ siteId, names }) {
  const unique = [...new Set(names.map((name) => name?.trim()).filter(Boolean))]
  if (unique.length === 0) return
  const { error } = await supabase
    .from('site_unit_types')
    .upsert(
      unique.map((name) => ({ site_id: siteId, name })),
      { onConflict: 'site_id,name', ignoreDuplicates: true }
    )
  if (error) throw error
}

// 타공 설정 모달에서 한 번에 저장한다.
// types/options: [{ id, name, holeCount | holeDelta, originalName }] — id가 null이면 새로 만든다.
// 라인은 타입을 이름(글자)으로 들고 있어서, 타입 이름을 바꾸면 이 현장 동들의 라인 값도 같이 바꾼다.
export async function saveSiteHoleSetup({ siteId, buildingIds, types, removedTypeIds, options, removedOptionIds }) {
  if (removedTypeIds.length > 0) {
    const { error } = await supabase.from('site_unit_types').delete().in('id', removedTypeIds)
    if (error) throw error
  }
  if (removedOptionIds.length > 0) {
    // 옵션을 지우면 unit_options의 세대 연결도 on delete cascade로 같이 지워진다
    const { error } = await supabase.from('site_unit_options').delete().in('id', removedOptionIds)
    if (error) throw error
  }

  // 이름을 서로 맞바꾸는 경우(84A↔84B) unique 제약에 걸리지 않도록, 바뀌는 행은 먼저 임시 이름으로 비켜 둔다
  const renamed = types.filter((type) => type.id && type.originalName !== type.name)
  for (const type of renamed) {
    const { error } = await supabase
      .from('site_unit_types')
      .update({ name: `__rename_${type.id}` })
      .eq('id', type.id)
    if (error) throw error
  }

  for (const [index, type] of types.entries()) {
    const row = { name: type.name, hole_count: type.holeCount, sort_order: index }
    const { error } = type.id
      ? await supabase.from('site_unit_types').update(row).eq('id', type.id)
      : await supabase.from('site_unit_types').insert({ ...row, site_id: siteId })
    if (error) throw error
  }

  if (renamed.length > 0 && buildingIds.length > 0) {
    // 라인도 임시 이름을 거쳐 바꿔야 맞바꾼 이름끼리 섞이지 않는다
    for (const type of renamed) {
      const { error } = await supabase
        .from('building_lines')
        .update({ unit_type: `__rename_${type.id}` })
        .in('building_id', buildingIds)
        .eq('unit_type', type.originalName)
      if (error) throw error
    }
    for (const type of renamed) {
      const { error } = await supabase
        .from('building_lines')
        .update({ unit_type: type.name })
        .in('building_id', buildingIds)
        .eq('unit_type', `__rename_${type.id}`)
      if (error) throw error
    }
  }

  for (const [index, option] of options.entries()) {
    const row = { name: option.name, hole_delta: option.holeDelta, sort_order: index }
    const { error } = option.id
      ? await supabase.from('site_unit_options').update(row).eq('id', option.id)
      : await supabase.from('site_unit_options').insert({ ...row, site_id: siteId })
    if (error) throw error
  }
}

// 드래그로 고른 세대들에 옵션 하나를 붙이거나 뗀다.
export async function setUnitOption({ cells, optionId, value }) {
  if (cells.length === 0) return
  if (value) {
    const rows = cells.map((cell) => ({
      building_id: cell.buildingId,
      line_no: cell.lineNo,
      floor: cell.floor,
      option_id: optionId,
    }))
    const { error } = await supabase
      .from('unit_options')
      .upsert(rows, { onConflict: 'building_id,line_no,floor,option_id', ignoreDuplicates: true })
    if (error) throw error
    return
  }

  // 한 동 안의 칸들이라 building_id는 같다. 라인별로 층을 묶어 지운다.
  const byLine = {}
  cells.forEach((cell) => {
    const key = `${cell.buildingId}-${cell.lineNo}`
    if (!byLine[key]) byLine[key] = { buildingId: cell.buildingId, lineNo: cell.lineNo, floors: [] }
    byLine[key].floors.push(cell.floor)
  })
  const results = await Promise.all(
    Object.values(byLine).map(({ buildingId, lineNo, floors }) =>
      supabase
        .from('unit_options')
        .delete()
        .eq('option_id', optionId)
        .eq('building_id', buildingId)
        .eq('line_no', lineNo)
        .in('floor', floors)
    )
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

// ---- 타공 현황·타공 설정 목록이 같이 쓰는 기초 데이터 ----

// 보관되지 않은 현장의 세대표(동·라인)와 타입표·옵션표, 세대별 옵션을 통째로 받아 현장 기준으로 묶는다.
// 세대표를 공유하는 현장은 동이 원본에 달려 있어 원본 현장(owners) 기준으로 한 번만 센다.
async function fetchHoleBase() {
  const [sitesRes, buildingsRes, lines, typesRes, optionsRes, unitOptionRows] = await Promise.all([
    supabase.from('sites').select('id, name, sheet_source_id').is('archived_at', null).order('name'),
    supabase.from('buildings').select('id, site_id'),
    fetchAllRows(() => supabase.from('building_lines').select('building_id, line_no, min_floor, max_floor, unit_type')),
    supabase.from('site_unit_types').select('id, site_id, name, hole_count').order('sort_order').order('name'),
    supabase.from('site_unit_options').select('id, site_id, name, hole_delta').order('sort_order').order('name'),
    fetchAllRows(() => supabase.from('unit_options').select('building_id, line_no, floor, option_id')),
  ])
  const error = sitesRes.error || buildingsRes.error || typesRes.error || optionsRes.error
  if (error) throw error

  const sites = sitesRes.data
  const siteById = Object.fromEntries(sites.map((site) => [site.id, site]))
  const owners = sites.filter((site) => (site.sheet_source_id ?? site.id) === site.id)
  const siteIdByBuilding = Object.fromEntries(buildingsRes.data.map((b) => [b.id, b.site_id]))

  const typesBySite = {}
  const typeHolesBySite = {}
  typesRes.data.forEach((type) => {
    if (!typesBySite[type.site_id]) typesBySite[type.site_id] = []
    if (!typeHolesBySite[type.site_id]) typeHolesBySite[type.site_id] = {}
    typesBySite[type.site_id].push(type)
    typeHolesBySite[type.site_id][type.name] = type.hole_count
  })

  const optionsBySite = {}
  optionsRes.data.forEach((option) => {
    if (!optionsBySite[option.site_id]) optionsBySite[option.site_id] = []
    optionsBySite[option.site_id].push(option)
  })
  const optionDeltas = Object.fromEntries(optionsRes.data.map((option) => [option.id, option.hole_delta]))

  const optionIdsByCell = {}
  unitOptionRows.forEach((row) => {
    const key = cellKey(row.building_id, row.line_no, row.floor)
    if (!optionIdsByCell[key]) optionIdsByCell[key] = []
    optionIdsByCell[key].push(row.option_id)
  })

  return {
    sites,
    siteById,
    owners,
    buildings: buildingsRes.data,
    siteIdByBuilding,
    lines,
    typesBySite,
    typeHolesBySite,
    optionsBySite,
    optionDeltas,
    unitOptionRows,
    optionIdsByCell,
  }
}

// 세대표를 공유받는 현장 이름들(원본 현장 카드에 "공유" 표시용)
function sharedWithOf(sites, ownerId) {
  return sites.filter((s) => s.sheet_source_id === ownerId).map((s) => s.name)
}

// ---- 타공 설정 목록 (메뉴 "타공 설정", 전체) ----

// 현장마다 타입표·옵션표와 설정 상태(미설정 세대 수)를 돌려준다. 현장을 들어가지 않고도 타공 설정
// 모달을 바로 열 수 있게, 모달이 보여주는 사용 현황(타입별 라인 수, 옵션별 세대 수)과 저장에 필요한
// 동 id도 같이 담는다. 미설정 세대가 남은 현장이 앞에 온다.
export async function fetchHoleSetupOverview() {
  const base = await fetchHoleBase()

  const stats = {}
  base.owners.forEach((site) => {
    stats[site.id] = {
      id: site.id,
      name: site.name,
      sharedWith: sharedWithOf(base.sites, site.id),
      buildingIds: [],
      types: base.typesBySite[site.id] ?? [],
      options: base.optionsBySite[site.id] ?? [],
      lineCountByType: {},
      optionUnitCount: {},
      totalUnits: 0,
      unsetUnits: 0,
    }
  })
  base.buildings.forEach((building) => stats[building.site_id]?.buildingIds.push(building.id))

  base.lines.forEach((line) => {
    const site = stats[base.siteIdByBuilding[line.building_id]]
    if (!site) return
    const name = line.unit_type?.trim()
    if (name) site.lineCountByType[name] = (site.lineCountByType[name] ?? 0) + 1

    const typeHoles = base.typeHolesBySite[site.id] ?? {}
    for (let floor = line.min_floor ?? 1; floor <= line.max_floor; floor++) {
      const holes = unitHoleCount({
        unitType: line.unit_type,
        optionIds: base.optionIdsByCell[cellKey(line.building_id, line.line_no, floor)],
        typeHoles,
        optionDeltas: base.optionDeltas,
      })
      site.totalUnits += 1
      if (holes == null) site.unsetUnits += 1
    }
  })

  base.unitOptionRows.forEach((row) => {
    const site = stats[base.siteIdByBuilding[row.building_id]]
    if (site) site.optionUnitCount[row.option_id] = (site.optionUnitCount[row.option_id] ?? 0) + 1
  })

  // 현장 이름순(조회 순서)을 유지한 채 미설정이 남은 현장만 앞으로 뺀다
  const list = Object.values(stats).filter((site) => site.totalUnits > 0)
  return [...list.filter((site) => site.unsetUnits > 0), ...list.filter((site) => site.unsetUnits === 0)]
}

// ---- 현장 타공 현황 (팀장 이상) ----

// 현장별 전체/완료 타공 수와, 선택한 달의 인원별·일별 완료 타공 수를 한 번에 계산한다.
// 세대표 현장 목록(computeCompletion)과 같이 필요한 행을 통째로 가져와 앱에서 집계한다.
// 타공 수는 저장해 두지 않고 지금의 타입표·옵션으로 매번 다시 계산한다(나중에 고치면 지난 달도 바뀐다).
export async function fetchHoleDashboard({ year, month }) {
  const [base, checks, names] = await Promise.all([
    fetchHoleBase(),
    // 석고 시공 세대표는 별도 확인용이라 타공 계산에서 뺀다
    fetchAllRows(() =>
      supabase
        .from('unit_checks')
        .select('building_id, line_no, floor, light, light_by, light_at, laminate, laminate_by, laminate_at')
        .eq('sheet', 'main')
    ),
    fetchUserNames(),
  ])
  const { sites, siteById, owners, siteIdByBuilding, lines, typeHolesBySite, optionDeltas, optionIdsByCell } = base

  const checkByCell = {}
  checks.forEach((check) => {
    checkByCell[cellKey(check.building_id, check.line_no, check.floor)] = check
  })

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`

  const siteStats = {}
  owners.forEach((site) => {
    siteStats[site.id] = {
      id: site.id,
      name: site.name,
      sharedWith: sharedWithOf(sites, site.id),
      totalUnits: 0,
      doneUnits: 0,
      totalHoles: 0,
      doneHoles: 0,
      unsetUnits: 0,
    }
  })

  // 선택한 달에 완료된 세대 목록. 인원별·일별 묶음은 화면에서 현장 필터를 적용한 뒤 만든다(summarizeWork).
  const work = []

  lines.forEach((line) => {
    const siteId = siteIdByBuilding[line.building_id]
    const stats = siteStats[siteId]
    // 보관(삭제)된 현장이거나 원본이 아닌 현장에 동이 남아 있으면 건너뛴다
    if (!stats) return
    const crc = isCrcSite(siteById[siteId]?.name)
    const typeHoles = typeHolesBySite[siteId] ?? {}

    for (let floor = line.min_floor ?? 1; floor <= line.max_floor; floor++) {
      const key = cellKey(line.building_id, line.line_no, floor)
      const holes = unitHoleCount({
        unitType: line.unit_type,
        optionIds: optionIdsByCell[key],
        typeHoles,
        optionDeltas,
      })
      const done = unitCompletion(checkByCell[key], crc)

      stats.totalUnits += 1
      if (holes == null) stats.unsetUnits += 1
      else stats.totalHoles += holes
      if (done) {
        stats.doneUnits += 1
        if (holes != null) stats.doneHoles += holes
      }

      const date = localDateOf(done?.at)
      if (date?.startsWith(monthPrefix) && done.by) {
        work.push({ userId: done.by, date, siteId, holes })
      }
    }
  })

  return {
    sites: Object.values(siteStats).filter((site) => site.totalUnits > 0),
    work,
    names,
  }
}
