import { Outlet } from 'react-router-dom'
import TabBar from '../../components/TabBar'

const TABS = [
  { to: '/personal/dashboard', label: '대시보드' },
  { to: '/personal/attendance', label: '출근체크' },
  { to: '/personal/report', label: '작업보고' },
  { to: '/personal/expense', label: '지출비용' },
  { to: '/personal/salary', label: '급여' },
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
