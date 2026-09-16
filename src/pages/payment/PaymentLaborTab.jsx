import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLaborList } from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { formatWon } from '../../lib/format'

export default function PaymentLaborTab() {
  const navigate = useNavigate()
  const { year, month, setPeriod } = usePeriod()
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(() => fetchLaborList({ year, month }), [year, month])

  useEffect(() => {
    let ignore = false
    load()
      .then((data) => !ignore && setRows(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  // 차액 합계는 표에 보이는 사람별 차액(각각 3.3% 공제 후 원 단위 절사)을 그대로 더해 표와 맞춘다
  const totals = rows.reduce(
    (sum, row) => ({ salary: sum.salary + row.salary, actual: sum.actual + row.actual, gap: sum.gap + row.gap }),
    { salary: 0, actual: 0, gap: 0 }
  )

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">급여 합계</div>
          <div className="value">{formatWon(totals.salary)}</div>
        </div>
        <div className="metric-card">
          <div className="label">실급여 합계</div>
          <div className="value">{formatWon(totals.actual)}</div>
        </div>
        <div className="metric-card">
          <div className="label">차액 합계</div>
          <div className="value">{formatWon(totals.gap)}</div>
        </div>
      </div>

      <div className="table">
        <div className="row head pay-person-row">
          <span>이름</span>
          <span>급여</span>
          <span>실급여</span>
          <span>차액</span>
        </div>
        {rows.length === 0 && (
          <div className="row">
            <span className="text-secondary">등록된 인원이 없습니다.</span>
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.userId}
            className="row clickable pay-person-row"
            onClick={() => navigate(`/payment/labor/${row.userId}`)}
          >
            <span>{row.name}</span>
            <span className="mono">{formatWon(row.salary)}</span>
            <span className="mono">{formatWon(row.actual)}</span>
            <span className="mono">{formatWon(row.gap)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
