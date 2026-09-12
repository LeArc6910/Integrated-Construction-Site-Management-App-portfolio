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
