import { formatWon } from '../lib/format'

// 결제 > 현장 / 완료 현장 최상단 합계. 표의 열과 같은 기준으로 더한다:
// 계약금액·남은금액은 현장 누적, 수령금액은 선택한 달에 받은 금액.
export default function SiteTotalsCards({ sites, month }) {
  const totals = sites.reduce(
    (sum, site) => ({
      contract: sum.contract + site.contractAmount,
      received: sum.received + site.receivedInMonth,
      remaining: sum.remaining + site.remaining,
    }),
    { contract: 0, received: 0, remaining: 0 }
  )

  return (
    <div className="card-grid">
      <div className="metric-card">
        <div className="label">계약금액 합계</div>
        <div className="value">{formatWon(totals.contract)}</div>
      </div>
      <div className="metric-card">
        <div className="label">{month}월 수령금액 합계</div>
        <div className="value">{formatWon(totals.received)}</div>
      </div>
      <div className="metric-card">
        <div className="label">남은금액 합계</div>
        <div className="value">{formatWon(totals.remaining)}</div>
      </div>
    </div>
  )
}
