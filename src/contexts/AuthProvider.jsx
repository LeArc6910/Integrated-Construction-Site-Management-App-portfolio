import { useCallback, useEffect, useState } from 'react'
import { fetchProfile, signOut } from '../api/auth'
import { supabase } from '../lib/supabase'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  // undefined: 세션 확인 전, null: 비로그인
  const [session, setSession] = useState(undefined)
  const [profileState, setProfileState] = useState({ userId: null, profile: null, error: null })

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  // onAuthStateChange 콜백 안에서 Supabase를 await하면 교착이 생길 수 있어 별도 effect에서 조회한다
  useEffect(() => {
    if (!userId) return
    let ignore = false
    fetchProfile(userId)
      .then((profile) => !ignore && setProfileState({ userId, profile, error: null }))
      .catch((error) => !ignore && setProfileState({ userId, profile: null, error }))
    return () => {
      ignore = true
    }
  }, [userId])

  const profileLoaded = Boolean(userId) && profileState.userId === userId
  const loading = session === undefined || (Boolean(userId) && !profileLoaded)
  const user =
    profileLoaded && profileState.profile
      ? { id: userId, email: session.user.email, ...profileState.profile }
      : null

  // 설정에서 이름·연락처를 바꾼 뒤 context의 user를 최신 상태로 되돌리기 위해 노출한다
  const refreshProfile = useCallback(() => {
    if (!userId) return Promise.resolve()
    return fetchProfile(userId)
      .then((profile) => setProfileState({ userId, profile, error: null }))
      .catch((error) => setProfileState({ userId, profile: null, error }))
  }, [userId])

  const value = {
    session,
    user,
    loading,
    profileError: profileLoaded ? profileState.error : null,
    logout: () => signOut(),
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
