import { useState } from 'react'
import Modal from '../../components/Modal'

// 한 동에 둘 수 있는 세대(라인) 수 상한. 실수로 큰 숫자를 넣어도 화면이 멈추지 않게 한다.
const MAX_LINES = 50

function emptyTarget() {
  return { id: null, name: '', floors: [''], lineText: '1' }
}

function toTarget(building) {
  const floors = building.lines.map((line) => String(line.max_floor))
  return {
    id: building.id,
    name: building.name,
    floors,
    lineText: String(floors.length),
  }
}

export default function BuildingEditModal({ buildings, onClose, onSubmit, saving }) {
  // null이면 동 목록, 값이 있으면 그 동을 편집 중이다
  const [target, setTarget] = useState(null)
  const [error, setError] = useState('')

  function open(next) {
    setError('')
    setTarget(next)
  }

  // 입력 중에는 빈 칸도 그대로 둔다. 매 글자마다 1로 되돌리면 iOS에서 지우는 순간
  // 값이 되살아나 새 숫자를 못 넣는다. 정리는 포커스를 뗄 때 한다.
  function handleLineCountChange(value) {
    const digits = value.replace(/[^0-9]/g, '')
    setTarget((t) => {
      const count = parseInt(digits, 10)
      if (!Number.isFinite(count) || count < 1) return { ...t, lineText: digits }
      const next = Math.min(count, MAX_LINES)
      return {
        ...t,
        lineText: next === count ? digits : String(next),
        floors: Array.from({ length: next }, (_, i) => t.floors[i] ?? ''),
      }
    })
  }

  function handleLineCountBlur() {
    setTarget((t) => ({ ...t, lineText: String(t.floors.length) }))
  }

  function handleSubmit() {
    if (!target.name.trim()) {
      setError('동 이름을 입력하세요.')
      return
    }
    onSubmit({
      id: target.id,
      name: target.name.trim(),
      maxFloors: target.floors.map((floor) => Math.max(1, parseInt(floor, 10) || 1)),
    })
  }

  if (target === null) {
    return (
      <Modal title="세대표 수정" onClose={onClose}>
        {buildings.length === 0 ? (
          <p className="text-secondary">등록된 동이 없습니다. 아래에서 동을 추가하세요.</p>
        ) : (
          <div className="building-list">
            {buildings.map((building) => (
              <div key={building.id} className="building-row">
                <span className="building-row-name">{building.name}</span>
                <span className="building-row-note">{building.lines.length}세대</span>
                <button type="button" className="btn small" onClick={() => open(toTarget(building))}>
                  수정
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="btn primary" onClick={() => open(emptyTarget())}>
            동 추가
          </button>
        </div>
      </Modal>
    )
  }

  const original = target.id ? buildings.find((b) => b.id === target.id) : null
  // 세대수나 층수를 줄이면 그 칸이 세대표에서 사라진다. 기록은 지워지지 않는다.
  const shrinking =
    original !== null &&
    (target.floors.length < original.lines.length ||
      original.lines.some((line, i) => {
        const next = parseInt(target.floors[i], 10)
        return Number.isFinite(next) && next < line.max_floor
      }))

  return (
    <Modal title={target.id ? `${original?.name ?? ''} 수정` : '동 추가'} onClose={onClose}>
      <label>동 이름</label>
      <input
        placeholder="예: 3동"
        value={target.name}
        onChange={(e) => setTarget({ ...target, name: e.target.value })}
      />

      <label>세대수 (라인 수)</label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={target.lineText}
        onChange={(e) => handleLineCountChange(e.target.value)}
        onBlur={handleLineCountBlur}
      />

      <label>세대별 최대 층수</label>
      {target.floors.map((floor, index) => (
        <input
          key={index}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="floor-input"
          placeholder={`${index + 1}세대 최대층`}
          value={floor}
          onChange={(e) =>
            setTarget({
              ...target,
              floors: target.floors.map((item, i) => (i === index ? e.target.value.replace(/[^0-9]/g, '') : item)),
            })
          }
        />
      ))}

      {shrinking && (
        <p className="share-warning">
          세대수나 층수를 줄이면 그 칸은 세대표에서 사라집니다. 체크·미타공 기록은 지워지지 않아서 다시 늘리면 그대로
          보입니다.
        </p>
      )}

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => open(null)}>
          뒤로
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={handleSubmit}>
          완료
        </button>
      </div>
    </Modal>
  )
}
