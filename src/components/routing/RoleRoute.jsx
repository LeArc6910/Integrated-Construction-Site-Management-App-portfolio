import { Navigate, Outlet } from 'react-router-dom'
import { canAccessMenu } from '../../config/menu'
import { useAuth } from '../../hooks/useAuth'

// 메뉴가 숨겨져 있어도 URL 직접 입력으로 들어오는 경우를 막는다
export default function RoleRoute({ menuKey }) {
  const { user } = useAuth()

  if (!canAccessMenu(menuKey, user.role)) return <Navigate to="/personal" replace />
  return <Outlet />
}
