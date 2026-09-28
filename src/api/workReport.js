import { isCrcSite } from '../lib/siteMode'
import { fetchAllRows, supabase } from '../lib/supabase'
import { inLine } from '../lib/unitSheetLayout'

// 작업보고는 "오늘 내가 처리한 것"의 현재 상태만 모은다. 별도 기록 테이블을 두지 않는 이유:
// 체크를 해제한 행은 light/laminate가 false라 걸러지고(처리자·시각은 되살릴 수 있게 남아 있다),
// 미타공 등록을 취소하면 행이 지워지므로, 실수로 등록했다가 취소한 건은 조회 결과에서 저절로 빠진다.

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

// crcName: CRC 여부를 판단할 현장 이름. 공유 세대표는 체크 방식이 원본을 따르므로 원본 이름이다.
function emptySite(siteId, siteName, crcName) {
  return {
    siteId,
    siteName,
    // CRC 현장은 경량·합지가 아니라 CRC 하나로 체크한다(값은 light 자리에 저장된다)
    crc: isCrcSite(crcName),
    light: [],
    laminate: [],
    defectsAdded: [],
    defectsResolved: [],
    checklist: [],
  }
}

function hasWork(site) {
  return (
    site.light.length ||
    site.laminate.length ||
    site.defectsAdded.length ||
    site.defectsResolved.length ||
    site.checklist.length
  )
}

