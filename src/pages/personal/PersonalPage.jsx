import { Outlet } from 'react-router-dom'
import TabBar from '../../components/TabBar'

const TABS = [
  { to: '/personal/dashboard', label: '대시보드' },
  { to: '/personal/attendance', label: '출근체크' },
  { to: '/personal/expense', label: '지출비용' },
]

export default function PersonalPage() {
  return (
    <>
      <h2 className="page-title">개인</h2>
      <TabBar tabs={TABS} />
      <Outlet />
    </>
  )
}
