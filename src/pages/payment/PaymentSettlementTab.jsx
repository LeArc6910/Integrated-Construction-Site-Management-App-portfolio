import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSettlementList } from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import { usePeriod } from '../../hooks/usePeriod'
import { formatWon } from '../../lib/format'

const REQUEST_MESSAGE = '어플에서 급여 항목 입력 부탁드립니다.'

// 결제 > 월말정산. 사람별 최종 차액(급여 차액 + 지출 비용)과 실급여 입력 여부를 한눈에 보고,
// 입력이 안 된 사람에게 카카오톡으로 입력을 요청한다.
export default function PaymentSettlementTab() {
  const navigate = useNavigate()
  const { year, month, setPeriod } = usePeriod()
  const [rows, setRows] = useState(null) // null: 불러오는 중
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => fetchSettlementList({ year, month }), [year, month])

  useEffect(() => {
    let ignore = false
    load()
      .then((data) => !ignore && setRows(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  // 휴대폰은 공유 창을 띄워 카카오톡을 고르게 한다(받는 사람은 카카오톡 친구 목록에서 고른다).
  // 공유 창이 없는 PC에서는 문구를 복사해 두고 카카오톡에 붙여넣게 한다.
  async function handleSendKakao(e) {
    e.stopPropagation()
    setError('')
    setNotice('')
    if (navigator.share) {
      try {
        await navigator.share({ text: REQUEST_MESSAGE })
      } catch (err) {
        if (err?.name !== 'AbortError') setError(err.message)
      }
      return
    }
    try {
      await navigator.clipboard.writeText(REQUEST_MESSAGE)
      setNotice('메시지를 복사했습니다. 카카오톡 대화방에 붙여넣어 보내세요.')
    } catch {
      setNotice(`이 문구를 카카오톡으로 보내세요: ${REQUEST_MESSAGE}`)
    }
  }

  const list = rows ?? []
  const total = list.reduce((sum, row) => sum + row.finalGap, 0)
  const missing = list.filter((row) => !row.complete).length

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={({ year: y, month: m }) => setPeriod(y, m)} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="auth-message">{notice}</p>}

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">최종 차액 합계</div>
          <div className="value">{formatWon(total)}</div>
        </div>
        <div className="metric-card">
          <div className="label">실급여 미입력</div>
          <div className="value">{missing}명</div>
        </div>
      </div>

      <p className="text-secondary report-hint">
        최종 차액 = 급여 차액 + 지출 비용. 이름이 <span className="settle-name complete">초록색</span>이면 출근한 현장
        모두에 실급여가 입력된 사람, <span className="settle-name">빨간색</span>이면 아직 빠진 현장이 있는 사람입니다.
        이름을 누르면 그 사람의 대시보드가 열립니다.
      </p>

      <div className="table">
        <div className="row head settle-row">
          <span>이름</span>
          <span>최종 차액</span>
          <span />
        </div>
        {rows === null && !error && (
          <div className="row">
            <span className="text-secondary">불러오는 중…</span>
          </div>
        )}
        {rows?.length === 0 && (
          <div className="row">
            <span className="text-secondary">{month}월에 출근하거나 지출한 사람이 없습니다.</span>
          </div>
        )}
        {list.map((row) => (
          <div
            key={row.userId}
            className="row clickable settle-row"
            onClick={() => navigate(`/payment/settlement/${row.userId}`)}
          >
            <span className={`settle-name${row.complete ? ' complete' : ''}`}>
              {row.name}
              {!row.complete && <div className="gross-note">실급여 미입력 현장 {row.missingSites}곳</div>}
            </span>
            <span className="mono">{formatWon(row.finalGap)}</span>
            <span>
              <button type="button" className="btn small kakao-btn" onClick={handleSendKakao}>
                카톡 보내기
              </button>
            </span>
          </div>
        ))}
      </div>
      <p className="text-secondary">
        카톡 보내기를 누르면 &quot;{REQUEST_MESSAGE}&quot; 문구로 공유 창이 열립니다. 카카오톡을 고른 뒤 받는 사람을 고르세요(최근
        대화한 사람이 위쪽에 보입니다).
      </p>
    </div>
  )
}
