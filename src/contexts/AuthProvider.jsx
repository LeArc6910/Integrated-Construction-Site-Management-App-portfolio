import { useCallback, useEffect, useState } from 'react'
import { fetchProfile, signOut } from '../api/auth'
import { setCacheScope } from '../lib/cachedCall'
import { readStoredSession, supabase } from '../lib/supabase'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  // undefined: 세션 확인 전, null: 비로그인
  // 기기에 로그인 정보가 있으면 그것으로 바로 시작한다. supabase-js는 접근 토큰이 만료돼 있으면
  // 갱신이 끝난 뒤에야 세션을 알려주는데, 신호가 약하면 그 갱신이 수십 초 매달려서 그동안 앱이
  // "불러오는 중"에 멈춘다. 로그인 정보가 실제로 무효가 됐으면(다른 기기에서 로그아웃 등)
  // supabase-js가 저장된 정보를 지우고 알려주므로 그때 로그인 화면으로 간다.
  const [session, setSession] = useState(() => readStoredSession() ?? undefined)
  const [profileState, setProfileState] = useState({ userId: null, profile: null, error: null })

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // 접근 토큰은 1시간이면 만료된다. 신호가 없어 갱신하지 못하면 supabase-js는 "세션 없음"으로
      // 알려주는데, 그대로 받으면 로그인 화면으로 튕겨서 저장해 둔 내용을 볼 수 없다. 기기에 로그인
      // 정보가 남아 있으면(로그아웃한 게 아니면) 그 정보로 앱을 열어 둔다. 요청은 어차피 실패해서
      // 저장해 둔 내용이 보이고, 신호가 돌아오면 supabase-js가 토큰을 갱신해 다시 알려준다.
      if (!nextSession && event !== 'SIGNED_OUT') {
        const stored = readStoredSession()
        if (stored) {
          setSession(stored)
          return
        }
      }
      setSession(nextSession)
    })
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

  // 저장해 둔 조회 결과는 사람·보는 팀별로 따로 둔다(같은 기기를 다른 사람이 쓰거나 팀을 바꿔도 섞이지 않게)
  // effect가 아니라 렌더링 중에 바로 정한다. 자식 화면의 effect(첫 조회)가 이 컴포넌트의 effect보다
  // 먼저 실행되기 때문에, effect에서 정하면 첫 조회가 범위 없이 나간다. 같은 값을 다시 넣어도 무해하다.
  const scopeTeamId = profileState.userId === userId ? profileState.profile?.current_team_id : null
  setCacheScope(userId && scopeTeamId != null ? `${userId}:${scopeTeamId}` : '')

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
