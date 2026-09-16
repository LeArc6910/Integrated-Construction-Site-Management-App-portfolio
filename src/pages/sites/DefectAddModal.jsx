import { useState } from 'react'
import Modal from '../../components/Modal'

// '전체'는 개별 위치를 한꺼번에 고르는 단축키가 아니라 그 자체로 하나의 위치 값이다.
// 전체를 고르면 "세대 전체" 한 건으로 등록된다.
const ALL_LOCATION = '전체'
const LOCATIONS = ['거실', '주방', '침실', '안방', '기타']
const TYPES = ['적재', '작업', '천장작업', '기타']

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export default function DefectAddModal({ onClose, onSubmit, saving }) {
  const [locations, setLocations] = useState([])
  const [locationEtc, setLocationEtc] = useState('')
  const [type, setType] = useState('')
  const [typeEtc, setTypeEtc] = useState('')
  const [error, setError] = useState('')

  const allChecked = locations.includes(ALL_LOCATION)

  // 전체와 개별 위치는 함께 고를 수 없다. 전체를 켜면 개별 위치가 풀리고, 개별 위치를 고르면 전체가 풀린다.
  function handleToggleAll() {
    setLocations(allChecked ? [] : [ALL_LOCATION])
  }

  function handleToggleLocation(loc) {
    setLocations((prev) => toggle(prev.filter((item) => item !== ALL_LOCATION), loc))
  }

  function handleSubmit() {
    if (!type) {
      setError('내용을 선택하세요.')
      return
    }

    const resolvedLocations = locations.map((loc) => (loc === '기타' ? locationEtc.trim() || '기타' : loc))
    const content = type === '기타' ? typeEtc.trim() || '기타' : type

    // 위치를 여러 개 고르면 하나로 묶지 않고, 위치마다 별도의 미타공 건으로 등록한다.
    onSubmit({
      locations: resolvedLocations.length ? resolvedLocations : ['기타'],
      content,
    })
  }

  return (
    <Modal title="미타공 등록" onClose={onClose}>
      <label>위치 (복수 선택 · 전체는 단독 선택)</label>
      <div className="checkbox-group">
        <label>
          <input type="checkbox" checked={allChecked} onChange={handleToggleAll} />
          {ALL_LOCATION}
        </label>
        {LOCATIONS.map((loc) => (
          <label key={loc}>
            <input type="checkbox" checked={locations.includes(loc)} onChange={() => handleToggleLocation(loc)} />
            {loc}
          </label>
        ))}
      </div>
      {locations.includes('기타') && (
        <input
          placeholder="기타 위치 직접 입력"
          value={locationEtc}
          onChange={(e) => setLocationEtc(e.target.value)}
        />
      )}

      <label>내용 (하나만 선택)</label>
      <div className="checkbox-group">
        {TYPES.map((t) => (
          <label key={t}>
            <input type="radio" name="defect-type" checked={type === t} onChange={() => setType(t)} />
            {t}
          </label>
        ))}
      </div>
      {type === '기타' && (
        <input placeholder="기타 내용 직접 입력" value={typeEtc} onChange={(e) => setTypeEtc(e.target.value)} />
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
          완료
        </button>
      </div>
    </Modal>
  )
}
