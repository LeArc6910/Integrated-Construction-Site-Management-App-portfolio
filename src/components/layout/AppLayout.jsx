import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { flushQueue } from '../../lib/offlineQueue'
import Sidebar from './Sidebar'
import './AppLayout.css'

export default function AppLayout() {
  // 오프라인 상태에서 쌓인 기록이 있는데 앱을 새로고침한 시점에 이미 온라인이면
  // online 이벤트가 다시 발생하지 않으므로, 로그인 후 화면이 뜰 때 한 번 확인한다.
  useEffect(() => {
    flushQueue().catch(() => {})
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
