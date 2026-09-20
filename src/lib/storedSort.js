// 목록·표의 정렬 상태({ key, asc })를 기기에 기억해둔다. 다음에 그 화면으로 돌아와도
// 마지막에 보던 순서 그대로 보이게 하려는 것이라, 저장에 실패해도 화면은 그냥 동작해야 한다.

// validKeys에 없는 값이 나오면(예전 형식이거나 열 구성이 바뀐 경우) 기본값으로 돌아간다.
export function loadSort(storageKey, validKeys, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (validKeys.includes(saved?.key)) return { key: saved.key, asc: Boolean(saved.asc) }
  } catch {
    // 저장소를 못 쓰거나 저장된 값이 깨졌으면 기본값으로 시작한다
  }
  return fallback
}

export function saveSort(storageKey, sort) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(sort))
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 이번 화면에서만 유지된다
  }
}
