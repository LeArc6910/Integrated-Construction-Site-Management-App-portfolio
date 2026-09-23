import { isUnitDone } from './siteMode'

// 세대 타공 수 계산 규칙.
//
// 세대 타공 수 = 라인 타입의 기본 타공 수 + 그 세대에 붙은 옵션 가감(±) 합.
// 타입이 없거나 타입표에 타공 수가 비어 있으면 계산할 수 없으므로 null(미설정)을 돌려준다.
// 미설정 세대를 0으로 세면 합계가 틀려도 알아챌 수 없어서, 화면에서 따로 개수를 보여준다.
//
// typeHoles: { [타입 이름]: 타공 수 | null }, optionDeltas: { [옵션 id]: ±개수 }
export function unitHoleCount({ unitType, optionIds = [], typeHoles, optionDeltas }) {
  const name = unitType?.trim()
  if (!name) return null
  const base = typeHoles[name]
  if (base == null) return null
  const delta = optionIds.reduce((sum, id) => sum + (optionDeltas[id] ?? 0), 0)
  // 옵션으로 빼는 수가 기본값보다 커도 음수 타공은 없다
  return Math.max(0, base + delta)
}

// 타공 완료 세대의 완료 시각과 작업자. 완료 판정은 세대표와 같다(isUnitDone).
// 일반 현장은 경량·합지가 둘 다 체크되어야 완료이므로, 나중에 체크된 쪽의 시각·작업자가 완료 기준이다.
// 한 세대를 여럿이 나눠 작업하는 일은 없어서 작업자는 한 명으로 본다.
export function unitCompletion(check, crc) {
  if (!isUnitDone(check, crc)) return null
  if (crc) return { at: check.light_at, by: check.light_by }
  const laminateLater = (Date.parse(check.laminate_at) || 0) > (Date.parse(check.light_at) || 0)
  return laminateLater
    ? { at: check.laminate_at, by: check.laminate_by }
    : { at: check.light_at, by: check.light_by }
}

// 한 달치 완료 세대 목록(work)을 인원별·일별로 묶는다. siteId를 주면 그 현장만 센다.
// 타공 수가 미설정인 세대는 타공 합계에 넣지 않고 unsetUnits로 따로 센다.
export function summarizeWork(work, names, siteId = null) {
  const people = {}
  work.forEach((item) => {
    if (siteId != null && item.siteId !== siteId) return
    if (!people[item.userId]) {
      people[item.userId] = { id: item.userId, name: names[item.userId] ?? '(알 수 없음)', holes: 0, units: 0, unsetUnits: 0, days: {} }
    }
    const person = people[item.userId]
    if (!person.days[item.date]) person.days[item.date] = { date: item.date, holes: 0, units: 0, unsetUnits: 0 }
    const day = person.days[item.date]
    for (const target of [person, day]) {
      target.units += 1
      if (item.holes == null) target.unsetUnits += 1
      else target.holes += item.holes
    }
  })
  return Object.values(people)
    .map((person) => ({ ...person, days: Object.values(person.days).sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.holes - a.holes || a.name.localeCompare(b.name))
}

// timestamptz(UTC)를 기기 기준 날짜 'YYYY-MM-DD'로 바꾼다. 새벽 작업이 전날로 잡히지 않게 한다.
export function localDateOf(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
