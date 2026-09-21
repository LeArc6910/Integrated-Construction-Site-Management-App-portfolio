import { Fragment, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchLaborList } from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import GrossNote from '../../components/GrossNote'
import { usePeriod } from '../../hooks/usePeriod'
import { formatDays, formatWon } from '../../lib/format'
import SalaryTaxModal from './SalaryTaxModal'

export default function PaymentLaborTab() {
  const navigate = useNavigate()
  const { year, month, setPeriod } = usePeriod()
  const [rows, setRows] = useState([])
  const [openUserId, setOpenUserId] = useState(null)
  const [taxModal, setTaxModal] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => fetchLaborList({ year, month }), [year, month])

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

  // 세율을 바꾸면 제외 전 금액과 차액이 달라지므로 목록을 다시 받아온다
  async function handleTaxSaved() {
    setTaxModal(false)
    try {
      setRows(await load())
    } catch (err) {
      setError(err.message)
    }
  }

  // 차액 합계는 표에 보이는 사람별 차액(각각 3.3% 공제 후 원 단위 절사)을 그대로 더해 표와 맞춘다
  const totals = rows.reduce(
    (sum, row) => ({
      salary: sum.salary + row.salary,
      actual: sum.actual + row.actual,
      gross: sum.gross + row.gross,
      gap: sum.gap + row.gap,
    }),
    { salary: 0, actual: 0, gross: 0, gap: 0 }
  )

  return (
    <div>
      <div className="section-header">
        <CalendarNav year={year} month={month} onChange={handleCalChange} />
        <button type="button" className="btn small" onClick={() => setTaxModal(true)}>
          급여 세금 설정
        </button>
      </div>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">급여 합계</div>
          <div className="value">{formatWon(totals.salary)}</div>
        </div>
        <div className="metric-card">
          <div className="label">실급여 합계</div>
          <div className="value">{formatWon(totals.actual)}</div>
          <GrossNote gross={totals.gross} />
        </div>
        <div className="metric-card">
          <div className="label">차액 합계</div>
          <div className="value">{formatWon(totals.gap)}</div>
        </div>
      </div>

      <p className="text-secondary report-hint">
        이름을 누르면 상세로 이동하고, 급여·실급여·차액을 누르면 그 달 실급여 입력 내역이 펼쳐집니다.
      </p>

      <div className="table">
        <div className="row head pay-person-row">
          <span>이름</span>
          <span>급여</span>
          <span>실급여</span>
          <span>차액</span>
        </div>
        {rows.length === 0 && (
          <div className="row">
            <span className="text-secondary">등록된 인원이 없습니다.</span>
          </div>
        )}
        {rows.map((row) => (
          <Fragment key={row.userId}>
            <div
              className="row clickable pay-person-row"
              onClick={() => setOpenUserId((prev) => (prev === row.userId ? null : row.userId))}
            >
              {/* 이름만 상세로 이동하고, 나머지 칸은 펼치기 */}
              <button
                type="button"
                className="link-btn row-name"
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(`/payment/labor/${row.userId}`)
                }}
              >
                {row.name}
              </button>
              <span className="mono">{formatWon(row.salary)}</span>
              <span className="mono">
                {formatWon(row.actual)}
                <GrossNote gross={row.gross} />
              </span>
              <span className="mono">{formatWon(row.gap)}</span>
            </div>
            {openUserId === row.userId && (
              <div className="expand-list">
                {row.entries.length === 0 && <div className="text-secondary expand-empty">입력된 실급여가 없습니다.</div>}
                {row.entries.map((entry) => (
                  <div key={entry.id} className="expand-item labor-entry-row">
                    <span>{entry.siteName ?? '현장 미지정(이전 입력)'}</span>
                    <span className="text-secondary">
                      {formatDays(entry.days)} · {entry.percent}% 제외
                    </span>
                    <span className="mono">{formatWon(entry.amount)}</span>
                    <span className="mono text-secondary">제외 전 {formatWon(entry.gross)}</span>
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {taxModal && <SalaryTaxModal onClose={() => setTaxModal(false)} onSaved={handleTaxSaved} />}
    </div>
  )
}
