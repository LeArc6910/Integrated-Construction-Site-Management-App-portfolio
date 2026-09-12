import { useCallback, useEffect, useState } from 'react'
import { IconCalendarEvent } from '@tabler/icons-react'
import { cancelAttendance, checkIn, fetchMonthAttendance, updateAttendance } from '../../api/attendance'
import { fetchSites } from '../../api/sites'
import { fetchMonthVisits } from '../../api/upcoming'
import CalendarNav from '../../components/CalendarNav'
import Modal from '../../components/Modal'
import { MANAGER_ROLES } from '../../constants/roles'
import { useAuth } from '../../hooks/useAuth'
import { enqueueWrite } from '../../lib/offlineQueue'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const HOURS_OPTIONS = [
  { value: 1, label: '1일' },
  { value: 0.5, label: '0.5일' },
]

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

export default function AttendanceTab() {
  const { user } = useAuth()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [sites, setSites] = useState([])
  const [attendance, setAttendance] = useState({})
  const [selectedDate, setSelectedDate] = useState(null)
  const [editingDate, setEditingDate] = useState(null)
  const [siteId, setSiteId] = useState('')
  const [hours, setHours] = useState(1)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [upcomingByDate, setUpcomingByDate] = useState({})

  const canSeeUpcoming = MANAGER_ROLES.includes(user.role)

  useEffect(() => {
    fetchSites()
      .then((rows) => {
        setSites(rows)
        setSiteId((prev) => prev || rows[0]?.id || '')
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
    setYear(y)
    setMonth(m)
    setSelectedDate(null)
  }

  function handleCellClick(dateStr) {
    if (attendance[dateStr]) {
      const rec = attendance[dateStr]
      if (rec.pending) return // 아직 서버로 전송되지 않은 기록은 동기화 전까지 수정할 수 없다
      setEditingDate(dateStr)
      setSiteId(rec.siteId)
      setHours(rec.hours)
    } else {
      setSelectedDate(dateStr)
    }
  }

  async function handleCheckIn() {
    setError('')
    setNotice('')
    const clientId = crypto.randomUUID()

    if (!navigator.onLine) {
      try {
        await enqueueWrite('attendance', { userId: user.id, date: selectedDate, siteId, hours, clientId })
      } catch (err) {
        setError(err.message)
        return
      }
      const siteName = sites.find((s) => s.id === siteId)?.name ?? ''
      setAttendance((prev) => ({ ...prev, [selectedDate]: { id: clientId, siteId, siteName, hours, pending: true } }))
      setSelectedDate(null)
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      await checkIn({ userId: user.id, date: selectedDate, siteId, hours, clientId })
      setSelectedDate(null)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveEdit() {
    setError('')
    try {
      await updateAttendance({ id: attendance[editingDate].id, siteId, hours })
      setEditingDate(null)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleCancelAttendance() {
    setError('')
    try {
      await cancelAttendance({ id: attendance[editingDate].id })
      setEditingDate(null)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const cells = buildCells(year, month)

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
          const rec = attendance[dateStr]
          const upcomingNames = canSeeUpcoming ? (upcomingByDate[dateStr] ?? []) : []
          const cls = ['cal-cell']
          if (rec) cls.push(rec.hours === 1 ? 'cal-full' : 'cal-half')
          if (selectedDate === dateStr) cls.push('cal-selected')
          if (upcomingNames.length > 0) cls.push('cal-upcoming')

          return (
            <div key={dateStr} className={cls.join(' ')} onClick={() => handleCellClick(dateStr)}>
              {day}
              {upcomingNames.length > 0 && <IconCalendarEvent size={11} className="cal-upcoming-icon" />}
              {rec && (
                <span className="cal-site">
                  {rec.siteName}
                  {rec.pending && <span className="cal-pending"> (대기중)</span>}
                </span>
              )}
              {upcomingNames.map((name, nameIndex) => (
                <span key={`${name}-${nameIndex}`} className="cal-upcoming-site">
                  {name} 방문 예정
                </span>
              ))}
            </div>
          )
        })}
      </div>

      <div className="attendance-controls">
        <span>
          선택된 날짜: <b>{selectedDate ?? '(날짜를 선택하세요)'}</b>
        </span>
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {HOURS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" disabled={!selectedDate || !siteId} onClick={handleCheckIn}>
          출근
        </button>
      </div>

      {editingDate && (
        <Modal title={`${editingDate} 출근 정보 수정`} onClose={() => setEditingDate(null)}>
          <label>현장</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label>근무시간</label>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {HOURS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="modal-actions">
            <button type="button" className="btn danger" onClick={handleCancelAttendance}>
              출근 취소
            </button>
            <button type="button" className="btn primary" onClick={handleSaveEdit}>
              수정
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
