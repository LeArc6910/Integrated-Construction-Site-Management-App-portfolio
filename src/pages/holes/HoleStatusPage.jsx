import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHoleDashboard } from '../../api/holes'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { DOW } from '../../lib/calendar'
import { summarizeWork } from '../../lib/holes'

const ALL_SITES = '전체'

function percent(done, total) {
  if (total === 0) return 0
  return Math.floor((done / total) * 1000) / 10
}

// 'YYYY-MM-DD' → '9/23(화)'
function dayLabel(date) {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`
}

function UnsetNote({ units }) {
  if (!units) return null
  return <span className="badge orange">미설정 {units.toLocaleString()}세대</span>
}

export default function HoleStatusPage() {
  const { year, month, setPeriod } = usePeriod()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [siteFilter, setSiteFilter] = useState(ALL_SITES)
  const [openPerson, setOpenPerson] = useState(null)

  const load = useCallback(() => fetchHoleDashboard({ year, month }), [year, month])

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

  function toggleSite(siteId) {
    setSiteFilter((prev) => (prev === siteId ? ALL_SITES : siteId))
    setOpenPerson(null)
  }

  const sites = data?.sites ?? []
  const totals = sites.reduce(
    (sum, site) => ({
      totalHoles: sum.totalHoles + site.totalHoles,
      doneHoles: sum.doneHoles + site.doneHoles,
      unsetUnits: sum.unsetUnits + site.unsetUnits,
    }),
    { totalHoles: 0, doneHoles: 0, unsetUnits: 0 }
  )

  const people = data ? summarizeWork(data.work, data.names, siteFilter === ALL_SITES ? null : siteFilter) : []
  const monthTotal = people.reduce(
    (sum, person) => ({
      holes: sum.holes + person.holes,
      units: sum.units + person.units,
      unsetUnits: sum.unsetUnits + person.unsetUnits,
    }),
    { holes: 0, units: 0, unsetUnits: 0 }
  )

  return (
    <div>
      <h2 className="page-title">현장 타공 현황</h2>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <p className="text-secondary hole-rule">
        완료 기준: 경량·합지 모두 체크(CRC 현장은 CRC 체크). 석고 시공·미타공은 계산에 넣지 않습니다. 세대 타공 수는
        각 현장 세대표의 <b>타공 설정</b>(타입별 타공 수 + 옵션)으로 계산합니다.
      </p>

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">전체 타공</div>
          <div className="value">{totals.totalHoles.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="label">완료 타공</div>
          <div className="value">{totals.doneHoles.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="label">남은 타공</div>
          <div className="value">{(totals.totalHoles - totals.doneHoles).toLocaleString()}</div>
        </div>
      </div>
      {totals.unsetUnits > 0 && (
        <p className="share-warning hole-unset-warning">
          타입이 없거나 타공 수가 정해지지 않은 세대가 {totals.unsetUnits.toLocaleString()}세대 있습니다. 이 세대들은
          타공 합계에 들어가지 않습니다. 현장 세대표의 &quot;타공 설정&quot;에서 채워주세요.
        </p>
      )}

      <span className="section-label">현장별 (누르면 아래 인원별 실적이 그 현장만 보입니다)</span>
      {data && sites.length === 0 && <p className="text-secondary">세대표가 있는 현장이 없습니다.</p>}
      <div className="site-list-grid">
        {sites.map((site) => {
          const rate = percent(site.doneHoles, site.totalHoles)
          return (
            <div
              key={site.id}
              className={`site-card hole-site-card${siteFilter === site.id ? ' selected' : ''}`}
              onClick={() => toggleSite(site.id)}
            >
              <div className="hole-site-top">
                <Link to={`/sites/${site.id}`} className="site-card-name" onClick={(e) => e.stopPropagation()}>
                  {site.name}
                </Link>
                <UnsetNote units={site.unsetUnits} />
              </div>
              <div className="hole-progress" aria-hidden="true">
                <div className="hole-progress-fill" style={{ width: `${Math.min(100, rate)}%` }} />
              </div>
              <div className="site-card-stats">
                <span>
                  완료 <b className="mono">{site.doneHoles.toLocaleString()}</b> / {site.totalHoles.toLocaleString()} 타공
                </span>
                <span className="mono">{rate}%</span>
                <span>
                  세대 {site.doneUnits.toLocaleString()}/{site.totalUnits.toLocaleString()}
                </span>
              </div>
              {site.sharedWith.length > 0 && (
                <p className="site-card-share">공유 세대표 · {site.sharedWith.join(', ')} 포함</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="page-header-row hole-people-head">
        <span className="section-label">인원별 월간 실적</span>
        <div className="hole-people-filters">
          <CalendarNav year={year} month={month} onChange={({ year: y, month: m }) => setPeriod(y, m)} />
          <select
            value={siteFilter}
            onChange={(e) => {
              setSiteFilter(e.target.value === ALL_SITES ? ALL_SITES : Number(e.target.value))
              setOpenPerson(null)
            }}
            aria-label="현장 선택"
          >
            <option value={ALL_SITES}>현장 {ALL_SITES}</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table">
        <div className="row head hole-person-row">
          <span>이름</span>
          <span>완료 타공</span>
          <span>완료 세대</span>
        </div>
        {data && people.length === 0 && (
          <div className="row">
            <span className="text-secondary">
              {month}월에 완료된 세대가 없습니다.
            </span>
          </div>
        )}
        {people.map((person) => (
          <Fragment key={person.id}>
            <div
              className="row clickable hole-person-row"
              onClick={() => setOpenPerson((prev) => (prev === person.id ? null : person.id))}
            >
              <span>
                {openPerson === person.id ? '▾' : '▸'} {person.name}
              </span>
              <span className="mono">{person.holes.toLocaleString()}</span>
              <span>
                <span className="mono">{person.units.toLocaleString()}</span>{' '}
                <UnsetNote units={person.unsetUnits} />
              </span>
            </div>
            {openPerson === person.id &&
              person.days.map((day) => (
                <div key={day.date} className="row hole-person-row hole-day-row">
                  <span>{dayLabel(day.date)}</span>
                  <span className="mono">{day.holes.toLocaleString()}</span>
                  <span>
                    <span className="mono">{day.units.toLocaleString()}</span> <UnsetNote units={day.unsetUnits} />
                  </span>
                </div>
              ))}
          </Fragment>
        ))}
        {people.length > 0 && (
          <div className="row hole-person-row total-row">
            <span>합계</span>
            <span className="mono">{monthTotal.holes.toLocaleString()}</span>
            <span>
              <span className="mono">{monthTotal.units.toLocaleString()}</span>{' '}
              <UnsetNote units={monthTotal.unsetUnits} />
            </span>
          </div>
        )}
      </div>
      <p className="text-secondary">
        완료 세대는 경량·합지 중 나중에 체크된 날짜와 그 체크를 한 사람으로 셉니다. 체크를 해제하면 실적에서도 빠집니다.
      </p>
    </div>
  )
}
