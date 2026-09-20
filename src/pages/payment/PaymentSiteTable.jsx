import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatWon } from '../../lib/format'
import { loadSort, saveSort } from '../../lib/storedSort'

// 진행 현장 / 완료 현장 표는 열 구성이 같아서 한 컴포넌트로 쓴다.
// 정렬은 현장 수가 많지 않아 서버가 아니라 화면에서 처리한다.
const COLUMNS = [
  { key: 'name', label: '현장이름', type: 'text' },
  { key: 'contractAmount', label: '계약금액', type: 'number' },
  { key: 'receivedInMonth', label: '수령금액', type: 'number' },
  { key: 'remaining', label: '남은금액', type: 'number' },
]

// 처음 누를 때의 방향: 이름은 가나다순, 금액은 큰 것부터가 보기 편하다.
function defaultAsc(type) {
  return type === 'text'
}

function sortSites(sites, sort) {
  if (!sort) return sites
  const column = COLUMNS.find((col) => col.key === sort.key)
  if (!column) return sites

  const direction = sort.asc ? 1 : -1
  return [...sites].sort((a, b) => {
    const left = a[sort.key]
    const right = b[sort.key]
    const diff = column.type === 'text' ? String(left).localeCompare(String(right), 'ko') : left - right
    return diff * direction
  })
}

// storageKey: 진행 현장과 완료 현장은 따로 기억한다(한쪽을 금액순으로 봐도 다른 쪽은 그대로 둔다).
// 아직 정렬한 적이 없으면 null이라, 서버가 준 순서(이름순)를 그대로 쓴다.
export default function PaymentSiteTable({ sites, emptyText, storageKey }) {
  const navigate = useNavigate()
  const [sort, setSort] = useState(() =>
    loadSort(storageKey, COLUMNS.map((column) => column.key), null)
  )

  // 같은 열을 다시 누르면 방향만 뒤집고, 다른 열을 누르면 그 열의 기본 방향으로 시작한다.
  function toggleSort(column) {
    const next =
      sort?.key === column.key
        ? { key: column.key, asc: !sort.asc }
        : { key: column.key, asc: defaultAsc(column.type) }
    setSort(next)
    saveSort(storageKey, next)
  }

  const sorted = sortSites(sites, sort)

  return (
    <div className="table">
      <div className="row head pay-site-row">
        {COLUMNS.map((column) => (
          <button
            key={column.key}
            type="button"
            className={`sort-head${sort?.key === column.key ? ' active' : ''}`}
            onClick={() => toggleSort(column)}
          >
            <span className="sort-head-label">{column.label}</span>
            {/* 화살표는 정렬 중인 열에만 띄운다. 네 열 모두에 붙이면 좁은 화면에서 글자가 밀린다 */}
            <span className="sort-arrow">{sort?.key === column.key ? (sort.asc ? '▲' : '▼') : ''}</span>
          </button>
        ))}
      </div>
      {sorted.length === 0 && (
        <div className="row">
          <span className="text-secondary">{emptyText}</span>
        </div>
      )}
      {sorted.map((site) => (
        <div
          key={site.id}
          className="row clickable pay-site-row"
          onClick={() => navigate(`/payment/sites/${site.id}`)}
        >
          <span>{site.name}</span>
          <span className="mono">{formatWon(site.contractAmount)}</span>
          <span className="mono">{formatWon(site.receivedInMonth)}</span>
          <span className="mono">{formatWon(site.remaining)}</span>
        </div>
      ))}
    </div>
  )
}
