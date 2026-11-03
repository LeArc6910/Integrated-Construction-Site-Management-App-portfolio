import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchProfileName } from '../../api/payment'
import DashboardTab from '../personal/DashboardTab'

// 결제 > 월말정산 > 사람. 그 사람의 개인 대시보드와 같은 화면에 최종 차액을 강조해서 보여준다.
export default function PaymentSettlementDetailPage() {
  const { userId } = useParams()
  const [name, setName] = useState('')

  useEffect(() => {
    let ignore = false
    fetchProfileName(userId)
      .then((value) => !ignore && setName(value))
      .catch(() => {
        // 이름을 못 받아도 대시보드는 그대로 보여준다
      })
    return () => {
      ignore = true
    }
  }, [userId])

  return (
    <div>
      <Link to="/payment/settlement" className="back-btn">
        ← 목록으로
      </Link>
      <h2 className="page-title">{name || '월말정산 상세'}</h2>
      <DashboardTab userId={userId} settlement />
    </div>
  )
}
