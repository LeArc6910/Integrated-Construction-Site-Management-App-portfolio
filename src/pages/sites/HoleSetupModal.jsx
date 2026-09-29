import { useState } from 'react'
import Modal from '../../components/Modal'

// 세대 타공 수 = 타입 기본 타공 수 + 세대에 붙은 옵션 가감 합 (src/lib/holes.js)
// 이 모달은 현장 타입표와 옵션표를 한 번에 고친다. 세대에 옵션을 붙이는 건 세대표의 "옵션 지정"에서 한다.

let tempSeq = 0
function tempKey() {
  tempSeq += 1
  return `new-${tempSeq}`
}

function toTypeRow(type) {
  return { key: type.id, id: type.id, originalName: type.name, name: type.name, hole: type.hole_count == null ? '' : String(type.hole_count) }
}

function toOptionRow(option) {
  return {
    key: option.id,
    id: option.id,
    name: option.name,
    sign: option.hole_delta < 0 ? '-' : '+',
    amount: String(Math.abs(option.hole_delta)),
  }
}

function digitsOnly(value) {
  return value.replace(/[^0-9]/g, '')
}

// siteName: 현장 밖(타공 설정 메뉴)에서 열 때 어느 현장인지 제목에 붙인다
export default function HoleSetupModal({ siteName, types, options, lineCountByType, optionUnitCount, saving, onClose, onSubmit }) {
  const [typeRows, setTypeRows] = useState(() => types.map(toTypeRow))
  const [optionRows, setOptionRows] = useState(() => options.map(toOptionRow))
  const [removedTypeIds, setRemovedTypeIds] = useState([])
  const [removedOptionIds, setRemovedOptionIds] = useState([])
  const [error, setError] = useState('')

  function patchType(key, patch) {
    setTypeRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function patchOption(key, patch) {
    setOptionRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removeType(row) {
    setTypeRows((rows) => rows.filter((r) => r.key !== row.key))
    if (row.id) setRemovedTypeIds((ids) => [...ids, row.id])
  }

  function removeOption(row) {
    setOptionRows((rows) => rows.filter((r) => r.key !== row.key))
    if (row.id) setRemovedOptionIds((ids) => [...ids, row.id])
  }

  function handleSubmit() {
    const typeNames = typeRows.map((row) => row.name.trim())
    if (typeNames.some((name) => !name)) {
      setError('타입 이름을 입력하세요.')
      return
    }
    if (new Set(typeNames).size !== typeNames.length) {
      setError('같은 이름의 타입이 두 개 있습니다.')
      return
    }

    const optionNames = optionRows.map((row) => row.name.trim())
    if (optionNames.some((name) => !name)) {
      setError('옵션 이름을 입력하세요.')
      return
    }
    if (new Set(optionNames).size !== optionNames.length) {
      setError('같은 이름의 옵션이 두 개 있습니다.')
      return
    }
    if (optionRows.some((row) => row.amount === '')) {
      setError('옵션의 타공 가감 개수를 입력하세요.')
      return
    }

    onSubmit({
      types: typeRows.map((row, index) => ({
        id: row.id ?? null,
        originalName: row.originalName ?? null,
        name: typeNames[index],
        // 비워 두면 미설정(null)로 저장되어 타공 현황에서 따로 표시된다
        holeCount: row.hole === '' ? null : parseInt(row.hole, 10),
      })),
      removedTypeIds,
      options: optionRows.map((row, index) => ({
        id: row.id ?? null,
        name: optionNames[index],
        holeDelta: (row.sign === '-' ? -1 : 1) * parseInt(row.amount, 10),
      })),
      removedOptionIds,
    })
  }

  return (
    <Modal title={siteName ? `타공 설정 · ${siteName}` : '타공 설정'} wide onClose={onClose}>
      <p className="text-secondary line-edit-hint">
        세대 타공 수 = 타입별 타공 수 + 그 세대에 지정한 옵션의 가감. 타공 수를 비워 두면 미설정으로 표시됩니다.
      </p>

      <label>타입별 타공 수</label>
      <div className="hole-edit-head">
        <span>타입</span>
        <span>타공 수</span>
        <span />
      </div>
      {typeRows.length === 0 && <p className="text-secondary">등록된 타입이 없습니다.</p>}
      {typeRows.map((row) => (
        <div key={row.key} className="hole-edit-row">
          <div>
            <input
              type="text"
              placeholder="84A"
              value={row.name}
              onChange={(e) => patchType(row.key, { name: e.target.value })}
            />
            <span className="hole-edit-note">사용 {lineCountByType[row.originalName] ?? 0}호</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="미설정"
            value={row.hole}
            onChange={(e) => patchType(row.key, { hole: digitsOnly(e.target.value) })}
          />
          <button type="button" className="btn small" onClick={() => removeType(row)} aria-label="타입 삭제">
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn small hole-add-btn"
        onClick={() => setTypeRows((rows) => [...rows, { key: tempKey(), id: null, name: '', hole: '' }])}
      >
        + 타입 추가
      </button>
      <p className="text-secondary line-edit-hint">
        타입 이름을 바꾸면 세대표 라인의 타입도 같이 바뀝니다. 타입을 지워도 라인에 적힌 타입은 남고 미설정으로 셉니다.
      </p>

      <label>옵션 (세대별 타공 가감)</label>
      <div className="hole-edit-head">
        <span>옵션</span>
        <span>가감</span>
        <span />
      </div>
      {optionRows.length === 0 && <p className="text-secondary">등록된 옵션이 없습니다.</p>}
      {optionRows.map((row) => (
        <div key={row.key} className="hole-edit-row">
          <div>
            <input
              type="text"
              placeholder="예: 침실 확장"
              value={row.name}
              onChange={(e) => patchOption(row.key, { name: e.target.value })}
            />
            {row.id && <span className="hole-edit-note">지정 {optionUnitCount[row.id] ?? 0}세대</span>}
          </div>
          <div className="hole-delta">
            <select value={row.sign} onChange={(e) => patchOption(row.key, { sign: e.target.value })} aria-label="더하기/빼기">
              <option value="+">+</option>
              <option value="-">−</option>
            </select>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              value={row.amount}
              onChange={(e) => patchOption(row.key, { amount: digitsOnly(e.target.value) })}
            />
          </div>
          <button type="button" className="btn small" onClick={() => removeOption(row)} aria-label="옵션 삭제">
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn small hole-add-btn"
        onClick={() =>
          setOptionRows((rows) => [...rows, { key: tempKey(), id: null, name: '', sign: '+', amount: '' }])
        }
      >
        + 옵션 추가
      </button>
      {removedOptionIds.length > 0 && (
        <p className="share-warning">지운 옵션은 지정된 세대에서도 함께 빠집니다.</p>
      )}

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn primary" disabled={saving} onClick={handleSubmit}>
          저장
        </button>
      </div>
    </Modal>
  )
}
