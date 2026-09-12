// 금액은 DB에 정수(원 단위)로 저장하고, 화면에 보일 때만 이 함수로 포맷한다.
export function formatWon(amount) {
  return `₩${(amount ?? 0).toLocaleString()}`
}

// 출근일수는 공수(1일/0.5일) 합계라서 소수점이 나올 수 있다. 0.5 단위만 소수점을 남긴다.
export function formatDays(days) {
  return `${Number.isInteger(days) ? days : days.toFixed(1)}일`
}
