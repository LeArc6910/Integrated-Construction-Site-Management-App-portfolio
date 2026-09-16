import { useRef, useState } from 'react'
import Modal from '../../components/Modal'

// 한 동에 둘 수 있는 호 수 상한. 실수로 큰 숫자를 넣어도 화면이 멈추지 않게 한다.
const MAX_LINES = 50

function emptyLine() {
  return { min: '1', max: '', type: '', core: '' }
}

function emptyTarget() {
  return { id: null, name: '', lines: [emptyLine()], lineText: '1' }
}

function toTarget(building) {
  const lines = building.lines.map((line) => ({
    min: String(line.min_floor ?? 1),
    max: String(line.max_floor),
    type: line.unit_type ?? '',
    core: line.core_label ?? '',
  }))
  return { id: building.id, name: building.name, lines, lineText: String(lines.length) }
}

// 입력 중에는 빈 칸을 그대로 두기 때문에, 저장할 때 한 번에 숫자로 정리한다.
function toRange(line) {
  const min = Math.max(1, parseInt(line.min, 10) || 1)
  const parsedMax = parseInt(line.max, 10)
  return { min, max: Number.isFinite(parsedMax) ? parsedMax : min }
}

export default function BuildingEditModal({ buildings, onClose, onSubmit, onDelete, onReorder, saving }) {
  // null이면 동 목록, 값이 있으면 그 동을 편집 중이다
  const [target, setTarget] = useState(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 드래그 중 화면에 바로 반영하려고 buildings와 별도로 순서를 들고 있다가, 저장이 끝나고
  // buildings가 새로 내려오면 다시 맞춘다.
  const dragId = useRef(null)

  function open(next) {
    setError('')
    setConfirmDelete(false)
    setTarget(next)
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  function handleDrop(targetId) {
    const fromId = dragId.current
    dragId.current = null
    if (fromId === null || fromId === targetId) return

    const fromIndex = buildings.findIndex((b) => b.id === fromId)
    const toIndex = buildings.findIndex((b) => b.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const next = [...buildings]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onReorder(next.map((b) => b.id))
  }

  function handleDelete() {
    onDelete(target.id)
  }

  function patchLine(index, patch) {
    setTarget((t) => ({
      ...t,
      lines: t.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }))
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
        lines: Array.from({ length: next }, (_, i) => t.lines[i] ?? emptyLine()),
      }
    })
  }

  function handleLineCountBlur() {
    setTarget((t) => ({ ...t, lineText: String(t.lines.length) }))
  }

  function handleSubmit() {
    if (!target.name.trim()) {
      setError('동 이름을 입력하세요.')
      return
    }

    const ranges = target.lines.map(toRange)
    const wrong = ranges.findIndex((range) => range.max < range.min)
    if (wrong !== -1) {
      setError(`${wrong + 1}호의 마지막 층이 시작 층보다 낮습니다.`)
      return
    }

    onSubmit({
      id: target.id,
      name: target.name.trim(),
      lines: ranges.map((range, index) => ({
        minFloor: range.min,
        maxFloor: range.max,
        unitType: target.lines[index].type.trim(),
        coreLabel: target.lines[index].core.trim(),
      })),
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
              <div
                key={building.id}
                className="building-row"
                draggable={!saving}
                onDragStart={() => {
                  dragId.current = building.id
                }}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(building.id)}
              >
                <span className="building-row-drag" aria-hidden="true">
                  ⠿
                </span>
                <span className="building-row-name">{building.name}</span>
                <span className="building-row-note">{building.lines.length}호</span>
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
  // 호 수를 줄이거나 층 범위를 좁히면 그 칸이 세대표에서 사라진다. 기록은 지워지지 않는다.
  const shrinking =
    original != null &&
    (target.lines.length < original.lines.length ||
      original.lines.some((line, i) => {
        if (!target.lines[i]) return false
        const { min, max } = toRange(target.lines[i])
        return min > (line.min_floor ?? 1) || max < line.max_floor
      }))

  if (confirmDelete) {
    return (
      <Modal title={`${original?.name ?? ''} 삭제`} onClose={onClose}>
        <p>
          <b>{original?.name}</b> 동을 삭제할까요?
        </p>
        <p className="share-warning">
          이 동의 층·세대·체크·미타공 기록이 모두 함께 지워지고 되돌릴 수 없습니다.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
            취소
          </button>
          <button type="button" className="btn danger" disabled={saving} onClick={handleDelete}>
            삭제
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={target.id ? `${original?.name ?? ''} 수정` : '동 추가'} onClose={onClose}>
      <label>동 이름</label>
      <input
        placeholder="예: 3동"
        value={target.name}
        onChange={(e) => setTarget({ ...target, name: e.target.value })}
      />

      <label>호 수 (라인 수)</label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={target.lineText}
        onChange={(e) => handleLineCountChange(e.target.value)}
        onBlur={handleLineCountBlur}
      />

      <label>호별 층 범위·타입·코어</label>
      <p className="text-secondary line-edit-hint">
        같은 코어를 쓰는 호에 같은 이름(예: 1 core)을 넣으면 세대표 아래에 한 칸으로 합쳐 표시됩니다.
      </p>
      <div className="line-edit-head">
        <span className="line-edit-no" />
        <span>시작층</span>
        <span>마지막층</span>
        <span>타입</span>
        <span>코어</span>
      </div>
      {target.lines.map((line, index) => (
        <div key={index} className="line-edit-row">
          <span className="line-edit-no">{index + 1}호</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="1"
            value={line.min}
            onChange={(e) => patchLine(index, { min: e.target.value.replace(/[^0-9]/g, '') })}
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="15"
            value={line.max}
            onChange={(e) => patchLine(index, { max: e.target.value.replace(/[^0-9]/g, '') })}
          />
          <input type="text" placeholder="84A" value={line.type} onChange={(e) => patchLine(index, { type: e.target.value })} />
          <input
            type="text"
            placeholder="1 core"
            value={line.core}
            onChange={(e) => patchLine(index, { core: e.target.value })}
          />
        </div>
      ))}

      {shrinking && (
        <p className="share-warning">
          호 수를 줄이거나 층 범위를 좁히면 그 칸은 세대표에서 사라집니다. 체크·미타공 기록은 지워지지 않아서 다시
          넓히면 그대로 보입니다.
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
        {target.id && (
          <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
            삭제
          </button>
        )}
        <button type="button" className="btn primary" disabled={saving} onClick={handleSubmit}>
          완료
        </button>
      </div>
    </Modal>
  )
}
