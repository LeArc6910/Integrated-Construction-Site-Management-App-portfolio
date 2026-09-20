import { useState } from 'react'
import Modal from '../../components/Modal'

const UNASSIGNED = ''

// 아직 저장되지 않은 공구는 id가 없다. 동을 미리 배정해둘 수 있도록 임시 키를 붙여서 구분한다.
let tempSeq = 0
function newSection() {
  tempSeq += 1
  return { id: null, tempKey: `new-${tempSeq}`, name: '' }
}

function keyOf(section) {
  return section.id ?? section.tempKey
}

// 공구를 추가하고, 동마다 어느 공구에 속하는지 고른다. 한 동은 한 공구에만 속하므로
// 동별 드롭다운 하나로 지정한다(고르지 않으면 "미지정").
export default function SectionEditModal({ buildings, sections, saving, onClose, onSubmit }) {
  const [rows, setRows] = useState(() => sections.map((section) => ({ ...section, tempKey: null })))
  const [removedIds, setRemovedIds] = useState([])
  const [assignments, setAssignments] = useState(() =>
    Object.fromEntries(buildings.map((building) => [building.id, building.sectionId ?? UNASSIGNED]))
  )
  const [error, setError] = useState('')

  function addSection() {
    setRows((prev) => [...prev, newSection()])
  }

  function renameSection(key, name) {
    setRows((prev) => prev.map((row) => (keyOf(row) === key ? { ...row, name } : row)))
  }

  // 공구를 빼면 거기 속해 있던 동은 화면에서도 바로 "미지정"으로 돌려놔야 저장 결과와 같아진다
  function removeSection(key) {
    setRows((prev) => prev.filter((row) => keyOf(row) !== key))
    setAssignments((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([buildingId, sectionKey]) => [
          buildingId,
          String(sectionKey) === String(key) ? UNASSIGNED : sectionKey,
        ])
      )
    )
    if (typeof key === 'number') setRemovedIds((prev) => [...prev, key])
  }

  function handleSubmit() {
    const named = rows.map((row) => ({ ...row, name: row.name.trim() }))
    if (named.some((row) => !row.name)) {
      setError('공구 이름을 입력해주세요.')
      return
    }
    if (new Set(named.map((row) => row.name)).size !== named.length) {
      setError('같은 이름의 공구가 있습니다.')
      return
    }
    setError('')
    // select가 돌려준 값은 문자열이라, 기존 공구는 숫자 id로 되돌려서 넘긴다
    const normalized = Object.fromEntries(
      Object.entries(assignments).map(([buildingId, key]) => {
        const row = named.find((item) => String(keyOf(item)) === String(key))
        return [buildingId, row ? (row.id ?? row.tempKey) : null]
      })
    )
    onSubmit({ sections: named, removedIds, assignments: normalized })
  }

  return (
    <Modal title="공구 수정" onClose={onClose}>
      <label>공구 목록</label>
      {rows.length === 0 && <p className="text-secondary">등록된 공구가 없습니다.</p>}
      <div className="section-edit-list">
        {rows.map((row) => (
          <div key={keyOf(row)} className="section-row">
            <input
              value={row.name}
              placeholder="예: 1공구"
              onChange={(e) => renameSection(keyOf(row), e.target.value)}
            />
            <button type="button" className="btn small danger" onClick={() => removeSection(keyOf(row))}>
              삭제
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn small" onClick={addSection}>
        + 공구 추가
      </button>

      <label>동별 공구 지정</label>
      {buildings.length === 0 ? (
        <p className="text-secondary">등록된 동이 없습니다.</p>
      ) : (
        <div className="section-edit-list">
          {buildings.map((building) => (
            <div key={building.id} className="section-row">
              <span>{building.name}</span>
              <select
                value={assignments[building.id] ?? UNASSIGNED}
                onChange={(e) =>
                  setAssignments((prev) => ({ ...prev, [building.id]: e.target.value || UNASSIGNED }))
                }
              >
                <option value={UNASSIGNED}>미지정</option>
                {rows.map((row) => (
                  <option key={keyOf(row)} value={keyOf(row)}>
                    {row.name.trim() || '(이름 없음)'}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn primary" disabled={saving} onClick={handleSubmit}>
          저장
        </button>
      </div>
    </Modal>
  )
}
