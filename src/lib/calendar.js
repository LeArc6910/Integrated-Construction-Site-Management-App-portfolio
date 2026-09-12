export const DOW = ['일', '월', '화', '수', '목', '금', '토']

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

// 달력 격자에 쓸 셀 목록. 1일이 시작되는 요일만큼 앞을 null로 비운다.
export function buildCells(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = Array.from({ length: firstDow }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  return cells
}
