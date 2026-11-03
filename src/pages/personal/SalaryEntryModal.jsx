import { useState } from 'react'
import { deleteReceipt, getReceiptUrl, uploadReceipt } from '../../api/expense'
import { addSalaryEntry, deleteSalaryEntry, updateSalaryEntry } from '../../api/salary'
import Modal from '../../components/Modal'
import { formatWon } from '../../lib/format'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

// 수령 급여(실급여) 입력·수정 창. 개인 > 급여 탭과 대시보드의 현장별 [실급여 입력]이 같이 쓴다.
// entry: 수정할 항목(없으면 추가). initial: 추가할 때 미리 채울 { year, month, siteId }.
// onSaved({ year, month }): 저장·삭제가 끝난 뒤 부른다(입력한 달로 화면을 옮길 때 쓴다).
export default function SalaryEntryModal({ userId, sites, entry = null, initial, onClose, onSaved }) {
  const isAdd = !entry
  const [form, setForm] = useState(() =>
    isAdd
      ? { year: initial.year, month: initial.month, siteId: initial.siteId ?? '', amount: '', receiptFile: null }
      : { year: entry.year, month: entry.month, siteId: entry.siteId ?? '', amount: String(entry.amount), receiptFile: null }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const formYears = [form.year - 1, form.year, form.year + 1]

  async function handleViewReceipt(path) {
    try {
      window.open(await getReceiptUrl(path), '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSave() {
    const amount = parseInt(form.amount, 10)
    if (!form.siteId) {
      setError('현장을 선택하세요.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('수령 급여를 숫자로 입력하세요.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const receiptPath = form.receiptFile
        ? await uploadReceipt({ userId, file: form.receiptFile })
        : (!isAdd && entry.receiptPath) || null

      const payload = { siteId: Number(form.siteId), year: form.year, month: form.month, amount, receiptPath }
      if (isAdd) {
        await addSalaryEntry({ userId, ...payload, clientId: crypto.randomUUID() })
      } else {
        await updateSalaryEntry({ id: entry.id, ...payload })
        if (form.receiptFile && entry.receiptPath) await deleteReceipt(entry.receiptPath)
      }
      await onSaved({ year: form.year, month: form.month })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await deleteSalaryEntry({ id: entry.id, receiptPath: entry.receiptPath })
      await onSaved({ year: entry.year, month: entry.month })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={isAdd ? '수령 급여 추가' : '수령 급여 수정'} onClose={onClose}>
      <div className="salary-month-warning">
        <b>급여를 받은 달이 아니라 일한 달을 선택하세요.</b>
        <br />
        예) 8월 한 달 일하고 9월 10일에 급여를 받았다면 → <b>8월</b> 선택
      </div>

      <label>일한 연/월</label>
      <div className="salary-month-select">
        <select value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} aria-label="일한 연도">
          {formYears.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })} aria-label="일한 월">
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}월
            </option>
          ))}
        </select>
        <span className="salary-month-chip">{form.month}월에 일한 급여</span>
      </div>

      <label>현장</label>
      <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
        <option value="">현장 선택</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>

      <label>수령 급여 (원)</label>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="예: 3500000"
        value={form.amount}
        onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })}
      />
      {form.amount && <p className="text-secondary salary-amount-preview">{formatWon(Number(form.amount))}</p>}

      <label>
        증빙 사진 {isAdd ? '첨부' : '재첨부'}
        {!isAdd && entry.receiptPath && (
          <>
            {' '}
            (기존:{' '}
            <button type="button" className="link-btn" onClick={() => handleViewReceipt(entry.receiptPath)}>
              보기
            </button>
            )
          </>
        )}
      </label>
      <input type="file" accept="image/*" onChange={(e) => setForm({ ...form, receiptFile: e.target.files[0] ?? null })} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        {!isAdd && (
          <button type="button" className="btn danger" disabled={saving} onClick={handleDelete}>
            삭제
          </button>
        )}
        <button type="button" className="btn primary" disabled={saving} onClick={handleSave}>
          {isAdd ? '추가' : '수정'}
        </button>
      </div>
    </Modal>
  )
}
