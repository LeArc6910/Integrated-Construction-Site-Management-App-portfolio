import { useCallback, useEffect, useState } from 'react'
import { createUpcomingSite, deleteUpcomingSite, fetchUpcomingSites, updateUpcomingSite } from '../../api/upcoming'
import Modal from '../../components/Modal'

const EMPTY_VISIT = { date: '', alarm: false }
const EMPTY_FORM = { name: '', location: '', phone: '', visits: [EMPTY_VISIT] }

function mapsUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
}

// 연락처는 숫자만 저장한다. 전화 앱에 그대로 넘길 수 있어야 해서 하이픈·공백을 받지 않는다.
function digitsOnly(value) {
  return value.replace(/\D/g, '')
}

// 저장은 숫자만 하고, 읽기 편하도록 표시할 때만 끊어준다.
function formatPhone(digits) {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10) {
    return digits.startsWith('02')
      ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
      : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 9 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  }
  return digits
}

export default function UpcomingPage() {
  const [sites, setSites] = useState([])
  const [modalMode, setModalMode] = useState(null) // null | 'add' | 예정현장 객체(수정 중)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => fetchUpcomingSites(), [])

  useEffect(() => {
    let ignore = false
    load()
      .then((rows) => !ignore && setSites(rows))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  async function reload() {
    try {
      setSites(await load())
    } catch (err) {
      setError(err.message)
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setModalMode('add')
  }

  function openEdit(site) {
    setForm({
      name: site.name,
      location: site.location,
      phone: digitsOnly(site.phone),
      visits: site.visits.length ? site.visits.map((v) => ({ date: v.date, alarm: v.alarm })) : [EMPTY_VISIT],
    })
    setModalMode(site)
  }

  function closeModal() {
    setModalMode(null)
    setError('')
  }

  function updateVisit(i, patch) {
    setForm((f) => ({ ...f, visits: f.visits.map((v, vi) => (vi === i ? { ...v, ...patch } : v)) }))
  }

  function addVisit() {
    setForm((f) => ({ ...f, visits: [...f.visits, { ...EMPTY_VISIT }] }))
  }

  function removeVisit(i) {
    setForm((f) => {
      const next = f.visits.filter((_, vi) => vi !== i)
      return { ...f, visits: next.length ? next : [{ ...EMPTY_VISIT }] }
    })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setError('')
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim(),
        phone: digitsOnly(form.phone),
        visits: form.visits.filter((v) => v.date).map((v) => ({ date: v.date, alarm: v.alarm })),
      }
      if (modalMode === 'add') {
        await createUpcomingSite(payload)
      } else {
        await updateUpcomingSite({ id: modalMode.id, ...payload })
      }
      closeModal()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setError('')
    setSaving(true)
    try {
      await deleteUpcomingSite({ id: modalMode.id })
      closeModal()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="page-title">예정 현장</h2>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="upcoming-list">
        {sites.length === 0 && <p className="text-secondary">등록된 예정현장이 없습니다.</p>}
        {sites.map((site) => (
          <div key={site.id} className="upcoming-card">
            <div className="upcoming-card-top">
              <b>{site.name}</b>
              <button type="button" className="btn small" onClick={() => openEdit(site)}>
                수정
              </button>
            </div>
            <div className="text-secondary">방문 예정일</div>
            {site.visits.length === 0 ? (
              <div className="text-secondary visit-line">등록된 방문일자 없음</div>
            ) : (
              site.visits.map((v) => (
                <div key={v.id} className="text-secondary visit-line">
                  - {v.date} · 알림 {v.alarm ? '켜짐' : '꺼짐'}
                </div>
              ))
            )}
            {site.location && (
              <a className="upcoming-link" href={mapsUrl(site.location)} target="_blank" rel="noopener noreferrer">
                {site.location} · 지도에서 보기
              </a>
            )}
            {/* 예전에 하이픈째로 저장된 연락처도 있어서, 걸 때는 항상 숫자만 넘긴다 */}
            {site.phone && (
              <a className="upcoming-link" href={`tel:${digitsOnly(site.phone)}`}>
                {formatPhone(digitsOnly(site.phone))} · 전화 걸기
              </a>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="btn primary" onClick={openAdd}>
        예정현장 추가
      </button>

      {modalMode && (
        <Modal title={modalMode === 'add' ? '예정현장 추가' : '예정현장 수정'} onClose={closeModal}>
          <label>현장 이름</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <label>위치</label>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />

          <label>방문 일자 (여러 개 등록 가능, 일자마다 알림 개별 설정)</label>
          <div className="visit-edit-list">
            {form.visits.map((v, i) => (
              <div key={i} className="visit-row">
                <input type="date" value={v.date} onChange={(e) => updateVisit(i, { date: e.target.value })} />
                <label className="visit-alarm">
                  <input type="checkbox" checked={v.alarm} onChange={(e) => updateVisit(i, { alarm: e.target.checked })} />
                  알림
                </label>
                <button type="button" className="btn small danger" onClick={() => removeVisit(i)}>
                  삭제
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn small" onClick={addVisit}>
            + 방문일자 추가
          </button>

          <label>연락처 (숫자만)</label>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="01012345678"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value) })}
          />

          <div className="modal-actions">
            {modalMode !== 'add' && (
              <button type="button" className="btn danger" disabled={saving} onClick={handleDelete}>
                삭제
              </button>
            )}
            <button type="button" className="btn primary" disabled={saving} onClick={handleSave}>
              {modalMode === 'add' ? '추가' : '수정'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
