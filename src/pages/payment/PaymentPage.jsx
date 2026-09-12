import { Outlet } from 'react-router-dom'
import TabBar from '../../components/TabBar'

const TABS = [
  { to: '/payment/sites', label: '현장' },
  { to: '/payment/labor', label: '인건비' },
]

export default function PaymentPage() {
  return (
    <>
      <h2 className="page-title">결제</h2>
      <TabBar tabs={TABS} />
      <Outlet />
    </>
  )
}
