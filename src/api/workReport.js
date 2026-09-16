import { fetchAllRows, supabase } from '../lib/supabase'

// 작업보고는 "오늘 내가 처리한 것"의 현재 상태만 모은다. 별도 기록 테이블을 두지 않는 이유:
// 체크를 해제하면 light_at/laminate_at이 null이 되고, 미타공 등록을 취소하면 행이 지워지므로
// 실수로 등록했다가 취소한 건은 조회 결과에서 저절로 빠진다.

function dayRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

function inRange(iso, { start, end }) {
  if (!iso) return false
  const time = new Date(iso).getTime()
  return time >= new Date(start).getTime() && time < new Date(end).getTime()
}

function emptySite(siteId, siteName) {
  return {
    siteId,
    siteName,
    light: [],
    laminate: [],
    plasterLight: [],
    plasterLaminate: [],
    defectsAdded: [],
    defectsResolved: [],
    checklist: [],
  }
}

function hasWork(site) {
  return (
    site.light.length ||
    site.laminate.length ||
    site.plasterLight.length ||
    site.plasterLaminate.length ||
    site.defectsAdded.length ||
    site.defectsResolved.length ||
    site.checklist.length
  )
}

// 반환: 오늘 작업이 있는 현장 목록. 세대표를 공유하는 현장은 동이 달린 원본 현장 기준으로 묶인다.
export async function fetchTodayWork({ userId, date = new Date() }) {
  const range = dayRange(date)

  const [checkRows, addedRes, resolvedRes, checklistRes] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from('unit_checks')
        .select('building_id, line_no, floor, sheet, light, light_by, light_at, laminate, laminate_by, laminate_at')
        .or(
          `and(light_by.eq.${userId},light_at.gte.${range.start},light_at.lt.${range.end}),` +
            `and(laminate_by.eq.${userId},laminate_at.gte.${range.start},laminate_at.lt.${range.end})`
        )
    ),
    supabase
      .from('defects')
      .select('id, building_id, line_no, floor, locations, content, created_at')
      .eq('created_by', userId)
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at'),
    supabase
      .from('defects')
      .select('id, building_id, line_no, floor, locations, content, resolved_at')
      .eq('resolved', true)
      .eq('resolved_by', userId)
      .gte('resolved_at', range.start)
      .lt('resolved_at', range.end)
      .order('resolved_at'),
    supabase
      .from('site_checklist_items')
      .select('id, site_id, content, checked_at')
      .eq('checked', true)
      .eq('checked_by', userId)
      .gte('checked_at', range.start)
      .lt('checked_at', range.end)
      .order('checked_at'),
  ])
  const error = addedRes.error || resolvedRes.error || checklistRes.error
  if (error) throw error

  const buildingIds = [
    ...new Set([...checkRows, ...addedRes.data, ...resolvedRes.data].map((row) => row.building_id)),
  ]
  const buildingsRes = buildingIds.length
    ? await supabase.from('buildings').select('id, name, site_id, sort_order').in('id', buildingIds)
    : { data: [], error: null }
  if (buildingsRes.error) throw buildingsRes.error
  const buildingById = Object.fromEntries(buildingsRes.data.map((b) => [b.id, b]))

  const siteIds = [
    ...new Set([...buildingsRes.data.map((b) => b.site_id), ...checklistRes.data.map((item) => item.site_id)]),
  ]
  const sitesRes = siteIds.length
    ? await supabase.from('sites').select('id, name').in('id', siteIds)
    : { data: [], error: null }
  if (sitesRes.error) throw sitesRes.error
  const siteNameById = Object.fromEntries(sitesRes.data.map((s) => [s.id, s.name]))

  const bySite = {}
  function siteOf(siteId) {
    if (!bySite[siteId]) bySite[siteId] = emptySite(siteId, siteNameById[siteId] ?? '알 수 없는 현장')
    return bySite[siteId]
  }

  function unitOf(row) {
    const building = buildingById[row.building_id]
    if (!building) return null
    return {
      buildingId: building.id,
      buildingName: building.name,
      sortOrder: building.sort_order ?? 0,
      lineNo: row.line_no,
      floor: row.floor,
      siteId: building.site_id,
    }
  }

  checkRows.forEach((row) => {
    const unit = unitOf(row)
    if (!unit) return
    const site = siteOf(unit.siteId)
    const lightToday = row.light && row.light_by === userId && inRange(row.light_at, range)
    const laminateToday = row.laminate && row.laminate_by === userId && inRange(row.laminate_at, range)
    if (row.sheet === 'plaster') {
      if (lightToday) site.plasterLight.push(unit)
      if (laminateToday) site.plasterLaminate.push(unit)
    } else {
      if (lightToday) site.light.push(unit)
      if (laminateToday) site.laminate.push(unit)
    }
  })

  addedRes.data.forEach((row) => {
    const unit = unitOf(row)
    if (unit) siteOf(unit.siteId).defectsAdded.push({ ...unit, locations: row.locations, content: row.content })
  })

  resolvedRes.data.forEach((row) => {
    const unit = unitOf(row)
    if (unit) siteOf(unit.siteId).defectsResolved.push({ ...unit, locations: row.locations, content: row.content })
  })

  checklistRes.data.forEach((item) => {
    siteOf(item.site_id).checklist.push({ id: item.id, content: item.content })
  })

  return Object.values(bySite)
    .filter(hasWork)
    .sort((a, b) => a.siteName.localeCompare(b.siteName))
}

