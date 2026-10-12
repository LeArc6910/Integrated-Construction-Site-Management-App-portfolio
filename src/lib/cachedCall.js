import { idbGet, idbPut, STORES } from './idb'

// 조회 결과를 기기에 저장해 두고, 서버가 늦거나 끊겼을 때 마지막으로 받은 내용을 대신 보여준다.
//
// 왜 필요한가: 현장은 신호가 약한 곳이 많다. 신호가 조금이라도 잡히면 브라우저는 "온라인"이라고
// 하므로(navigator.onLine), 그 값만 믿으면 응답이 오지 않는 요청을 끝없이 기다리게 된다.
// 그래서 "끊겼는지"가 아니라 "제때 답이 왔는지"로 판단한다.
//
// 동작:
// 1. 서버에 요청한다. WAIT_MS 안에 답이 오면 그 값을 저장하고 돌려준다.
// 2. 그 안에 답이 없거나 실패하면, 저장해 둔 값이 있을 때 그것을 돌려준다(오래된 값임을 상태로 알린다).
//    요청은 뒤에서 계속 기다리다가 답이 오면 저장하고, "최신 내용이 도착했다"고 알린다.
// 3. 저장해 둔 값도 없으면 서버 답을 끝까지 기다린다(요청 제한 시간은 supabase.js에서 건다).
//
// 화면이 다시 조회하면(reload) 뒤늦게 도착해 있던 값을 바로 돌려준다. 그래서 "반영"을 눌렀을 때
// 약한 신호에서 같은 요청을 처음부터 다시 기다리지 않는다.
const WAIT_MS = 4000
// 방금 서버가 제때 답하지 못했다면 신호가 약한 것이다. 그 뒤 조회들은 짧게만 기다리고 저장해 둔
// 내용을 먼저 보여준다(화면을 옮길 때마다 4초씩 기다리지 않게). 서버가 다시 제때 답하면 원래대로 돌아간다.
const SLOW_WAIT_MS = 2000
const SLOW_MEMORY_MS = 60000
let lastSlowAt = 0

// 사람·팀이 바뀌면 다른 사람의 저장 값을 보여주지 않도록 키 앞에 붙인다(AuthProvider가 정한다)
let scope = ''
export function setCacheScope(value) {
  scope = value ?? ''
}

// 뒤늦게 도착한 조회 결과(key → { data, usedAt }). 화면이 다음에 같은 조회를 하면 꺼내 쓴다.
// 처음 꺼낸 뒤 잠깐(LATE_REUSE_MS)은 다시 꺼낼 수 있게 둔다. 화면이 새로 그려질 때 같은 조회가
// 연달아 두 번 불리는 경우가 있어서다(개발 모드의 StrictMode, 같은 조회를 쓰는 컴포넌트 둘).
const late = new Map()
const LATE_REUSE_MS = 3000

function takeLate(key) {
  const entry = late.get(key)
  if (!entry) return null
  const now = Date.now()
  if (entry.usedAt == null) entry.usedAt = now
  else if (now - entry.usedAt > LATE_REUSE_MS) {
    late.delete(key)
    return null
  }
  return entry
}

// ---- 연결 상태 알림 (ConnectionBanner가 듣는다) ----
// staleSince: 지금 화면에 오래된 값을 보여주고 있으면 그중 가장 오래된 저장 시각, 아니면 null
// freshArrived: 화면을 최신 내용으로 바꿀 수 있는 상태("반영" 버튼)
//
// "반영"은 뒤에서 받고 있는 요청이 모두 끝난 뒤에만 띄운다. 작은 요청 하나가 먼저 성공했다고 띄우면,
// 눌렀을 때 아직 오고 있는 큰 조회를 처음부터 다시 기다리게 된다.
const staleKeys = new Map() // key → { cachedAt, pending: 뒤에서 서버 답을 기다리는 중 }
// 오래된 값을 보여준 뒤에 서버가 한 번이라도 제대로 답했는지(연결이 살아 있다는 근거)
let recovered = false
const listeners = new Set()

function status() {
  const entries = [...staleKeys.values()]
  const times = entries.map((entry) => entry.cachedAt).sort()
  return {
    staleSince: times[0] ?? null,
    freshArrived: entries.length > 0 && recovered && !entries.some((entry) => entry.pending),
  }
}

function notify() {
  const current = status()
  listeners.forEach((listener) => listener(current))
}

export function subscribeCacheStatus(listener) {
  listeners.add(listener)
  listener(status())
  return () => listeners.delete(listener)
}

// "반영"을 누르거나 화면을 옮겼을 때 알림을 지운다. 도착해 있는 최신 값(late)은 그대로 둔다.
export function clearCacheStatus() {
  staleKeys.clear()
  recovered = false
  notify()
}

