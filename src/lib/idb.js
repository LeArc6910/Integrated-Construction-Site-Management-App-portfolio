// 오프라인 캐시(조회 결과)와 오프라인 큐(출근체크·지출·세대표 체크) 저장용 최소한의 IndexedDB 래퍼.
const DB_NAME = 'site-app-offline'
// 2: 조회 결과 범용 캐시(cache) 추가. 기존 저장소는 그대로 둔다.
const DB_VERSION = 2

export const STORES = {
  unitSheets: 'unitSheets', // key: siteId — 1.0.12까지 쓰던 세대표 캐시(읽기만 한다)
  outbox: 'outbox', // key: clientId
  cache: 'cache', // key: 조회 이름+인자 — 마지막으로 받은 조회 결과(src/lib/cachedCall.js)
}

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.unitSheets)) {
        db.createObjectStore(STORES.unitSheets, { keyPath: 'siteId' })
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        db.createObjectStore(STORES.outbox, { keyPath: 'clientId' })
      }
      if (!db.objectStoreNames.contains(STORES.cache)) {
        db.createObjectStore(STORES.cache, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // 새 버전의 앱이 저장소 구조를 올리려 할 때, 예전 버전 탭이 붙잡고 있지 않도록 연결을 놓아준다
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    // 열기에 실패하면 다음 호출에서 다시 시도할 수 있게 비워 둔다(실패한 약속을 계속 돌려주지 않는다)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
    // 다른 탭이 예전 버전을 열고 있어 올리지 못할 때도 무한정 기다리지 않는다
    req.onblocked = () => {
      dbPromise = null
      reject(new Error('오프라인 저장소를 열지 못했습니다. 앱이 열린 다른 탭을 닫아주세요.'))
    }
  })
  return dbPromise
}

export async function idbGet(storeName, key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGetAll(storeName) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => reject(req.error)
  })
}

export async function idbPut(storeName, value) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDelete(storeName, key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
