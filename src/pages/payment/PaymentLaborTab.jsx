import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLaborList } from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import { formatWon } from '../../lib/format'

export default function PaymentLaborTab() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
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
    setYear(y)
    setMonth(m)
  }

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

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
