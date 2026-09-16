import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { flushQueue } from '../../lib/offlineQueue'
import Sidebar from './Sidebar'
import './AppLayout.css'

export default function AppLayout() {
  const { user } = useAuth()
  // 개발자가 다른 팀으로 전환해 둔 상태면, 모든 화면이 그 팀 데이터라는 걸 항상 보이게 한다
  const viewingOtherTeam = user.current_team_id !== user.team_id

  // 오프라인 상태에서 쌓인 기록이 있는데 앱을 새로고침한 시점에 이미 온라인이면
  // online 이벤트가 다시 발생하지 않으므로, 로그인 후 화면이 뜰 때 한 번 확인한다.
  useEffect(() => {
    flushQueue().catch(() => {})
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        {viewingOtherTeam && (
          <p className="team-view-banner">
            지금 <b>{user.current_team_name}</b> 데이터를 보고 있습니다. (개발자 페이지에서 소속 팀으로 돌아갈 수 있습니다)
          </p>
        )}
        <Outlet />
      </main>
    </div>
  )
}
