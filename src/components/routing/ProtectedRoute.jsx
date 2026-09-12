import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function ProtectedRoute() {
  const { session, user, loading, logout } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth-page">
        <p className="text-secondary">불러오는 중…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  // 로그인은 됐지만 profiles에 권한 정보가 없으면 어떤 메뉴도 열어주지 않는다
  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1>권한 정보 없음</h1>
          <p className="auth-message error">계정의 권한 정보를 불러오지 못했습니다. 관리자에게 문의해주세요.</p>
          <button type="button" className="btn block" onClick={logout}>
            로그아웃
          </button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
