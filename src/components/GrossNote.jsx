import { formatWon } from '../lib/format'

// 실급여 옆에 붙는 "(제외 전 금액)" 표기. 실급여를 보여주는 화면마다 같은 모양으로 쓴다.
// 입력값이 없으면(0원) 굳이 붙이지 않는다.
export default function GrossNote({ gross }) {
  if (!gross) return null
  return <div className="gross-note">(제외 전 {formatWon(gross)})</div>
}
