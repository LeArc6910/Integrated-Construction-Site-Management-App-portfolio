import { useCallback, useEffect, useState } from 'react'
import { fetchMonthAttendance } from '../../api/attendance'
import { fetchMonthExpenses } from '../../api/expense'
import { effectiveRate, salaryGap } from '../../api/payment'
import { fetchRateHistory } from '../../api/salary'
import { fetchSalaryTotalsForUser } from '../../api/salaryTax'
import { fetchSites } from '../../api/sites'
import CalendarNav from '../../components/CalendarNav'
import GrossNote from '../../components/GrossNote'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { formatDays, formatWon } from '../../lib/format'
import SalaryEntryModal from './SalaryEntryModal'

// 개인 > 대시보드. 결제 > 월말정산에서 다른 사람의 대시보드를 볼 때도 쓴다.
// userId: 볼 사람(없으면 본인). 다른 사람 것이면 실급여 입력 버튼을 숨긴다(실급여는 본인만 입력한다).
// settlement: 월말정산 화면이면 최종 차액(급여 차액 + 지출 비용)을 맨 위에 강조해서 보여준다.
export default function DashboardTab({ userId: targetUserId = null, settlement = false }) {
  const { user } = useAuth()
  const userId = targetUserId ?? user.id
  const isSelf = userId === user.id
  const { year, month, setPeriod } = usePeriod()
  const [attendance, setAttendance] = useState({})
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [actual, setActual] = useState(null)
  const [gross, setGross] = useState(0)
  const [salaryEntries, setSalaryEntries] = useState([])
  const [rateHistory, setRateHistory] = useState([])
  const [sites, setSites] = useState([])
  const [salaryModal, setSalaryModal] = useState(null) // null | 미리 고를 현장 id
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [attendanceMap, expenses, salaryTotals, history] = await Promise.all([
      fetchMonthAttendance({ userId, year, month }),
      fetchMonthExpenses({ userId, year, month }),
      fetchSalaryTotalsForUser({ userId, year, month }),
      fetchRateHistory({ userId }),
    ])
    return {
      attendanceMap,
      expenseTotal: expenses.reduce((sum, e) => sum + e.amount, 0),
      actualAmount: salaryTotals.actual,
      grossAmount: salaryTotals.gross,
      entries: salaryTotals.entries,
      history,
    }
  }, [userId, year, month])

  function apply(result) {
    setAttendance(result.attendanceMap)
    setExpenseTotal(result.expenseTotal)
    setActual(result.actualAmount)
    setGross(result.grossAmount)
    setSalaryEntries(result.entries)
    setRateHistory(result.history)
  }

  useEffect(() => {
    let ignore = false
    load()
      .then((result) => !ignore && apply(result))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  // 실급여 입력 창의 현장 목록(본인 화면에서만 필요)
  useEffect(() => {
    if (!isSelf) return
    fetchSites()
      .then(setSites)
      .catch((err) => setError(err.message))
  }, [isSelf])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  async function handleSalarySaved(saved) {
    setSalaryModal(null)
    if (saved.year !== year || saved.month !== month) {
      setPeriod(saved.year, saved.month)
      return
    }
    try {
      apply(await load())
    } catch (err) {
      setError(err.message)
    }
  }

  const records = Object.values(attendance).flat()
  const totalDays = records.reduce((sum, r) => sum + r.hours, 0)
  const bySite = {}
  records.forEach((r) => {
    if (!bySite[r.siteId]) bySite[r.siteId] = { siteId: r.siteId, name: r.siteName, days: 0, salary: 0, entered: false }
    bySite[r.siteId].days += r.hours
  })
  salaryEntries.forEach((entry) => {
    const site = bySite[entry.siteId]
    if (!site) return
    site.salary += entry.amount
    site.entered = true
  })

  // 인건비 탭과 같은 기준: 급여 = 출근일수 × 그 달 유효 단가,
  // 차액 = (급여 − 실급여 제외 전 금액)에서 3.3% 공제
  const salary = totalDays * effectiveRate(rateHistory, userId, year, month)
  const gap = salaryGap({ salary, gross })

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      {settlement && (
        <div className="metric-card settlement-final">
          <div className="label">최종 차액 (급여 차액 + 지출 비용)</div>
          <div className="value">{formatWon(gap + expenseTotal)}</div>
        </div>
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
          <GrossNote gross={gross} />
        </div>
        <div className="metric-card">
          <div className="label">차액 (3.3% 공제)</div>
          <div className="value">{formatWon(gap)}</div>
        </div>
      </div>
      <p className="text-secondary dashboard-note">
        급여 = 출근일수 × 그 달 단가 · 실급여 = 급여 메뉴에 입력한 합계 · 차액 = (급여 − 실급여 제외 전 금액) × 96.7%
        <br />
        제외 전 금액 = 받은 실급여에서 빠진 세금을 되돌린 금액(현장별 설정, 기본 7일 이하 3.3% / 초과 9.6%)
      </p>

      <span className="section-label">현장별 출근일수</span>
      <div className="card-grid">
        {Object.keys(bySite).length === 0 ? (
          <span className="text-secondary">해당 월 출근 기록 없음</span>
        ) : (
          Object.values(bySite).map((site) => (
            <div key={site.siteId} className="metric-card">
              <div className="label">{site.name}</div>
              <div className="value">{formatDays(site.days)}</div>
              <div className={`site-salary-status${site.entered ? ' entered' : ''}`}>
                실급여 {site.entered ? formatWon(site.salary) : '미입력'}
              </div>
              {isSelf && (
                <button type="button" className="btn small site-salary-btn" onClick={() => setSalaryModal(site.siteId)}>
                  실급여 입력
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {salaryModal !== null && (
        <SalaryEntryModal
          userId={user.id}
          sites={sites}
          initial={{ year, month, siteId: salaryModal }}
          onClose={() => setSalaryModal(null)}
          onSaved={handleSalarySaved}
        />
      )}
    </div>
  )
}
