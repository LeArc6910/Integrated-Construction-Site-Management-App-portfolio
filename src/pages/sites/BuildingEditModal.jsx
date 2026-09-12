import { useState } from 'react'
import Modal from '../../components/Modal'

function emptyTarget() {
  return { id: null, name: '', floors: [''] }
}

function toTarget(building) {
  return {
    id: building.id,
    name: building.name,
    floors: building.lines.map((line) => String(line.max_floor)),
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

  function handleLineCountChange(value) {
    const count = Math.max(1, parseInt(value, 10) || 1)
    setTarget((t) => ({ ...t, floors: Array.from({ length: count }, (_, i) => t.floors[i] ?? '') }))
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
      <input type="number" min="1" value={target.floors.length} onChange={(e) => handleLineCountChange(e.target.value)} />

      <label>세대별 최대 층수</label>
      {target.floors.map((floor, index) => (
        <input
          key={index}
          type="number"
          min="1"
          className="floor-input"
          placeholder={`${index + 1}세대 최대층`}
          value={floor}
          onChange={(e) =>
            setTarget({ ...target, floors: target.floors.map((item, i) => (i === index ? e.target.value : item)) })
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
