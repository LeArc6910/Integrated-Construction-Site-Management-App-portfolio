import { useCallback, useEffect, useState } from 'react'
import { fetchMonthAttendance } from '../../api/attendance'
import { fetchMonthExpenses } from '../../api/expense'
import { fetchActualSalary } from '../../api/salary'
import CalendarNav from '../../components/CalendarNav'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'

function won(amount) {
  return `₩${amount.toLocaleString()}`
}

export default function DashboardTab() {
  const { user } = useAuth()
  const { year, month, setPeriod } = usePeriod()
  const [attendance, setAttendance] = useState({})
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [salary, setSalary] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [attendanceMap, expenses, salaryAmount] = await Promise.all([
      fetchMonthAttendance({ userId: user.id, year, month }),
      fetchMonthExpenses({ userId: user.id, year, month }),
      fetchActualSalary({ userId: user.id, year, month }),
    ])
    return {
      attendanceMap,
      expenseTotal: expenses.reduce((sum, e) => sum + e.amount, 0),
      salaryAmount,
    }
  }, [user.id, year, month])

  useEffect(() => {
    let ignore = false
    load()
      .then((result) => {
        if (ignore) return
        setAttendance(result.attendanceMap)
        setExpenseTotal(result.expenseTotal)
        setSalary(result.salaryAmount)
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  const records = Object.values(attendance).flat()
  const totalDays = records.reduce((sum, r) => sum + r.hours, 0)
  const bySite = {}
  records.forEach((r) => {
    bySite[r.siteName] = (bySite[r.siteName] ?? 0) + r.hours
  })

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
          <div className="label">총 출근일수</div>
          <div className="value">{totalDays}일</div>
        </div>
        <div className="metric-card">
          <div className="label">지출 비용</div>
          <div className="value">{won(expenseTotal)}</div>
        </div>
        <div className="metric-card">
          <div className="label">실급여</div>
          <div className="value">{salary === null ? '미입력' : won(salary)}</div>
        </div>
      </div>

      <span className="section-label">현장별 출근일수</span>
      <div className="card-grid">
        {Object.keys(bySite).length === 0 ? (
          <span className="text-secondary">해당 월 출근 기록 없음</span>
        ) : (
          Object.entries(bySite).map(([site, days]) => (
            <div key={site} className="metric-card">
              <div className="label">{site}</div>
              <div className="value">{days}일</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