// 빨간 테두리 대상: 오늘 내가 메인 세대표에서 경량 또는 합지를 체크한 세대
export function highlightKeysOf(site) {
  return new Set([...site.light, ...site.laminate].map((u) => `${u.buildingId}-${u.lineNo}-${u.floor}`))
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function unitNo(unit) {
  return `${unit.floor}${pad2(unit.lineNo)}`
}

function sortUnits(units) {
  return [...units].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.buildingName.localeCompare(b.buildingName) ||
      a.floor - b.floor ||
      a.lineNo - b.lineNo
  )
}

// "101동: 1701, 1702" 처럼 동별로 한 줄씩 묶는다
function unitLines(units) {
  const lines = []
  let current = null
  sortUnits(units).forEach((unit) => {
    if (!current || current.buildingId !== unit.buildingId) {
      current = { buildingId: unit.buildingId, name: unit.buildingName, numbers: [] }
      lines.push(current)
    }
    current.numbers.push(unitNo(unit))
  })
  return lines.map((line) => `· ${line.name}: ${line.numbers.join(', ')}`)
}

function defectLine(defect) {
  const detail = [(defect.locations ?? []).join(', '), defect.content].filter(Boolean).join(' · ')
  return `· ${defect.buildingName} ${unitNo(defect)}호${detail ? ` ${detail}` : ''}`
}

export function buildReportText({ site, userName, date = new Date() }) {
  const dateText = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} (${DOW[date.getDay()]})`
  const out = [`[작업보고] ${dateText}`, `현장: ${site.siteName}`, `작성: ${userName}`]

  function section(title, lines) {
    if (lines.length === 0) return
    out.push('', title, ...lines)
  }

  section(`■ 경량 ${site.light.length}세대`, unitLines(site.light))
  section(`■ 합지 ${site.laminate.length}세대`, unitLines(site.laminate))
  section(`■ 석고 시공 경량 ${site.plasterLight.length}세대`, unitLines(site.plasterLight))
  section(`■ 석고 시공 합지 ${site.plasterLaminate.length}세대`, unitLines(site.plasterLaminate))
  section(`■ 미타공 등록 ${site.defectsAdded.length}건`, sortUnits(site.defectsAdded).map(defectLine))
  section(`■ 미타공 처리 완료 ${site.defectsResolved.length}건`, sortUnits(site.defectsResolved).map(defectLine))
  section(
    `■ 체크리스트 완료 ${site.checklist.length}건`,
    site.checklist.map((item) => `· ${item.content.trim() || '(내용 없음)'}`)
  )

  return out.join('\n')
}
