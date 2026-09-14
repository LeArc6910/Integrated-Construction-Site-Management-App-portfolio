import { useCallback, useEffect, useState } from 'react'
import { IconPaperclip } from '@tabler/icons-react'
import { Link, useParams } from 'react-router-dom'
import { fetchMonthAttendance } from '../../api/attendance'
import { fetchMonthExpenses, getReceiptUrl } from '../../api/expense'
import { fetchHrProfile } from '../../api/hr'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { buildCells, DOW, ymd } from '../../lib/calendar'
import { formatWon } from '../../lib/format'

const EXPENSE_COLUMNS = '0.9fr 1fr 1.3fr 0.9fr 0.9fr'

export default function HrDetailPage() {
  const { userId } = useParams()
  const { year, month, setPeriod } = usePeriod()
  const [profile, setProfile] = useState(null)
  const [attendance, setAttendance] = useState({})
  const [expenses, setExpenses] = useState([])
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

  const loadMonth = useCallback(
    () =>
      Promise.all([
        fetchMonthAttendance({ userId, year, month }),
        fetchMonthExpenses({ userId, year, month }),
      ]),
    [userId, year, month]
  )

  useEffect(() => {
    let ignore = false
    loadMonth()
      .then(([attendanceMap, expenseList]) => {
        if (ignore) return
        setAttendance(attendanceMap)
        setExpenses(expenseList)
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadMonth])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  async function handleViewReceipt(path) {
    try {
      window.open(await getReceiptUrl(path), '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    }
  }

  const cells = buildCells(year, month)
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0)

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

      <span className="section-label">지출 비용</span>
      <div className="table">
        <div className="row head" style={{ gridTemplateColumns: EXPENSE_COLUMNS }}>
          <span>날짜</span>
          <span>장소</span>
          <span>지출 내용</span>
          <span>금액</span>
          <span>영수증</span>
        </div>
        {expenses.length === 0 && (
          <div className="row">
            <span className="text-secondary">해당 월 지출 내역 없음</span>
          </div>
        )}
        {expenses.map((e) => (
          <div key={e.id} className="row" style={{ gridTemplateColumns: EXPENSE_COLUMNS }}>
            <span>{e.date}</span>
            <span>{e.place}</span>
            <span>{e.content}</span>
            <span className="mono">{formatWon(e.amount)}</span>
            <span>
              {e.receiptPath ? (
                <button type="button" className="link-btn" onClick={() => handleViewReceipt(e.receiptPath)}>
                  <IconPaperclip size={14} stroke={1.75} /> 첨부됨
                </button>
              ) : (
                '-'
              )}
            </span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 10, fontSize: 13 }}>
        합계: <span className="mono">{formatWon(expenseTotal)}</span>
      </p>
    </>
  )
}
