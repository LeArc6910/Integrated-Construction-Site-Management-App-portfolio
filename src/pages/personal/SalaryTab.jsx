import { useCallback, useEffect, useState } from 'react'
import { IconPaperclip } from '@tabler/icons-react'
import { getReceiptUrl } from '../../api/expense'
import { fetchSalaryTotalsForUser } from '../../api/salaryTax'
import { fetchSites } from '../../api/sites'
import CalendarNav from '../../components/CalendarNav'
import GrossNote from '../../components/GrossNote'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { formatDays, formatWon } from '../../lib/format'
import SalaryEntryModal from './SalaryEntryModal'

export default function SalaryTab() {
  const { user } = useAuth()
  const { year, month, setPeriod } = usePeriod()
  const [entries, setEntries] = useState([])
  const [sites, setSites] = useState([])
  const [modalMode, setModalMode] = useState(null) // null | 'add' | 수정 중인 항목
  const [error, setError] = useState('')

  // 현장관리 목록의 현장(진행중·완료 모두). 삭제(보관)된 현장은 고를 수 없다.
  useEffect(() => {
    fetchSites()
      .then(setSites)
      .catch((err) => setError(err.message))
  }, [])

  // 제외 전 금액까지 같이 계산해서 받아온다(입력 건마다 그 현장 출근일수로 세율이 정해진다)
  const loadMonth = useCallback(
    () =>
      fetchSalaryTotalsForUser({ userId: user.id, year, month }).then((totals) =>
        totals.entries.map((entry) => ({ ...entry, year, month }))
      ),
    [user.id, year, month]
  )

  useEffect(() => {
    let ignore = false
    loadMonth()
      .then((rows) => !ignore && setEntries(rows))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadMonth])

  async function reload() {
    try {
      setEntries(await loadMonth())
    } catch (err) {
      setError(err.message)
    }
  }

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  function openAdd() {
    setError('')
    setModalMode('add')
  }

  function openEdit(entry) {
    setError('')
    setModalMode(entry)
  }

  async function handleViewReceipt(path) {
    try {
      window.open(await getReceiptUrl(path), '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    }
  }

  // 다른 달로 입력했으면 그 달 화면으로 옮겨가서 방금 넣은 내역이 바로 보이게 한다
  async function handleSaved(saved) {
    setModalMode(null)
    if (saved.year !== year || saved.month !== month) setPeriod(saved.year, saved.month)
    else await reload()
  }

  const total = entries.reduce((sum, entry) => sum + entry.amount, 0)
  const grossTotal = entries.reduce((sum, entry) => sum + entry.gross, 0)

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && !modalMode && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">
            {year}년 {month}월 일한 급여 합계
          </div>
          <div className="value">{formatWon(total)}</div>
          <GrossNote gross={grossTotal} />
        </div>
        <div className="metric-card">
          <div className="label">입력 건수</div>
          <div className="value">{entries.length}건</div>
        </div>
      </div>
      <p className="text-secondary salary-period-note">
        일한 달 기준입니다. 이 합계가 인건비·대시보드의 <b>실급여</b>로 쓰입니다.
      </p>

      <div className="table">
        <div className="row head salary-entry-row">
          <span>현장</span>
          <span>수령 급여</span>
          <span>증빙</span>
        </div>
        {entries.length === 0 && (
          <div className="row">
            <span className="text-secondary">해당 월 입력한 급여가 없습니다.</span>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="row clickable salary-entry-row" onClick={() => openEdit(entry)}>
            <span>
              {entry.siteName ?? '현장 미지정(이전 입력)'}
              <div className="gross-note">
                {formatDays(entry.days)} · {entry.percent}% 제외
              </div>
            </span>
            <span className="mono">
              {formatWon(entry.amount)}
              <GrossNote gross={entry.gross} />
            </span>
            <span>
              {entry.receiptPath ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewReceipt(entry.receiptPath)
                  }}
                >
                  <IconPaperclip size={14} stroke={1.75} /> 보기
                </button>
              ) : (
                '-'
              )}
            </span>
          </div>
        ))}
      </div>

      <button type="button" className="btn primary" onClick={openAdd}>
        급여 추가
      </button>

      {modalMode && (
        <SalaryEntryModal
          userId={user.id}
          sites={sites}
          entry={modalMode === 'add' ? null : modalMode}
          initial={{ year, month, siteId: sites[0]?.id ?? '' }}
          onClose={() => setModalMode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
