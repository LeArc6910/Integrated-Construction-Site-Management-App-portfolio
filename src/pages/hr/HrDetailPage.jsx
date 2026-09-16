import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMonthAttendance } from '../../api/attendance'
import { fetchHrProfile } from '../../api/hr'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { buildCells, DOW, ymd } from '../../lib/calendar'

// 지출 비용 내역은 결제 > 지출비용에서 인원별로 펼쳐 본다.
export default function HrDetailPage() {
  const { userId } = useParams()
  const { year, month, setPeriod } = usePeriod()
  const [profile, setProfile] = useState(null)
  const [attendance, setAttendance] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    fetchHrProfile({ userId })
      .then((data) => !ignore && setProfile(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [userId])

  const loadMonth = useCallback(() => fetchMonthAttendance({ userId, year, month }), [userId, year, month])

  useEffect(() => {
    let ignore = false
    loadMonth()
      .then((attendanceMap) => !ignore && setAttendance(attendanceMap))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadMonth])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  const cells = buildCells(year, month)

  return (
    <>
      <Link to="/hr" className="back-btn">
        ← 목록으로
      </Link>
      <h2 className="page-title">{profile ? profile.name : '인사 상세'}</h2>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      <span className="section-label" style={{ marginTop: 0 }}>
        출근표
      </span>
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
          const totalHours = records.reduce((sum, r) => sum + r.hours, 0)
          const cls = ['cal-cell']
          if (totalHours >= 1) cls.push('cal-full')
          else if (totalHours > 0) cls.push('cal-half')

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
    </>
  )
}
