import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCompletedPaymentSiteList } from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { formatWon } from '../../lib/format'

// 현장관리에서 세대가 전부 체크되어 "완료"로 뜨는 현장은 여기로 옮겨와 보인다.
export default function PaymentCompletedSitesTab() {
  const navigate = useNavigate()
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

      <div className="table">
        <div className="row head pay-site-row">
          <span>현장이름</span>
          <span>계약금액</span>
          <span>수령금액</span>
          <span>남은금액</span>
        </div>
        {sites.length === 0 && (
          <div className="row">
            <span className="text-secondary">완료된 현장이 없습니다.</span>
          </div>
        )}
        {sites.map((site) => (
          <div
            key={site.id}
            className="row clickable pay-site-row"
            onClick={() => navigate(`/payment/sites/${site.id}`)}
          >
            <span>{site.name}</span>
            <span className="mono">{formatWon(site.contractAmount)}</span>
            <span className="mono">{formatWon(site.receivedInMonth)}</span>
            <span className="mono">{formatWon(site.remaining)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
