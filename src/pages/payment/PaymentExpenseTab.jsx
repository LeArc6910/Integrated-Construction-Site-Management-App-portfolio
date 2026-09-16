import { Fragment, useCallback, useEffect, useState } from 'react'
import { IconPaperclip } from '@tabler/icons-react'
import { fetchExpenseOverview, getReceiptUrl } from '../../api/expense'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { formatWon } from '../../lib/format'

// 인원별 지출비용. 지출비용 금액을 누르면 그 사람의 그 달 지출 내역이 아래로 펼쳐진다.
export default function PaymentExpenseTab() {
  const { year, month, setPeriod } = usePeriod()
  const [rows, setRows] = useState([])
  const [openUserId, setOpenUserId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => fetchExpenseOverview({ year, month }), [year, month])

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
    setOpenUserId(null)
  }

  function toggle(userId) {
    setOpenUserId((prev) => (prev === userId ? null : userId))
  }

  async function handleViewReceipt(path) {
    try {
      window.open(await getReceiptUrl(path), '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    }
  }

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const spenderCount = rows.filter((row) => row.items.length > 0).length

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">
            {year}년 {month}월 지출비용 합계
          </div>
          <div className="value">{formatWon(grandTotal)}</div>
        </div>
        <div className="metric-card">
          <div className="label">지출 인원</div>
          <div className="value">{spenderCount}명</div>
        </div>
      </div>

      <div className="table">
        <div className="row head pay-expense-row">
          <span>이름</span>
          <span>지출비용</span>
        </div>
        {rows.length === 0 && (
          <div className="row">
            <span className="text-secondary">등록된 인원이 없습니다.</span>
          </div>
        )}
        {rows.map((row) => {
          const open = openUserId === row.userId
          return (
            <Fragment key={row.userId}>
              <div className="row pay-expense-row">
                <span>{row.name}</span>
                <button
                  type="button"
                  className="expense-toggle mono"
                  aria-expanded={open}
                  onClick={() => toggle(row.userId)}
                >
                  {formatWon(row.total)} <span className="expense-toggle-mark">{open ? '▲' : '▼'}</span>
                </button>
              </div>
              {open && (
                <div className="expand-list">
                  {row.items.length === 0 && <div className="expand-empty">해당 월 지출 내역 없음</div>}
                  {row.items.map((item) => (
                    <div key={item.id} className="expand-item expense-detail-row">
                      <span>{item.date.slice(5)}</span>
                      <span>{item.place || '-'}</span>
                      <span>{item.content || '-'}</span>
                      <span className="mono">{formatWon(item.amount)}</span>
                      <span>
                        {item.receiptPath ? (
                          <button type="button" className="link-btn" onClick={() => handleViewReceipt(item.receiptPath)}>
                            <IconPaperclip size={13} stroke={1.75} />
                          </button>
                        ) : (
                          '-'
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
