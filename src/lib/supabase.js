import { createClient } from '@supabase/supabase-js'

const AUTO_LOGIN_KEY = 'auto-login'

export function getAutoLogin() {
  return localStorage.getItem(AUTO_LOGIN_KEY) === 'true'
}

export function setAutoLogin(enabled) {
  localStorage.setItem(AUTO_LOGIN_KEY, String(enabled))
}

// 자동 로그인: 체크 시 localStorage(계속 유지), 미체크 시 sessionStorage(앱을 닫으면 로그아웃)
const authStorage = {
  getItem: (key) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key, value) => {
    const [target, other] = getAutoLogin() ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
    target.setItem(key, value)
    other.removeItem(key)
  },
  removeItem: (key) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { storage: authStorage } }
)

// PostgREST는 한 번에 최대 1000행만 돌려준다(기본 db-max-rows). 세대 체크처럼 몇천 건이
// 쌓일 수 있는 테이블은 이 한계에 조용히 걸려 뒷부분 데이터가 빠질 수 있어서, range로
// 나눠 끝까지 읽는다. queryFactory는 호출할 때마다 새 쿼리 빌더를 만들어 반환해야 한다.
//
// 나눠 읽을 때는 반드시 고유한 순서로 정렬해야 한다. 정렬이 없으면 Postgres는 행 순서를 보장하지
// 않아서(페이지마다 실행 계획이 달라지거나 그 사이 다른 사람이 행을 고치면 순서가 바뀐다) 페이지
// 경계에서 행이 빠지거나 겹친다. 실제로 체크가 수천 건인 현장의 세대표에서 체크된 칸이 군데군데
// 빈칸으로 보였다(2026-10). 그래서 정렬을 호출하는 쪽에 맡기지 않고 여기서 항상 붙인다.
// orderBy: 행을 하나로 정하는 컬럼(기본 id). id가 없는 테이블은 기본 키 컬럼들을 배열로 넘긴다.
const PAGE_SIZE = 1000

export async function fetchAllRows(queryFactory, orderBy = 'id') {
  const columns = Array.isArray(orderBy) ? orderBy : [orderBy]
  let from = 0
  let rows = []
  for (;;) {
    const query = columns.reduce((q, column) => q.order(column), queryFactory())
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows = rows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}
