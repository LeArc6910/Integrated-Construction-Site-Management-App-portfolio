import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'

// '전체'는 개별 위치를 한꺼번에 고르는 단축키가 아니라 그 자체로 하나의 위치 값이다.
// 전체를 고르면 "세대 전체" 한 건으로 등록된다.
const ALL_LOCATION = '전체'
const LOCATIONS = ['거실', '주방', '침실', '안방', '기타']
const TYPES = ['적재', '작업', '천장작업', '기타']
const MAX_PHOTOS = 5

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

// 저장된 값을 선택지로 되돌린다. 목록에 없는 값은 '기타' + 직접 입력으로 본다.
function initialLocations(defect) {
  if (!defect) return { locations: [], etc: '' }
  let etc = ''
  const locations = (defect.locations ?? []).map((loc) => {
    if (loc === ALL_LOCATION || LOCATIONS.includes(loc)) return loc
    etc = loc
    return '기타'
  })
  return { locations: [...new Set(locations)], etc }
}

function initialType(defect) {
  if (!defect?.content) return { type: '', etc: '' }
  return TYPES.includes(defect.content) ? { type: defect.content, etc: '' } : { type: '기타', etc: defect.content }
}

// 미타공 등록·수정 창. defect를 넘기면 수정이다.
// photoUrls: 이미 붙은 사진의 보기 주소({ 경로: 주소 }). 연결이 없으면 비어 있을 수 있다.
// onSubmit({ locations, content, newFiles, keptPaths, removedPaths })
export default function DefectFormModal({ defect = null, photoUrls = {}, onClose, onSubmit, saving }) {
  const isEdit = Boolean(defect)
  const [locations, setLocations] = useState(() => initialLocations(defect).locations)
  const [locationEtc, setLocationEtc] = useState(() => initialLocations(defect).etc)
  const [type, setType] = useState(() => initialType(defect).type)
  const [typeEtc, setTypeEtc] = useState(() => initialType(defect).etc)
  const [keptPaths, setKeptPaths] = useState(() => defect?.photo_paths ?? [])
  const [newFiles, setNewFiles] = useState([])
  const [error, setError] = useState('')

  const allChecked = locations.includes(ALL_LOCATION)

  // 새로 고른 사진의 미리보기 주소. 창을 닫거나 사진을 바꾸면 풀어 준다.
  const previews = useMemo(() => newFiles.map((file) => URL.createObjectURL(file)), [newFiles])
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews])

  // 전체와 개별 위치는 함께 고를 수 없다. 전체를 켜면 개별 위치가 풀리고, 개별 위치를 고르면 전체가 풀린다.
  function handleToggleAll() {
    setLocations(allChecked ? [] : [ALL_LOCATION])
  }

  function handleToggleLocation(loc) {
    setLocations((prev) => toggle(prev.filter((item) => item !== ALL_LOCATION), loc))
  }

  function handlePickFiles(e) {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    const room = MAX_PHOTOS - keptPaths.length - newFiles.length
    if (picked.length > room) setError(`사진은 한 건에 ${MAX_PHOTOS}장까지 붙일 수 있습니다.`)
    setNewFiles((prev) => [...prev, ...picked.slice(0, Math.max(0, room))])
  }

  function handleSubmit() {
    if (!type) {
      setError('내용을 선택하세요.')
      return
    }

    const resolvedLocations = locations.map((loc) => (loc === '기타' ? locationEtc.trim() || '기타' : loc))
    const content = type === '기타' ? typeEtc.trim() || '기타' : type

    // 등록할 때 위치를 여러 개 고르면 하나로 묶지 않고, 위치마다 별도의 미타공 건으로 등록한다.
    onSubmit({
      locations: resolvedLocations.length ? resolvedLocations : ['기타'],
      content,
      newFiles,
      keptPaths,
      removedPaths: (defect?.photo_paths ?? []).filter((path) => !keptPaths.includes(path)),
    })
  }

  return (
    <Modal title={isEdit ? '미타공 수정' : '미타공 등록'} onClose={onClose}>
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

      <label>사진 (최대 {MAX_PHOTOS}장)</label>
      <div className="defect-photo-grid">
        {keptPaths.map((path) => (
          <div key={path} className="defect-photo">
            {photoUrls[path] ? <img src={photoUrls[path]} alt="미타공 사진" /> : <span className="text-secondary">사진</span>}
            <button
              type="button"
              className="defect-photo-remove"
              aria-label="사진 빼기"
              onClick={() => setKeptPaths((prev) => prev.filter((p) => p !== path))}
            >
              ✕
            </button>
          </div>
        ))}
        {previews.map((url, index) => (
          <div key={url} className="defect-photo">
            <img src={url} alt="새 사진" />
            <button
              type="button"
              className="defect-photo-remove"
              aria-label="사진 빼기"
              onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {keptPaths.length + newFiles.length < MAX_PHOTOS && (
        <input type="file" accept="image/*" multiple onChange={handlePickFiles} />
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
          {isEdit ? '저장' : '완료'}
        </button>
      </div>
    </Modal>
  )
}
