// 세대표를 그릴 때 화면(UnitSheetTable)과 이미지(unitSheetImage)가 똑같은 층·세대 구성을 쓰도록
// 층 범위·라인별 세대수·코어 병합 계산을 한 곳에 모아둔다.

export function lineRange(line) {
  return { min: line.min_floor ?? 1, max: line.max_floor }
}

export function inLine(line, floor) {
  const { min, max } = lineRange(line)
  return floor >= min && floor <= max
}

// 라인에 실제로 있는 세대 수. 2층부터 시작하는 라인은 1층이 세대수에 들어가지 않는다.
export function lineUnitCount(line) {
  const { min, max } = lineRange(line)
  return Math.max(0, max - min + 1)
}

function descendingFloors(max) {
  // 1층에 세대가 하나도 없는 동(필로티 등)도 1층 행은 그려서 없는 세대처럼 빗금으로 보여준다.
  // 지하층이 있는 현장은 없어서 항상 1층부터 시작한다.
  if (!Number.isFinite(max) || max < 1) return []
  return Array.from({ length: max }, (_, i) => max - i)
}

// 동에 그릴 층 목록. 가장 높은 층이 위로 오게 내림차순으로 만든다.
export function floorsOf(building) {
  if (building.lines.length === 0) return []
  return descendingFloors(Math.max(...building.lines.map((line) => lineRange(line).max)))
}

// 가로 보기에서는 동마다 따로 층 목록을 만들면 동별로 층수가 달라 같은 줄에 다른 층이
// 나란히 놓인다. 화면에 보이는 모든 동을 통틀어 최고층~1층을 공통 행으로 쓴다.
export function sharedFloorsOf(buildings) {
  const maxes = buildings.filter((b) => b.lines.length > 0).map((b) => Math.max(...b.lines.map((l) => lineRange(l).max)))
  if (maxes.length === 0) return []
  return descendingFloors(Math.max(...maxes))
}

// 연속된 라인이 같은 코어 라벨이면 한 칸으로 합쳐 표시한다(세대표 샘플의 "1 core" 병합).
// 라벨이 없는 라인끼리도 합쳐서 빈 칸 하나로 둔다.
export function coreGroups(lines) {
  const groups = []
  lines.forEach((line) => {
    const label = line.core_label?.trim() || null
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.span += 1
    else groups.push({ label, span: 1 })
  })
  return groups
}

export function hasCoreInfo(building) {
  return building.lines.some((line) => line.core_label?.trim())
}

// 동 하단 요약: 총 세대수와 최고층
export function buildingSummary(building) {
  const total = building.lines.reduce((sum, line) => sum + lineUnitCount(line), 0)
  const maxFloor = building.lines.length ? Math.max(...building.lines.map((line) => lineRange(line).max)) : 0
  return { total, maxFloor }
}
