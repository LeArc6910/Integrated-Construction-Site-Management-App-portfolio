import { useEffect, useState } from 'react'
import { fetchShareCandidates } from '../../api/sheetSharing'
import Modal from '../../components/Modal'

export default function SheetShareModal({ ownerSiteId, ownerName, onClose, onSubmit, saving }) {
  const [candidates, setCandidates] = useState(null)
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    fetchShareCandidates({ ownerSiteId })
      .then((rows) => {
        if (ignore) return
        setCandidates(rows)
        setSelected(rows.filter((row) => row.shared).map((row) => row.id))
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [ownerSiteId])

  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  // 자기 세대표에 기록이 있는 현장을 공유로 바꾸면 그 기록은 화면에서 가려진다(지워지지는 않는다)
  const hidingSites = (candidates ?? []).filter(
    (row) => selected.includes(row.id) && row.ownBuildingCount > 0
  )
  const releasedSites = (candidates ?? []).filter((row) => row.shared && !selected.includes(row.id))

  return (
    <Modal title="세대표 공유" onClose={onClose}>
      <p className="text-secondary">
        <b>{ownerName}</b>의 세대표를 함께 쓸 현장을 고르세요. 경량·합지·석고 시공·미타공이 모두 같이 기록됩니다.
      </p>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      {candidates === null && !error && <p className="text-secondary">현장 목록을 불러오는 중입니다.</p>}

      {candidates !== null && candidates.length === 0 && (
        <p className="text-secondary">공유할 수 있는 다른 현장이 없습니다.</p>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className="share-list">
          {candidates.map((row) => (
            <label key={row.id} className={`share-row${row.blockedReason ? ' blocked' : ''}`}>
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                disabled={Boolean(row.blockedReason)}
                onChange={() => toggle(row.id)}
              />
              <span className="share-row-name">{row.name}</span>
              <span className="share-row-note">
                {row.blockedReason ??
                  (row.ownBuildingCount > 0 ? `자기 세대표 ${row.ownBuildingCount}동` : '세대표 없음')}
              </span>
            </label>
          ))}
        </div>
      )}

      {hidingSites.length > 0 && (
        <p className="share-warning">
          {hidingSites.map((row) => row.name).join(', ')}에는 이미 세대표가 있습니다. 공유하면 그 기록은 화면에서
          가려집니다. 지워지지는 않아서 공유를 풀면 다시 보입니다.
        </p>
      )}

      {releasedSites.length > 0 && (
        <p className="share-warning">
          {releasedSites.map((row) => row.name).join(', ')}은(는) 공유가 풀려 자기 세대표로 돌아갑니다.
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={saving || candidates === null}
          onClick={() => onSubmit({ siteIds: selected })}
        >
          저장
        </button>
      </div>
    </Modal>
  )
}
