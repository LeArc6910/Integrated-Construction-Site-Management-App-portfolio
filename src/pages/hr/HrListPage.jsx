import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHrList, updateRate, updateRole } from '../../api/hr'
import CalendarNav from '../../components/CalendarNav'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { formatDays, formatWon } from '../../lib/format'

const ROLE_OPTIONS = [ROLES.MEMBER, ROLES.LEADER, ROLES.DEVELOPER]

export default function HrListPage() {
  const { user } = useAuth()
  const isDev = user.role === ROLES.DEVELOPER
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(() => fetchHrList({ year, month }), [year, month])

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

  async function reload() {
    try {
      setRows(await load())
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleEditRate(row) {
    const input = window.prompt('단가를 입력하세요', row.rate)
    if (input === null) return
    const rate = parseInt(input, 10)
    if (Number.isNaN(rate)) return

    setError('')
    try {
      await updateRate({ userId: row.userId, rate })
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleChangeRole(row, role) {
    setError('')
    try {
      await updateRole({ userId: row.userId, role })
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h2 className="page-title">인사 관리</h2>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="table">
        <div className="row head hr-row">
          <span>이름</span>
          <span>출근일수</span>
          <span>지출비용</span>
          <span>단가</span>
          <span>수정</span>
        </div>
        {rows.length === 0 && (
          <div className="row">
            <span className="text-secondary">등록된 인원이 없습니다.</span>
          </div>
        )}
        {rows.map((row) => (
          <div key={row.userId} className="row hr-row">
            <Link to={`/hr/${row.userId}`} className="link-btn">
              {row.name}
            </Link>
            <span>{formatDays(row.days)}</span>
            <span className="mono">{formatWon(row.expenseTotal)}</span>
            <span className="mono">{formatWon(row.rate)}</span>
            <span className="hr-actions">
              <button type="button" className="btn small" onClick={() => handleEditRate(row)}>
                단가수정
              </button>
              <select
                value={row.role}
                disabled={!isDev}
                aria-label={`${row.name} 권한`}
                onChange={(e) => handleChangeRole(row, e.target.value)}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
