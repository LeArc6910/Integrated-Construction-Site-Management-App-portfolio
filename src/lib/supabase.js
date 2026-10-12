import { createClient } from '@supabase/supabase-js'
import { dropLateResults } from './cachedCall'

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

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// supabase-js가 세션을 저장하는 키(기본 이름 규칙). 서버에 묻지 않고 "이 기기에 로그인해 둔 사람"을 알 때 쓴다.
const SESSION_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

// 기기에 저장된 로그인 정보. 접근 토큰이 만료됐더라도(1시간) 갱신 토큰이 있으면 돌려준다.
// 신호가 없어 토큰을 갱신하지 못할 때도 앱을 열어 저장해 둔 내용을 보여주기 위해서다.
export function readStoredSession() {
  try {
    const stored = JSON.parse(authStorage.getItem(SESSION_STORAGE_KEY) ?? 'null')
    return stored?.user && stored.refresh_token ? stored : null
  } catch {
    return null
  }
}

// 요청 제한 시간. 신호가 약한 곳에서는 응답이 오지도, 실패하지도 않은 채 요청이 매달려 있어서
// 화면이 "불러오는 중"에서 끝나지 않는다. 일정 시간이 지나면 끊고 통신 오류로 돌려준다.
const REQUEST_TIMEOUT_MS = 10000
// 영수증 사진 같은 파일 전송은 느린 망에서 오래 걸릴 수 있어 넉넉히 둔다
const UPLOAD_TIMEOUT_MS = 60000

async function timedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  const method = (init.method ?? 'GET').toUpperCase()
  const isData = url.includes('/rest/v1/') || url.includes('/storage/v1/')

  if (isData) {
    // 로그인해 둔 기기인데 요청에 사용자 토큰 대신 공개 키만 실려 있으면, 토큰 갱신에 실패한 것이다
    // (supabase-js는 그럴 때 공개 키로 요청을 보낸다). 그대로 보내면 권한 정책에 걸려 "빈 결과"가
    // 정상 응답처럼 돌아오고, 그 빈 결과가 저장해 둔 내용을 덮어쓴다. 보내지 않고 통신 오류로 처리한다.
    const authorization = new Headers(init.headers).get('Authorization')
    if (authorization === `Bearer ${SUPABASE_KEY}` && readStoredSession()) {
      throw new TypeError('Failed to fetch: 로그인 정보를 갱신하지 못했습니다')
    }
    if (method !== 'GET' && method !== 'HEAD') dropLateResults()
  }

  const timeoutMs = url.includes('/storage/v1/') ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onOuterAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onOuterAbort)
  try {
    return await globalThis.fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new TypeError(`Failed to fetch: ${timeoutMs / 1000}초 안에 응답이 없습니다`)
    }
    throw error
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', onOuterAbort)
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: authStorage },
  global: { fetch: timedFetch },
})

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
