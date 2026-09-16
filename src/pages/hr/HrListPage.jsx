import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHrList, updateRate, updateRole } from '../../api/hr'
import CalendarNav from '../../components/CalendarNav'
import Modal from '../../components/Modal'
import { ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { formatDays, formatWon } from '../../lib/format'

const ROLE_OPTIONS = [ROLES.MEMBER, ROLES.LEADER, ROLES.DEVELOPER]

export default function HrListPage() {
  const { user } = useAuth()
  const isDev = user.role === ROLES.DEVELOPER
  const { year, month, setPeriod } = usePeriod()
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [editingRate, setEditingRate] = useState(null)
  const [rateForm, setRateForm] = useState({ rate: '', year, month })
  const [savingRate, setSavingRate] = useState(false)

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
    setPeriod(y, m)
  }

  async function reload() {
    try {
      setRows(await load())
    } catch (err) {
      setError(err.message)
    }
  }

  function openEditRate(row) {
    setError('')
    setRateForm({ rate: String(row.rate), year, month })
    setEditingRate(row)
  }

  async function handleSaveRate() {
    const rate = parseInt(rateForm.rate, 10)
    if (Number.isNaN(rate)) return

    setSavingRate(true)
    setError('')
    try {
      await updateRate({ userId: editingRate.userId, rate, year: rateForm.year, month: rateForm.month })
      setEditingRate(null)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingRate(false)
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
          <span>담당현장</span>
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
            <span className={row.sites.length ? 'hr-sites' : 'hr-sites text-secondary'}>
              {row.sites.length ? row.sites.join(', ') : '없음'}
            </span>
            <span className="mono">{formatWon(row.rate)}</span>
            <span className="hr-actions">
              <button type="button" className="btn small" onClick={() => openEditRate(row)}>
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

      {editingRate && (
        <Modal title={`${editingRate.name} 단가 수정`} onClose={() => setEditingRate(null)}>
          <p className="text-secondary">
            선택한 연/월부터 이 단가가 적용됩니다. 과거 달 급여는 그 당시 단가로 그대로 남습니다.
          </p>
          <label>적용 연/월</label>
          <div className="salary-form">
            <input
              type="number"
              value={rateForm.year}
              onChange={(e) => setRateForm({ ...rateForm, year: Number(e.target.value) })}
              aria-label="적용 연도"
            />
            <input
              type="number"
              min="1"
              max="12"
              value={rateForm.month}
              onChange={(e) => setRateForm({ ...rateForm, month: Number(e.target.value) })}
              aria-label="적용 월"
            />
          </div>
          <label>단가</label>
          <input
            type="number"
            value={rateForm.rate}
            onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
            aria-label="단가"
          />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setEditingRate(null)}>
              취소
            </button>
            <button type="button" className="btn primary" disabled={savingRate} onClick={handleSaveRate}>
              저장
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
