import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMonthAttendance } from '../../api/attendance'
import { fetchMonthExpenses } from '../../api/expense'
import {
  afterWithholding,
  deleteActualSalary,
  fetchLaborDetail,
  rateForMonth,
  saveActualSalary,
} from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { buildCells, DOW, ymd } from '../../lib/calendar'
import { formatDays, formatWon } from '../../lib/format'

export default function PaymentLaborDetailPage() {
  const { userId } = useParams()
  const { year, month, setPeriod } = usePeriod()
  const now = new Date()
  const [detail, setDetail] = useState(null)
  const [attendance, setAttendance] = useState({})
  const [monthExpenses, setMonthExpenses] = useState([])
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, amount: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadDetail = useCallback(() => fetchLaborDetail({ userId }), [userId])
  const loadMonth = useCallback(
    () => fetchMonthAttendance({ userId, year, month }),
    [userId, year, month]
  )
  const loadExpenses = useCallback(
    () => fetchMonthExpenses({ userId, year, month }),
    [userId, year, month]
  )

  useEffect(() => {
    let ignore = false
    loadDetail()
      .then((data) => !ignore && setDetail(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadDetail])

  useEffect(() => {
    let ignore = false
    loadMonth()
      .then((map) => !ignore && setAttendance(map))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadMonth])

  useEffect(() => {
    let ignore = false
    loadExpenses()
      .then((rows) => !ignore && setMonthExpenses(rows))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadExpenses])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  async function handleSaveSalary() {
    setSaving(true)
    setError('')
    try {
      await saveActualSalary({
        userId,
        year: form.year,
        month: form.month,
        amount: parseInt(form.amount, 10) || 0,
      })
      setForm({ ...form, amount: '' })
      setDetail(await loadDetail())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteSalary(id) {
    setError('')
    try {
      await deleteActualSalary({ id })
      setDetail(await loadDetail())
    } catch (err) {
      setError(err.message)
    }
  }

  const cells = buildCells(year, month)
  const monthDays = Object.values(attendance)
    .flat()
    .reduce((sum, rec) => sum + rec.hours, 0)
  const monthRate = detail ? rateForMonth(detail.rateHistory, year, month) : 0
  const monthSalary = monthDays * monthRate
  const monthActual = detail?.salaries?.find((s) => s.year === year && s.month === month)?.amount ?? 0
  const monthGap = afterWithholding(monthSalary - monthActual)
  const monthExpenseTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <>
      <Link to="/payment/labor" className="back-btn">
        ← 목록으로
      </Link>
      <h2 className="page-title">{detail ? detail.name : '인건비 상세'}</h2>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      {detail && (
        <>
          <div className="card-grid">
            <div className="metric-card">
              <div className="label">
                {year}년 {month}월 단가
              </div>
              <div className="value">{formatWon(monthRate)}</div>
            </div>
            <div className="metric-card">
              <div className="label">
                {year}년 {month}월 출근일수
              </div>
              <div className="value">{formatDays(monthDays)}</div>
            </div>
            <div className="metric-card">
              <div className="label">
                {year}년 {month}월 급여
              </div>
              <div className="value">{formatWon(monthSalary)}</div>
            </div>
            <div className="metric-card">
              <div className="label">
                {year}년 {month}월 차액
              </div>
              <div className="value">{formatWon(monthGap)}</div>
            </div>
            <div className="metric-card">
              <div className="label">
                {year}년 {month}월 지출금액
              </div>
              <div className="value">{formatWon(monthExpenseTotal)}</div>
            </div>
          </div>

          <span className="section-label">출근표</span>
          <CalendarNav year={year} month={month} onChange={handleCalChange} />
          <div className="cal-grid">
            {DOW.map((w) => (
              <div key={w} className="cal-dow">
                {w}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} className="cal-cell empty" />

              const dateStr = ymd(year, month, day)
              const records = attendance[dateStr] ?? []
              const dayHours = records.reduce((sum, r) => sum + r.hours, 0)
              const cls = ['cal-cell']
              if (dayHours >= 1) cls.push('cal-full')
              else if (dayHours > 0) cls.push('cal-half')

              return (
                <div key={dateStr} className={cls.join(' ')}>
                  {day}
                  {records.map((rec) => (
                    <span key={rec.id} className="cal-site">
                      {rec.siteName}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>

          <span className="section-label">실급여 목록</span>
          <div className="table">
            <div className="row head salary-row">
              <span>연월</span>
              <span>급여</span>
              <span>실급여</span>
              <span>차액</span>
              <span />
            </div>
            {detail.salaries.length === 0 && (
              <div className="row">
                <span className="text-secondary">등록된 실급여가 없습니다.</span>
              </div>
            )}
            {detail.salaries.map((salary) => (
              <div key={salary.id} className="row salary-row">
                <span>
                  {salary.year}년 {salary.month}월
                </span>
                <span className="mono">{formatWon(salary.salary)}</span>
                <span className="mono">{formatWon(salary.amount)}</span>
                <span className="mono">{formatWon(salary.gap)}</span>
                <button type="button" className="link-btn" onClick={() => handleDeleteSalary(salary.id)}>
                  삭제
                </button>
              </div>
            ))}
          </div>

          <span className="section-label">실급여 입력</span>
          <div className="salary-form">
            <input
              type="number"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
              aria-label="연도"
            />
            <input
              type="number"
              min="1"
              max="12"
              value={form.month}
              onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}
              aria-label="월"
            />
            <input
              type="number"
              placeholder="실급여 금액"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              aria-label="실급여 금액"
            />
            <button type="button" className="btn primary" disabled={saving} onClick={handleSaveSalary}>
              저장
            </button>
          </div>
        </>
      )}
    </>
  )
}