// scoped가 false면 사람·팀과 무관한 키다(권한 정보처럼 그 범위를 정하기 전에 읽어야 하는 값)
function fullKey(key, scoped) {
  return scoped ? `${scope}|${key}` : `|${key}`
}

async function readCache(key, scoped) {
  try {
    return await idbGet(STORES.cache, fullKey(key, scoped))
  } catch {
    // 저장소를 못 여는 환경(사생활 보호 모드 등)이면 캐시 없이 동작한다
    return null
  }
}

async function writeCache(key, data, scoped) {
  try {
    await idbPut(STORES.cache, { key: fullKey(key, scoped), data, cachedAt: new Date().toISOString() })
  } catch {
    // 저장에 실패해도 조회 결과는 그대로 돌려준다
  }
}

// 통신 문제로 실패한 것인지(서버가 거절한 것이 아니라). 저장을 대기 큐로 돌릴지 정할 때도 쓴다.
export function isNetworkError(error) {
  if (!error) return false
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true
  const message = String(error.message ?? error)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|시간 안에 응답/i.test(
    message
  )
}

const TIMED_OUT = Symbol('timed-out')

// 반환: { data, stale, cachedAt } — stale이면 저장해 둔 값이고 cachedAt은 그 값을 받은 시각이다.
export async function cachedCallInfo(key, fetcher, { wait = WAIT_MS, scoped = true } = {}) {
  const arrived = takeLate(key)
  if (arrived) {
    if (staleKeys.delete(key)) notify()
    return { data: arrived.data, stale: false, cachedAt: null }
  }

  const network = Promise.resolve()
    .then(fetcher)
    .then(async (data) => {
      await writeCache(key, data, scoped)
      return data
    })

  let first
  if (navigator.onLine) {
    let timer
    const timeout = new Promise((resolve) => {
      const recentlySlow = Date.now() - lastSlowAt < SLOW_MEMORY_MS
      timer = setTimeout(() => resolve(TIMED_OUT), recentlySlow ? Math.min(wait, SLOW_WAIT_MS) : wait)
    })
    first = await Promise.race([
      network.then(
        (data) => ({ ok: true, data }),
        (error) => ({ ok: false, error })
      ),
      timeout,
    ])
    clearTimeout(timer)
  } else {
    // 완전히 끊긴 상태면 기다리지 않고 바로 저장해 둔 값을 본다
    first = TIMED_OUT
  }

  if (first !== TIMED_OUT && first.ok) {
    lastSlowAt = 0
    const wasStale = staleKeys.delete(key)
    // 서버가 다시 제때 답했다. 화면에 저장해 둔 값이 아직 남아 있으면(다른 조회들) 연결이 돌아온 것으로 본다.
    if (staleKeys.size > 0) recovered = true
    if (wasStale || staleKeys.size > 0) notify()
    return { data: first.data, stale: false, cachedAt: null }
  }

  // 온라인이라는데 제때 답이 없었거나 통신 오류였다 → 당분간 짧게 기다린다
  if (navigator.onLine && (first === TIMED_OUT || isNetworkError(first.error))) lastSlowAt = Date.now()

  const cached = await readCache(key, scoped)
  if (cached) {
    const entry = { cachedAt: cached.cachedAt, pending: true }
    staleKeys.set(key, entry)
    notify()
    // 뒤에서 답이 오면 다음 조회 때 바로 쓸 수 있게 잡아 둔다
    network.then(
      (data) => {
        late.set(key, { data, usedAt: null })
        entry.pending = false
        if (staleKeys.get(key) === entry) {
          recovered = true
          notify()
        }
      },
      () => {
        entry.pending = false
        if (staleKeys.get(key) === entry) notify()
      }
    )
    return { data: cached.data, stale: true, cachedAt: cached.cachedAt }
  }

  if (first !== TIMED_OUT) throw first.error
  // 저장해 둔 값이 없으면 서버 답을 끝까지 기다린다
  return { data: await network, stale: false, cachedAt: null }
}

export async function cachedCall(key, fetcher, options) {
  return (await cachedCallInfo(key, fetcher, options)).data
}

// 조회 함수를 감싸 캐시를 붙인다. 키는 이름 + 인자(JSON)로 만든다.
//   export const fetchSites = cached('sites', async () => { ... })
export function cached(name, fn) {
  return (...args) => cachedCall(`${name}:${JSON.stringify(args)}`, () => fn(...args))
}

// 저장(쓰기) 요청이 나가면 뒤늦게 도착해 있던 조회 결과는 버린다. 그 값은 저장 전의 내용이라,
// 저장 뒤 다시 조회했을 때 그것을 돌려주면 방금 바꾼 내용이 사라진 것처럼 보인다.
export function dropLateResults() {
  late.clear()
}
