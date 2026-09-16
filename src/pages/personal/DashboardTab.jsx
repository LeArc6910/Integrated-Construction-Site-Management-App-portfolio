import { useCallback, useEffect, useState } from 'react'
import { fetchMonthAttendance } from '../../api/attendance'
import { fetchMonthExpenses } from '../../api/expense'
import { afterWithholding, effectiveRate } from '../../api/payment'
import { fetchActualSalary, fetchRateHistory } from '../../api/salary'
import CalendarNav from '../../components/CalendarNav'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { formatDays, formatWon } from '../../lib/format'

export default function DashboardTab() {
  const { user } = useAuth()
  const { year, month, setPeriod } = usePeriod()
  const [attendance, setAttendance] = useState({})
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [actual, setActual] = useState(null)
  const [rateHistory, setRateHistory] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [attendanceMap, expenses, actualAmount, history] = await Promise.all([
      fetchMonthAttendance({ userId: user.id, year, month }),
      fetchMonthExpenses({ userId: user.id, year, month }),
      fetchActualSalary({ userId: user.id, year, month }),
      fetchRateHistory({ userId: user.id }),
    ])
    return {
      attendanceMap,
      expenseTotal: expenses.reduce((sum, e) => sum + e.amount, 0),
      actualAmount,
      history,
    }
  }, [user.id, year, month])

  useEffect(() => {
    let ignore = false
    load()
      .then((result) => {
        if (ignore) return
        setAttendance(result.attendanceMap)
        setExpenseTotal(result.expenseTotal)
        setActual(result.actualAmount)
        setRateHistory(result.history)
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

  // 인건비 탭과 같은 기준: 급여 = 출근일수 × 그 달 유효 단가, 차액 = (급여 − 실급여)에서 3.3% 공제
  const salary = totalDays * effectiveRate(rateHistory, user.id, year, month)
  const gap = afterWithholding(salary - (actual ?? 0))

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
          <div className="value">{formatDays(totalDays)}</div>
        </div>
        <div className="metric-card">
          <div className="label">지출 비용</div>
          <div className="value">{formatWon(expenseTotal)}</div>
        </div>
        <div className="metric-card">
          <div className="label">급여</div>
          <div className="value">{formatWon(salary)}</div>
        </div>
        <div className="metric-card">
          <div className="label">실급여</div>
          <div className="value">{actual === null ? '미입력' : formatWon(actual)}</div>
        </div>
        <div className="metric-card">
          <div className="label">차액 (3.3% 공제)</div>
          <div className="value">{formatWon(gap)}</div>
        </div>
      </div>
      <p className="text-secondary dashboard-note">
        급여 = 출근일수 × 그 달 단가 · 실급여 = 급여 메뉴에 입력한 합계 · 차액 = (급여 − 실급여) × 96.7%
      </p>

      <span className="section-label">현장별 출근일수</span>
      <div className="card-grid">
        {Object.keys(bySite).length === 0 ? (
          <span className="text-secondary">해당 월 출근 기록 없음</span>
        ) : (
          Object.entries(bySite).map(([site, days]) => (
            <div key={site} className="metric-card">
              <div className="label">{site}</div>
              <div className="value">{formatDays(days)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
