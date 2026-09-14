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
const PAGE_SIZE = 1000

export async function fetchAllRows(queryFactory) {
  let from = 0
  let rows = []
  for (;;) {
    const { data, error } = await queryFactory().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows = rows.concat(data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}
