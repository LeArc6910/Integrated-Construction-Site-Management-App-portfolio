import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { clearCacheStatus } from '../../lib/cachedCall'
import { flushQueue } from '../../lib/offlineQueue'
import ConnectionBanner from './ConnectionBanner'
import NoticeBanner from './NoticeBanner'
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

  // 화면을 옮기면 이전 화면의 "저장해 둔 내용" 알림은 지운다(새 화면이 필요하면 다시 알린다)
  const { pathname } = useLocation()
  useEffect(() => clearCacheStatus, [pathname])

  // [반영]/[다시 시도]를 누르면 지금 화면만 새로 그려서 다시 조회하게 한다. 뒤늦게 도착해 있던
  // 최신 내용은 바로 쓰이므로 약한 신호에서도 다시 기다리지 않는다. 입력 중이던 내용이 사라질 수
  // 있어서 자동으로 하지 않고 버튼을 눌렀을 때만 한다.
  const [refreshKey, setRefreshKey] = useState(0)
  function handleRefresh() {
    clearCacheStatus()
    setRefreshKey((key) => key + 1)
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <NoticeBanner />
        <ConnectionBanner onRefresh={handleRefresh} />
        {viewingOtherTeam && (
          <p className="team-view-banner">
            지금 <b>{user.current_team_name}</b> 데이터를 보고 있습니다. (개발자 페이지에서 소속 팀으로 돌아갈 수 있습니다)
          </p>
        )}
        <div key={refreshKey}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
