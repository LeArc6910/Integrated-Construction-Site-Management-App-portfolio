import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMonthAttendance } from '../../api/attendance'
import { deleteActualSalary, fetchLaborDetail, saveActualSalary } from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import { buildCells, DOW, ymd } from '../../lib/calendar'
import { formatDays, formatWon } from '../../lib/format'

export default function PaymentLaborDetailPage() {
  const { userId } = useParams()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [detail, setDetail] = useState(null)
  const [attendance, setAttendance] = useState({})
  const [form, setForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, amount: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadDetail = useCallback(() => fetchLaborDetail({ userId }), [userId])
  const loadMonth = useCallback(
    () => fetchMonthAttendance({ userId, year, month }),
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

  function handleCalChange({ year: y, month: m }) {
    setYear(y)
    setMonth(m)
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
  const monthDays = Object.values(attendance).reduce((sum, rec) => sum + rec.hours, 0)

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
              <div className="label">단가</div>
              <div className="value">{formatWon(detail.rate)}</div>
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
              <div className="value">{formatWon(monthDays * detail.rate)}</div>
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
              const rec = attendance[dateStr]
              const cls = ['cal-cell']
              if (rec) cls.push(rec.hours === 1 ? 'cal-full' : 'cal-half')

              return (
                <div key={dateStr} className={cls.join(' ')}>
                  {day}
                  {rec && <span className="cal-site">{rec.siteName}</span>}
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
