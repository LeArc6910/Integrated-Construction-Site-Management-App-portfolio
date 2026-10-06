import { Fragment, useCallback, useEffect, useState } from 'react'
import { fetchMyHoleWork } from '../../api/holes'
import CalendarNav from '../../components/CalendarNav'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { DOW } from '../../lib/calendar'

// 'YYYY-MM-DD' → '9/23(화)'
function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`
}

function UnsetNote({ units }) {
  if (!units) return null
  return <span className="badge orange">미설정 {units.toLocaleString()}세대</span>
}

// 개인 > 타공 내역: 로그인한 사람이 완료한 세대의 타공 수만 보여준다. 다른 사람을 고르는 기능은 없다.
export default function HoleWorkTab() {
  const { user } = useAuth()
  const { year, month, setPeriod } = usePeriod()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [openDate, setOpenDate] = useState(null)

  const load = useCallback(() => fetchMyHoleWork({ userId: user.id, year, month }), [user.id, year, month])

  useEffect(() => {
    let ignore = false
    load()
      .then((result) => {
        if (ignore) return
        setData(result)
        setError('')
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  function changePeriod({ year: y, month: m }) {
    setData(null)
    setOpenDate(null)
    setPeriod(y, m)
  }

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={changePeriod} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">{month}월 완료 타공</div>
          <div className="value">{data ? data.holes.toLocaleString() : '–'}</div>
        </div>
        <div className="metric-card">
          <div className="label">{month}월 완료 세대</div>
          <div className="value">{data ? data.units.toLocaleString() : '–'}</div>
        </div>
        <div className="metric-card">
          <div className="label">작업한 날</div>
          <div className="value">{data ? `${data.days.length}일` : '–'}</div>
        </div>
      </div>
      {data?.unsetUnits > 0 && (
        <p className="share-warning hole-unset-warning">
          타공 수가 정해지지 않은 세대 {data.unsetUnits.toLocaleString()}곳은 타공 합계에 들어가지 않았습니다. 현장의
          타공 설정이 채워지면 자동으로 반영됩니다.
        </p>
      )}

      <div className="table">
        <div className="row head hole-person-row">
          <span>날짜</span>
          <span>완료 타공</span>
          <span>완료 세대</span>
        </div>
        {!data && !error && (
          <div className="row">
            <span className="text-secondary">불러오는 중…</span>
          </div>
        )}
        {data?.days.length === 0 && (
          <div className="row">
            <span className="text-secondary">{month}월에 완료한 세대가 없습니다.</span>
          </div>
        )}
        {data?.days.map((day) => (
          <Fragment key={day.date}>
            <div
              className="row clickable hole-person-row"
              onClick={() => setOpenDate((prev) => (prev === day.date ? null : day.date))}
            >
              <span>
                {openDate === day.date ? '▾' : '▸'} {dayLabel(day.date)}
              </span>
              <span className="mono">{day.holes.toLocaleString()}</span>
              <span>
                <span className="mono">{day.units.toLocaleString()}</span> <UnsetNote units={day.unsetUnits} />
              </span>
            </div>
            {openDate === day.date &&
              day.sites.map((site) => (
                <div key={site.id} className="row hole-person-row hole-day-row">
                  <span>{site.name}</span>
                  <span className="mono">{site.holes.toLocaleString()}</span>
                  <span>
                    <span className="mono">{site.units.toLocaleString()}</span> <UnsetNote units={site.unsetUnits} />
                  </span>
                </div>
              ))}
          </Fragment>
        ))}
        {data?.days.length > 0 && (
          <div className="row hole-person-row total-row">
            <span>합계</span>
            <span className="mono">{data.holes.toLocaleString()}</span>
            <span>
              <span className="mono">{data.units.toLocaleString()}</span> <UnsetNote units={data.unsetUnits} />
            </span>
          </div>
        )}
      </div>
      <p className="text-secondary">
        경량·합지를 모두 체크한 세대(CRC 현장은 CRC 체크)를 나중에 체크한 날짜로 셉니다. 날짜를 누르면 현장별 내역이
        보입니다. 타공 수는 현장의 타공 설정으로 계산하므로, 설정이 바뀌면 지난 달 수치도 같이 바뀝니다.
      </p>
    </div>
  )
}
