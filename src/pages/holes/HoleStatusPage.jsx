import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchHoleDashboard,
  fetchHoleTotals,
  fetchTeamHolePrices,
  resetSiteHolePrices,
  saveHolePrices,
  saveTeamHolePrices,
} from '../../api/holes'
import CalendarNav from '../../components/CalendarNav'
import Modal from '../../components/Modal'
import { usePeriod } from '../../hooks/usePeriod'
import { DOW } from '../../lib/calendar'
import { formatWon } from '../../lib/format'
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

const PRICE_FIELDS = [
  { key: 'base', label: '기본' },
  { key: 'wallpad', label: '월패드' },
  { key: 'panel', label: '분전·통신함' },
  { key: 'crc', label: 'CRC' },
]

// 카드에 보여줄 단가: CRC 현장은 CRC 단가 하나로 계산하므로 그것만, 그 외는 CRC를 뺀 세 가지
function cardPriceFields(crc) {
  return crc ? PRICE_FIELDS.filter(({ key }) => key === 'crc') : PRICE_FIELDS.filter(({ key }) => key !== 'crc')
}

// 타공 단가 수정 창. 현장 하나(site)나 팀 전체 타공 단가(site 없음)를 고친다. 결제 > 현장의 계약 금액 자동 계산에 쓰인다.
// teamPrices: 팀 전체 타공 단가(현장 단가를 따로 정하지 않은 현장이 따르는 값)
// onSubmit({ prices, applyToAllSites }), onReset: 현장 단가를 지우고 전체 단가를 따르게 한다(현장 단가가 있을 때만)
function HolePriceModal({ site = null, prices, teamPrices, ownSiteCount = 0, saving, error, onClose, onSubmit, onReset }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(PRICE_FIELDS.map(({ key }) => [key, String(prices[key] ?? teamPrices[key])]))
  )
  const [applyToAllSites, setApplyToAllSites] = useState(false)
  const [localError, setLocalError] = useState('')
  const isTeam = !site

  function handleSubmit() {
    if (PRICE_FIELDS.some(({ key }) => form[key] === '')) {
      setLocalError('단가를 모두 입력하세요.')
      return
    }
    onSubmit({
      prices: Object.fromEntries(PRICE_FIELDS.map(({ key }) => [key, parseInt(form[key], 10)])),
      applyToAllSites,
    })
  }

  let scopeNote = '현장별 타공 단가를 따로 정하지 않은 현장은 모두 이 단가를 씁니다.'
  if (!isTeam) {
    scopeNote = site.ownPrice
      ? '이 현장은 현장 타공 단가를 따로 쓰고 있습니다.'
      : '이 현장은 지금 전체 타공 단가를 따르고 있습니다. 저장하면 이 현장만 따로 정한 단가를 씁니다.'
  }

  return (
    <Modal title={isTeam ? '전체 타공 단가' : `타공 단가 · ${site.name}`} onClose={onClose}>
      <p className="text-secondary line-edit-hint">
        계약 금액 = 전체 타공 × 기본 단가 + 월패드 수 × (월패드 − 기본) + 분전·통신함 수 × (분전·통신함 − 기본). 월패드·분전
        수는 세대표의 타공 설정에서 타입별로 정합니다. 현장 이름에 CRC가 들어간 현장은 전체 타공 × CRC 단가로 계산합니다.
      </p>
      <p className="text-secondary line-edit-hint">{scopeNote}</p>
      {PRICE_FIELDS.map(({ key, label }) => (
        <div key={key}>
          <label>
            {label} 단가 (원{isTeam ? '' : `, 전체 단가 ${teamPrices[key].toLocaleString()}`})
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value.replace(/[^0-9]/g, '') })}
          />
        </div>
      ))}
      {isTeam && ownSiteCount > 0 && (
        <label className="checkbox-line">
          <input type="checkbox" checked={applyToAllSites} onChange={(e) => setApplyToAllSites(e.target.checked)} />
          현장별로 따로 정한 단가({ownSiteCount}곳)도 모두 이 단가로 바꾸기
        </label>
      )}
      {(localError || error) && (
        <p className="auth-message error" role="alert">
          {localError || error}
        </p>
      )}
      <div className="modal-actions">
        {!isTeam && site.ownPrice && (
          <button type="button" className="btn" disabled={saving} onClick={onReset}>
            전체 단가로 되돌리기
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={handleSubmit}>
          저장
        </button>
      </div>
    </Modal>
  )
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
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [totals, setTotalsByOwner] = useState({})
  const [teamPrices, setTeamPrices] = useState(null)
  const [priceSite, setPriceSite] = useState(null) // null | 'team' | 현장
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceError, setPriceError] = useState('')

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

  // 현장별 단가와 자동 계약 금액(달과 무관)
  useEffect(() => {
    let ignore = false
    Promise.all([fetchHoleTotals(), fetchTeamHolePrices()])
      .then(([result, team]) => {
        if (ignore) return
        setTotalsByOwner(result)
        setTeamPrices(team)
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [])

  // 단가를 바꾸면 계약 계산 값이 달라지므로 다시 받아온다
  async function savePrices(action) {
    setPriceSaving(true)
    setPriceError('')
    try {
      await action()
      const [result, team] = await Promise.all([fetchHoleTotals(), fetchTeamHolePrices()])
      setTotalsByOwner(result)
      setTeamPrices(team)
      setPriceSite(null)
    } catch (err) {
      setPriceError(err.message)
    } finally {
      setPriceSaving(false)
    }
  }

  function handleSavePrices({ prices, applyToAllSites }) {
    return savePrices(() =>
      priceSite === 'team'
        ? saveTeamHolePrices({ prices, applyToAllSites })
        : saveHolePrices({ siteId: priceSite.id, prices })
    )
  }

  function handleResetPrices() {
    return savePrices(() => resetSiteHolePrices({ siteId: priceSite.id }))
  }

  const ownSiteCount = Object.values(totals).filter((total) => total.ownPrice).length

  function toggleSite(siteId) {
    setSiteFilter((prev) => (prev === siteId ? ALL_SITES : siteId))
    setOpenPerson(null)
  }

  // 검색은 현장 카드와 위 합계에만 건다(공유받는 현장 이름으로도 찾는다). 인원별 실적은 아래 현장 선택으로 고른다.
  const sites = (data?.sites ?? []).filter(
    (site) => !query || site.name.includes(query) || site.sharedWith.some((name) => name.includes(query))
  )
  const siteSum = sites.reduce(
    (acc, site) => ({
      totalHoles: acc.totalHoles + site.totalHoles,
      doneHoles: acc.doneHoles + site.doneHoles,
      unsetUnits: acc.unsetUnits + site.unsetUnits,
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
      <div className="page-header-row">
        <h2 className="page-title">현장 타공 현황</h2>
        <div className="site-search">
          <button
            type="button"
            className="btn small"
            disabled={!teamPrices}
            onClick={() => {
              setPriceError('')
              setPriceSite('team')
            }}
          >
            전체 단가 수정
          </button>
          <input
            type="text"
            placeholder="현장명 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setQuery(searchInput.trim())}
          />
          <button type="button" className="btn small" onClick={() => setQuery(searchInput.trim())}>
            검색
          </button>
        </div>
      </div>

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
          <div className="value">{siteSum.totalHoles.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="label">완료 타공</div>
          <div className="value">{siteSum.doneHoles.toLocaleString()}</div>
        </div>
        <div className="metric-card">
          <div className="label">남은 타공</div>
          <div className="value">{(siteSum.totalHoles - siteSum.doneHoles).toLocaleString()}</div>
        </div>
      </div>
      {siteSum.unsetUnits > 0 && (
        <p className="share-warning hole-unset-warning">
          타입이 없거나 타공 수가 정해지지 않은 세대가 {siteSum.unsetUnits.toLocaleString()}세대 있습니다. 이 세대들은
          타공 합계에 들어가지 않습니다. 현장 세대표의 &quot;타공 설정&quot;에서 채워주세요.
        </p>
      )}

      <span className="section-label">현장별 (누르면 아래 인원별 실적이 그 현장만 보입니다)</span>
      {data && sites.length === 0 && (
        <p className="text-secondary">{query ? '검색 결과가 없습니다.' : '세대표가 있는 현장이 없습니다.'}</p>
      )}
      <div className="site-list-grid">
        {sites.map((site) => {
          const rate = percent(site.doneHoles, site.totalHoles)
          const total = totals[site.id]
          const prices = total?.prices ?? teamPrices ?? {}
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
              <div className="hole-price-row">
                <span className="text-secondary">
                  단가{' '}
                  {cardPriceFields(total?.crc)
                    .map(({ key, label }) => `${label} ${(prices[key] ?? 0).toLocaleString()}`)
                    .join(' · ')}
                  {total && (total.ownPrice ? ' (현장 단가)' : ' (전체 단가)')}
                  {total && <> · 계약 계산 {formatWon(total.autoContract)}</>}
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={!teamPrices}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPriceError('')
                    setPriceSite({ ...site, ownPrice: Boolean(total?.ownPrice) })
                  }}
                >
                  단가 수정
                </button>
              </div>
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
            {(data?.sites ?? []).map((site) => (
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

      {priceSite && teamPrices && (
        <HolePriceModal
          site={priceSite === 'team' ? null : priceSite}
          prices={priceSite === 'team' ? teamPrices : (totals[priceSite.id]?.prices ?? teamPrices)}
          teamPrices={teamPrices}
          ownSiteCount={ownSiteCount}
          saving={priceSaving}
          error={priceError}
          onClose={() => setPriceSite(null)}
          onSubmit={handleSavePrices}
          onReset={handleResetPrices}
        />
      )}
    </div>
  )
}
