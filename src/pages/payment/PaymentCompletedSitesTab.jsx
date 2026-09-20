import { useCallback, useEffect, useState } from 'react'
import { fetchCompletedPaymentSiteList } from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import SiteTotalsCards from '../../components/SiteTotalsCards'
import PaymentSiteTable from './PaymentSiteTable'

// 현장관리에서 세대가 전부 체크되어 "완료"로 뜨는 현장은 여기로 옮겨와 보인다.
export default function PaymentCompletedSitesTab() {
  const { year, month, setPeriod } = usePeriod()
  const [sites, setSites] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(() => fetchCompletedPaymentSiteList({ year, month }), [year, month])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  useEffect(() => {
    let ignore = false
    load()
      .then((rows) => !ignore && setSites(rows))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <SiteTotalsCards sites={sites} month={month} />

      <PaymentSiteTable
        sites={sites}
        emptyText="완료된 현장이 없습니다."
        storageKey="paymentCompletedSitesSort"
      />
    </div>
  )
}
