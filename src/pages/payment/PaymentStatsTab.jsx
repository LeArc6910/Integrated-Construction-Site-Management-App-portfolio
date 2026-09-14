import { useCallback, useEffect, useState } from 'react'
import { fetchPaymentStats } from '../../api/paymentStats'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { formatWon } from '../../lib/format'

const METRIC_LABELS = {
  contract: '계약금액',
  received: '수령금액',
  salary: '급여',
  expense: '지출',
  purchase: '매입 합계',
  profit: '단기 순이익',
}

const METRIC_FIELDS = {
  contract: 'contractTotal',
  received: 'receivedTotal',
  salary: 'salaryTotal',
  expense: 'expenseTotal',
  purchase: 'purchaseTotal',
  profit: 'netProfit',
}

export default function PaymentStatsTab() {
  const { year, month, setPeriod } = usePeriod()
  const [mode, setMode] = useState('month') // 'month' | 'year'
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => fetchPaymentStats({ mode, year, month }), [mode, year, month])

  useEffect(() => {
    let ignore = false
    load()
      .then((data) => !ignore && setStats(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  function toggleSelected(key) {
    setSelected((prev) => (prev === key ? null : key))
  }

  const years = [year - 1, year, year + 1]

  function renderBreakdown() {
    if (!stats) return null

    if (selected === 'contract' || selected === 'received') {
      const field = selected === 'contract' ? 'contractAmount' : 'received'
      const total = selected === 'contract' ? stats.summary.contractTotal : stats.summary.receivedTotal
      const rows = stats.bySite.filter((site) => site[field] > 0)
      return (
        <div className="table">
          <div className="row head pay-breakdown-row-2">
            <span>현장이름</span>
            <span>{METRIC_LABELS[selected]}</span>
          </div>
          {rows.length === 0 && (
            <div className="row">
              <span className="text-secondary">해당 기간에 내역이 없습니다.</span>
            </div>
          )}
          {rows.map((site) => (
            <div key={site.id} className="row pay-breakdown-row-2">
              <span>{site.name}</span>
              <span className="mono">{formatWon(site[field])}</span>
            </div>
          ))}
          <div className="row pay-breakdown-row-2 total-row">
            <span>합계</span>
            <span className="mono">{formatWon(total)}</span>
          </div>
        </div>
      )
    }

    if (selected === 'salary' || selected === 'expense') {
      const field = selected
      const total = selected === 'salary' ? stats.summary.salaryTotal : stats.summary.expenseTotal
      const rows = stats.byPerson.filter((p) => p[field] > 0)
      return (
        <div className="table">
          <div className="row head pay-breakdown-row-2">
            <span>이름</span>
            <span>{METRIC_LABELS[selected]}</span>
          </div>
          {rows.length === 0 && (
            <div className="row">
              <span className="text-secondary">해당 기간에 내역이 없습니다.</span>
            </div>
          )}
          {rows.map((p) => (
            <div key={p.userId} className="row pay-breakdown-row-2">
              <span>{p.name}</span>
              <span className="mono">{formatWon(p[field])}</span>
            </div>
          ))}
          <div className="row pay-breakdown-row-2 total-row">
            <span>합계</span>
            <span className="mono">{formatWon(total)}</span>
          </div>
        </div>
      )
    }

    if (selected === 'purchase') {
      return (
        <div className="table">
          <div className="row head pay-breakdown-row-4">
            <span>이름</span>
            <span>급여</span>
            <span>지출</span>
            <span>합계</span>
          </div>
          {stats.byPerson.length === 0 && (
            <div className="row">
              <span className="text-secondary">해당 기간에 내역이 없습니다.</span>
            </div>
          )}
          {stats.byPerson.map((p) => (
            <div key={p.userId} className="row pay-breakdown-row-4">
              <span>{p.name}</span>
              <span className="mono">{formatWon(p.salary)}</span>
              <span className="mono">{formatWon(p.expense)}</span>
              <span className="mono">{formatWon(p.salary + p.expense)}</span>
            </div>
          ))}
          <div className="row pay-breakdown-row-4 total-row">
            <span>합계</span>
            <span className="mono">{formatWon(stats.summary.salaryTotal)}</span>
            <span className="mono">{formatWon(stats.summary.expenseTotal)}</span>
            <span className="mono">{formatWon(stats.summary.purchaseTotal)}</span>
          </div>
        </div>
      )
    }

    if (selected === 'profit') {
      return (
        <div className="table">
          <div className="row head pay-breakdown-row-2">
            <span>항목</span>
            <span>금액</span>
          </div>
          <div className="row pay-breakdown-row-2">
            <span>수령금액</span>
            <span className="mono">{formatWon(stats.summary.receivedTotal)}</span>
          </div>
          <div className="row pay-breakdown-row-2">
            <span>매입 합계</span>
            <span className="mono">- {formatWon(stats.summary.purchaseTotal)}</span>
          </div>
          <div className="row pay-breakdown-row-2 total-row">
            <span>단기 순이익</span>
            <span className="mono">{formatWon(stats.summary.netProfit)}</span>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div>
      <div className="stats-mode-toggle">
        <button
          type="button"
          className={`btn small${mode === 'month' ? ' primary' : ''}`}
          onClick={() => setMode('month')}
        >
          월 단위
        </button>
        <button
          type="button"
          className={`btn small${mode === 'year' ? ' primary' : ''}`}
          onClick={() => setMode('year')}
        >
          연 단위
        </button>
      </div>

      {mode === 'month' ? (
        <CalendarNav year={year} month={month} onChange={handleCalChange} />
      ) : (
        <select value={year} onChange={(e) => setPeriod(Number(e.target.value), month)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
      )}

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      {stats && (
        <>
          <div className="card-grid">
            {Object.entries(METRIC_LABELS).map(([key, label]) => (
              <div
                key={key}
                className={`metric-card clickable${selected === key ? ' selected' : ''}`}
                onClick={() => toggleSelected(key)}
              >
                <div className="label">{label}</div>
                <div className="value">{formatWon(stats.summary[METRIC_FIELDS[key]])}</div>
              </div>
            ))}
          </div>

          {selected && (
            <>
              <span className="section-label">{METRIC_LABELS[selected]} 내역</span>
              {renderBreakdown()}
            </>
          )}

          <span className="section-label">현장별 매출</span>
          <div className="table">
            <div className="row head pay-stats-site-row">
              <span>현장이름</span>
              <span>계약금액</span>
              <span>수령금액</span>
            </div>
            {stats.bySite.length === 0 && (
              <div className="row">
                <span className="text-secondary">등록된 현장이 없습니다.</span>
              </div>
            )}
            {stats.bySite.map((site) => (
              <div key={site.id} className="row pay-stats-site-row">
                <span>{site.name}</span>
                <span className="mono">{formatWon(site.contractAmount)}</span>
                <span className="mono">{formatWon(site.received)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