// 반환: 오늘 작업이 있는 현장 목록. 체크·미타공은 작업한 현장 화면 기준으로 묶는다. 세대표를 공유하면
// 동은 원본 현장에 달려 있지만, 공유받은 현장에서 작업했으면 그 현장으로 보고한다. 작업한 현장이
// 기록되지 않은 예전 기록(이전 버전 앱)은 동이 달린 원본 현장으로 묶는다.
export async function fetchTodayWork({ userId, date = new Date() }) {
  const range = dayRange(date)

  const [checkRows, addedRes, resolvedRes, checklistRes] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from('unit_checks')
        .select(
          'building_id, line_no, floor, sheet, light, light_by, light_at, light_site_id, laminate, laminate_by, laminate_at, laminate_site_id'
        )
        .or(
          `and(light.eq.true,light_by.eq.${userId},light_at.gte.${range.start},light_at.lt.${range.end}),` +
            `and(laminate.eq.true,laminate_by.eq.${userId},laminate_at.gte.${range.start},laminate_at.lt.${range.end})`
        )
    ),
    supabase
      .from('defects')
      .select('id, building_id, line_no, floor, locations, content, created_at, created_site_id')
      .eq('created_by', userId)
      .gte('created_at', range.start)
      .lt('created_at', range.end)
      .order('created_at'),
    supabase
      .from('defects')
      .select('id, building_id, line_no, floor, locations, content, resolved_at, resolved_site_id')
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

  const workSiteIds = [
    ...checkRows.flatMap((row) => [row.light_site_id, row.laminate_site_id]),
    ...addedRes.data.map((row) => row.created_site_id),
    ...resolvedRes.data.map((row) => row.resolved_site_id),
  ].filter(Boolean)
  const siteIds = [
    ...new Set([
      ...buildingsRes.data.map((b) => b.site_id),
      ...checklistRes.data.map((item) => item.site_id),
      ...workSiteIds,
    ]),
  ]
  const sitesRes = siteIds.length
    ? await supabase.from('sites').select('id, name, sheet_source_id').in('id', siteIds)
    : { data: [], error: null }
  if (sitesRes.error) throw sitesRes.error
  const siteNameById = Object.fromEntries(sitesRes.data.map((s) => [s.id, s.name]))

  // 체크리스트만 있는 공유 현장은 원본 현장이 아직 목록에 없을 수 있어 이름을 더 받아온다
  const missingOwnerIds = [
    ...new Set(sitesRes.data.map((s) => s.sheet_source_id).filter((id) => id && !(id in siteNameById))),
  ]
  if (missingOwnerIds.length) {
    const ownersRes = await supabase.from('sites').select('id, name').in('id', missingOwnerIds)
    if (ownersRes.error) throw ownersRes.error
    ownersRes.data.forEach((s) => {
      siteNameById[s.id] = s.name
    })
  }
  const ownerById = Object.fromEntries(sitesRes.data.map((s) => [s.id, s.sheet_source_id ?? s.id]))

  const bySite = {}
  function siteOf(siteId) {
    if (!bySite[siteId]) {
      const name = siteNameById[siteId] ?? '알 수 없는 현장'
      bySite[siteId] = emptySite(siteId, name, siteNameById[ownerById[siteId]] ?? name)
    }
    return bySite[siteId]
  }

  // workSiteId: 그 작업을 한 현장 화면(기록돼 있으면). 없으면 동이 달린 원본 현장이다.
  function unitOf(row, workSiteId = null) {
    const building = buildingById[row.building_id]
    if (!building) return null
    return {
      buildingId: building.id,
      buildingName: building.name,
      sortOrder: building.sort_order ?? 0,
      lineNo: row.line_no,
      floor: row.floor,
      siteId: workSiteId ?? building.site_id,
    }
  }

  checkRows.forEach((row) => {
    // 석고 시공 세대표의 체크는 작업보고에 넣지 않는다
    if (row.sheet === 'plaster') return
    // 경량과 합지는 다른 현장 화면에서 체크됐을 수 있어 따로 묶는다
    const lightToday = row.light && row.light_by === userId && inRange(row.light_at, range)
    const laminateToday = row.laminate && row.laminate_by === userId && inRange(row.laminate_at, range)
    if (lightToday) {
      const unit = unitOf(row, row.light_site_id)
      if (unit) siteOf(unit.siteId).light.push(unit)
    }
    if (laminateToday) {
      const unit = unitOf(row, row.laminate_site_id)
      if (unit) siteOf(unit.siteId).laminate.push(unit)
    }
  })

  addedRes.data.forEach((row) => {
    const unit = unitOf(row, row.created_site_id)
    if (unit) siteOf(unit.siteId).defectsAdded.push({ ...unit, locations: row.locations, content: row.content })
  })

  resolvedRes.data.forEach((row) => {
    const unit = unitOf(row, row.resolved_site_id)
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

// 코어 이름이 숫자만 적혀 있으면("1") 뜻이 안 통하니 "1코어"로 붙여 쓴다
function coreName(label) {
  return /^\d+$/.test(label) ? `${label}코어` : label
}

// 한 동의 한 층에서 오늘 한 세대를 묶음 목록으로 바꾼다.
// - 그 층의 세대를 전부 했으면 '전체' 하나
// - 코어 정보가 있고 한 코어를 통째로 했으면 코어 이름으로 묶는다(코어가 우선)
// - 나머지는 그 층에서 이웃한 호끼리 '1701~1702호'로 묶는다
// available: 그 층에 실제로 있는 라인들(세대표를 못 받았으면 null → 전체/코어 판단 없이 호수만 묶는다)
function floorTokens(worked, available) {
  const covered = new Set()
  const tokens = []

  if (available) {
    if (available.length === worked.length && available.every((line) => worked.includes(line.line_no))) {
      return [{ kind: 'all', first: 0, sig: 'all' }]
    }
    const byCore = new Map()
    available.forEach((line) => {
      const label = line.core_label?.trim()
      if (label) byCore.set(label, [...(byCore.get(label) ?? []), line.line_no])
    })
    byCore.forEach((numbers, label) => {
      if (!numbers.every((n) => worked.includes(n))) return
      numbers.forEach((n) => covered.add(n))
      tokens.push({ kind: 'core', label, first: numbers[0], sig: `c:${label}` })
    })
  }

  // 세대표의 라인 순서에서 바로 옆에 있는 라인끼리만 잇는다(코어로 빠진 라인은 사이에 끼면 끊긴다).
  // 층 범위를 좁힌 뒤 남은 옛 체크처럼 지금 세대표에 없는 라인은 라인 번호 순서대로 뒤에 붙여,
  // 그런 칸들끼리는 이어지되 세대표에 있는 라인과는 섞이지 않게 한다.
  const order = available?.map((line) => line.line_no) ?? null
  const position = (n) => {
    if (!order) return n
    const index = order.indexOf(n)
    return index >= 0 ? index : order.length + n
  }
  let run = null
  worked
    .filter((n) => !covered.has(n))
    .sort((a, b) => a - b)
    .forEach((n) => {
      if (run && position(n) === run.lastPosition + 1) {
        run.end = n
        run.lastPosition = position(n)
        return
      }
      run = { kind: 'run', start: n, end: n, first: n, lastPosition: position(n) }
      tokens.push(run)
    })
  tokens.forEach((token) => {
    if (token.kind === 'run') token.sig = `l:${token.start}-${token.end}`
  })

  return tokens.sort((a, b) => a.first - b.first)
}

function renderToken(token, floor) {
  if (token.kind === 'core') return coreName(token.label)
  const { start, end } = token
  if (floor !== null) {
    return start === end ? `${unitNo({ floor, lineNo: start })}호` : `${unitNo({ floor, lineNo: start })}~${unitNo({ floor, lineNo: end })}호`
  }
  return start === end ? `${pad2(start)}호` : `${pad2(start)}~${pad2(end)}호`
}

// 층 묶음 하나를 글자로: "6~10층 1코어", "1~10층 전체", "1701~1702호"
function renderFloorGroup(group) {
  const single = group.startFloor === group.endFloor
  const range = single ? `${group.startFloor}층` : `${group.startFloor}~${group.endFloor}층`
  if (group.tokens[0]?.kind === 'all') return `${range} 전체`
  const floor = single ? group.startFloor : null
  const body = group.tokens.map((token) => renderToken(token, floor)).join(', ')
  // 한 층이고 호수만 있으면 호수에 층이 들어 있어 "17층"을 또 쓰지 않는다
  return single && group.tokens.every((token) => token.kind === 'run') ? body : `${range} ${body}`
}

// "101동: 6~10층 1코어 / 11층 1701~1702호" 처럼 동별로 한 줄씩 묶는다.
// buildingById는 세대표의 동 목록(라인별 층 범위·코어 정보)이며, 없으면 호수만 묶는다.
function unitLines(units, buildingById) {
  const byBuilding = []
  sortUnits(units).forEach((unit) => {
    let entry = byBuilding[byBuilding.length - 1]
    if (!entry || entry.buildingId !== unit.buildingId) {
      entry = { buildingId: unit.buildingId, name: unit.buildingName, floors: [] }
      byBuilding.push(entry)
    }
    const last = entry.floors[entry.floors.length - 1]
    if (last && last.floor === unit.floor) last.worked.push(unit.lineNo)
    else entry.floors.push({ floor: unit.floor, worked: [unit.lineNo] })
  })

  return byBuilding.map((entry) => {
    const lines = buildingById[entry.buildingId]?.lines ?? null
    const groups = []
    entry.floors.forEach(({ floor, worked }) => {
      const available = lines ? lines.filter((line) => inLine(line, floor)) : null
      const tokens = floorTokens(worked, available)
      const sig = tokens.map((token) => token.sig).join('|')
      const last = groups[groups.length - 1]
      // 바로 위층이고 묶음이 똑같으면 층 범위만 늘린다
      if (last && last.endFloor + 1 === floor && last.sig === sig) last.endFloor = floor
      else groups.push({ startFloor: floor, endFloor: floor, sig, tokens })
    })
    return `· ${entry.name}: ${groups.map(renderFloorGroup).join(' / ')}`
  })
}

function defectLine(defect) {
  const detail = [(defect.locations ?? []).join(', '), defect.content].filter(Boolean).join(' · ')
  return `· ${defect.buildingName} ${unitNo(defect)}호${detail ? ` ${detail}` : ''}`
}

// buildings: 세대표의 동 목록. 넘기면 "전체"·코어 표기까지 쓰고, 없으면 호수만 층별로 묶는다.
export function buildReportText({ site, userName, buildings = [], date = new Date() }) {
  const buildingById = Object.fromEntries(buildings.map((b) => [b.id, b]))
  const dateText = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} (${DOW[date.getDay()]})`
  const out = [`[작업보고] ${dateText}`, `현장: ${site.siteName}`, `작성: ${userName}`]

  function section(title, lines) {
    if (lines.length === 0) return
    out.push('', title, ...lines)
  }

  section(`■ ${site.crc ? 'CRC' : '경량'} ${site.light.length}세대`, unitLines(site.light, buildingById))
  if (!site.crc) section(`■ 합지 ${site.laminate.length}세대`, unitLines(site.laminate, buildingById))
  section(`■ 미타공 등록 ${site.defectsAdded.length}건`, sortUnits(site.defectsAdded).map(defectLine))
  section(`■ 미타공 처리 완료 ${site.defectsResolved.length}건`, sortUnits(site.defectsResolved).map(defectLine))
  section(
    `■ 체크리스트 완료 ${site.checklist.length}건`,
    site.checklist.map((item) => `· ${item.content.trim() || '(내용 없음)'}`)
  )

  return out.join('\n')
}
