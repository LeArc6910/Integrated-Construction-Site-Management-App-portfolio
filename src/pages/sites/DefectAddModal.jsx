import { useState } from 'react'
import Modal from '../../components/Modal'

const LOCATIONS = ['거실', '주방', '침실', '안방', '기타']
const TYPES = ['적재', '작업', '기타']

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export default function DefectAddModal({ onClose, onSubmit, saving }) {
  const [locations, setLocations] = useState([])
  const [locationEtc, setLocationEtc] = useState('')
  const [types, setTypes] = useState([])
  const [typeEtc, setTypeEtc] = useState('')
  const [error, setError] = useState('')

  function handleSubmit() {
    if (types.length === 0) {
      setError('내용을 하나 이상 선택하세요.')
      return
    }

    const resolvedLocations = locations.map((loc) => (loc === '기타' ? locationEtc.trim() || '기타' : loc))
    const etc = types.includes('기타') ? typeEtc.trim() : ''

    onSubmit({
      locations: resolvedLocations.length ? resolvedLocations : ['기타'],
      content: types.join(', ') + (etc ? ` (${etc})` : ''),
    })
  }

  return (
    <Modal title="미타공 등록" onClose={onClose}>
      <label>위치 (복수 선택)</label>
      <div className="checkbox-group">
        {LOCATIONS.map((loc) => (
          <label key={loc}>
            <input type="checkbox" checked={locations.includes(loc)} onChange={() => setLocations(toggle(locations, loc))} />
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

      <label>내용 (복수 선택)</label>
      <div className="checkbox-group">
        {TYPES.map((type) => (
          <label key={type}>
            <input type="checkbox" checked={types.includes(type)} onChange={() => setTypes(toggle(types, type))} />
            {type}
          </label>
        ))}
      </div>
      {types.includes('기타') && (
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
