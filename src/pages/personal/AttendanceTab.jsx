import { useCallback, useEffect, useState } from 'react'
import { IconCalendarEvent } from '@tabler/icons-react'
import { cancelAttendance, checkIn, fetchMonthAttendance, updateAttendance } from '../../api/attendance'
import { fetchSites } from '../../api/sites'
import { fetchMonthVisits } from '../../api/upcoming'
import CalendarNav from '../../components/CalendarNav'
import Modal from '../../components/Modal'
import { MANAGER_ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { enqueueWrite } from '../../lib/offlineQueue'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const HALF_LABELS = { FULL: '하루 종일', AM: '오전', PM: '오후' }
const ALL_HALVES = ['FULL', 'AM', 'PM']

function pad2(n) {
  return String(n).padStart(2, '0')
}

function ymd(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function buildCells(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = Array.from({ length: firstDow }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  return cells
}

// 하루 종일 하나만 있거나, 오전/오후가 각각 최대 하나씩 있을 수 있다. 이미 하루 종일이
// 있으면 더 추가할 수 없고, 오전/오후 중 하나가 있으면 남은 반쪽만 추가할 수 있다.
function availableHalves(records) {
  const used = records.map((r) => r.half)
  if (used.includes('FULL')) return []
  return ALL_HALVES.filter((h) => h !== 'FULL' ? !used.includes(h) : records.length === 0)
}

export default function AttendanceTab() {
  const { user } = useAuth()
  const { year, month, setPeriod } = usePeriod()
  const [sites, setSites] = useState([])
  const [attendance, setAttendance] = useState({})
  const [activeDate, setActiveDate] = useState(null)
  const [newHalf, setNewHalf] = useState('FULL')
  const [newSiteId, setNewSiteId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [upcomingByDate, setUpcomingByDate] = useState({})

  const canSeeUpcoming = MANAGER_ROLES.includes(user.role)

  useEffect(() => {
    fetchSites()
      .then((rows) => {
        setSites(rows)
        setNewSiteId((prev) => prev || rows[0]?.id || '')
      })
      .catch((err) => setError(err.message))
  }, [])

  const loadMonth = useCallback(
    () => fetchMonthAttendance({ userId: user.id, year, month }),
    [user.id, year, month]
  )

  useEffect(() => {
    let ignore = false
    loadMonth()
      .then((map) => !ignore && setAttendance(map))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadMonth])

  const reload = useCallback(async () => {
    try {
      setAttendance(await loadMonth())
    } catch (err) {
      setError(err.message)
    }
  }, [loadMonth])

  // 오프라인 큐에 쌓아둔 출근 기록이 서버로 전송되면 달력을 최신 상태로 다시 받아온다
  useEffect(() => {
    function handleFlushed() {
      reload()
    }
    window.addEventListener('offline-queue-flushed', handleFlushed)
    return () => window.removeEventListener('offline-queue-flushed', handleFlushed)
  }, [reload])

  useEffect(() => {
    if (!canSeeUpcoming) return
    let ignore = false
    fetchMonthVisits({ year, month })
      .then((byDate) => !ignore && setUpcomingByDate(byDate))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [canSeeUpcoming, year, month])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
    setActiveDate(null)
  }

  function handleCellClick(dateStr) {
    const options = availableHalves(attendance[dateStr] ?? [])
    setNewHalf(options[0] ?? 'FULL')
    setActiveDate(dateStr)
  }

  async function handleAddRecord() {
    setError('')
    setNotice('')
    const clientId = crypto.randomUUID()

    if (!navigator.onLine) {
      try {
        await enqueueWrite('attendance', { userId: user.id, date: activeDate, siteId: newSiteId, half: newHalf, clientId })
      } catch (err) {
        setError(err.message)
        return
      }
      const siteName = sites.find((s) => s.id === newSiteId)?.name ?? ''
      const hours = newHalf === 'FULL' ? 1 : 0.5
      setAttendance((prev) => ({
        ...prev,
        [activeDate]: [
          ...(prev[activeDate] ?? []),
          { id: clientId, siteId: newSiteId, siteName, hours, half: newHalf, pending: true },
        ],
      }))
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      const remaining = availableHalves([...(attendance[activeDate] ?? []), { half: newHalf }])
      if (remaining.length === 0) setActiveDate(null)
      else setNewHalf(remaining[0])
      return
    }

    try {
      await checkIn({ userId: user.id, date: activeDate, siteId: newSiteId, half: newHalf, clientId })
      await reload()
      const remaining = availableHalves([...(attendance[activeDate] ?? []), { half: newHalf }])
      if (remaining.length === 0) setActiveDate(null)
      else setNewHalf(remaining[0])
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleChangeSite(record, siteId) {
    setError('')
    try {
      await updateAttendance({ id: record.id, siteId })
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(record) {
    setError('')
    try {
      await cancelAttendance({ id: record.id })
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const cells = buildCells(year, month)
  const activeRecords = activeDate ? attendance[activeDate] ?? [] : []
  const addableHalves = availableHalves(activeRecords)

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="auth-message notice">{notice}</p>}

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
          const upcomingNames = canSeeUpcoming ? (upcomingByDate[dateStr] ?? []) : []
          const cls = ['cal-cell']
          if (totalHours >= 1) cls.push('cal-full')
          else if (totalHours > 0) cls.push('cal-half')
          if (activeDate === dateStr) cls.push('cal-selected')
          if (upcomingNames.length > 0) cls.push('cal-upcoming')

          return (
            <div key={dateStr} className={cls.join(' ')} onClick={() => handleCellClick(dateStr)}>
              {day}
              {upcomingNames.length > 0 && <IconCalendarEvent size={11} className="cal-upcoming-icon" />}
              {records.map((rec) => (
                <span key={rec.id} className="cal-site">
                  {rec.half !== 'FULL' && `${HALF_LABELS[rec.half]} · `}
                  {rec.siteName}
                  {rec.pending && <span className="cal-pending"> (대기중)</span>}
                </span>
              ))}
              {upcomingNames.map((name, nameIndex) => (
                <span key={`${name}-${nameIndex}`} className="cal-upcoming-site">
                  {name} 방문 예정
                </span>
              ))}
            </div>
          )
        })}
      </div>

      {activeDate && (
        <Modal title={`${activeDate} 출근 정보`} onClose={() => setActiveDate(null)}>
          {activeRecords.map((rec) => (
            <div key={rec.id} className="attendance-record-row">
              <span className="attendance-record-half">{HALF_LABELS[rec.half]}</span>
              <select
                value={rec.siteId}
                disabled={rec.pending}
                onChange={(e) => handleChangeSite(rec, e.target.value)}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn small danger" disabled={rec.pending} onClick={() => handleDelete(rec)}>
                삭제
              </button>
            </div>
          ))}

          {addableHalves.length > 0 ? (
            <>
              <label>추가</label>
              <div className="attendance-record-row">
                <select value={newHalf} onChange={(e) => setNewHalf(e.target.value)}>
                  {addableHalves.map((h) => (
                    <option key={h} value={h}>
                      {HALF_LABELS[h]}
                    </option>
                  ))}
                </select>
                <select value={newSiteId} onChange={(e) => setNewSiteId(e.target.value)}>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn primary small" disabled={!newSiteId} onClick={handleAddRecord}>
                  추가
                </button>
              </div>
            </>
          ) : (
            <p className="text-secondary">더 추가할 수 없습니다.</p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setActiveDate(null)}>
              닫기
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
