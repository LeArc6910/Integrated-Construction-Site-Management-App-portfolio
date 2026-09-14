import { useCallback, useEffect, useState } from 'react'
import {
  addChecklistItem,
  deleteChecklistItem,
  fetchChecklist,
  setChecklistChecked,
  updateChecklistContent,
} from '../../api/checklist'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatStamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export default function ChecklistPanel({ siteId, userId, names }) {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(() => fetchChecklist({ siteId }), [siteId])

  useEffect(() => {
    let ignore = false
    load()
      .then((data) => !ignore && setItems(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  function patchItem(id, patch) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function handleAdd() {
    setError('')
    try {
      const item = await addChecklistItem({ siteId, userId })
      setItems((prev) => [...prev, item])
    } catch (err) {
      setError(err.message)
    }
  }

  function handleContentChange(id, content) {
    patchItem(id, { content })
  }

  async function handleContentBlur(id, content) {
    try {
      await updateChecklistContent({ id, content })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleToggle(item) {
    const checked = !item.checked
    const checkedAt = checked ? new Date().toISOString() : null
    const checkedBy = checked ? userId : null
    patchItem(item.id, { checked, checked_by: checkedBy, checked_at: checkedAt })
    try {
      await setChecklistChecked({ id: item.id, checked, userId })
    } catch (err) {
      setError(err.message)
      patchItem(item.id, item)
    }
  }

  async function handleDelete(id) {
    setError('')
    try {
      await deleteChecklistItem({ id })
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="checklist">
        {items.length === 0 && <p className="text-secondary">등록된 체크리스트 항목이 없습니다.</p>}
        {items.map((item) => (
          <div key={item.id} className="checklist-row">
            <input
              type="text"
              className="checklist-content"
              placeholder="작업 내용을 입력하세요"
              value={item.content}
              onChange={(e) => handleContentChange(item.id, e.target.value)}
              onBlur={(e) => handleContentBlur(item.id, e.target.value)}
            />
            <div className="checklist-check">
              <label>
                <input type="checkbox" checked={item.checked} onChange={() => handleToggle(item)} />
                완료
              </label>
              <span className="text-secondary checklist-meta">
                {item.checked ? `마지막 체크: ${names[item.checked_by] ?? '알 수 없음'} · ${formatStamp(item.checked_at)}` : ''}
              </span>
            </div>
            <button type="button" className="link-btn" onClick={() => handleDelete(item.id)}>
              삭제
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn" onClick={handleAdd}>
        + 항목 추가
      </button>
    </div>
  )
}
