import { useCallback, useEffect, useState } from 'react'
import { IconPaperclip } from '@tabler/icons-react'
import { deleteReceipt, getReceiptUrl, uploadReceipt } from '../../api/expense'
import { addSalaryEntry, deleteSalaryEntry, fetchMonthSalaryEntries, updateSalaryEntry } from '../../api/salary'
import { fetchSites } from '../../api/sites'
import CalendarNav from '../../components/CalendarNav'
import Modal from '../../components/Modal'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { formatWon } from '../../lib/format'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function SalaryTab() {
  const { user } = useAuth()
  const { year, month, setPeriod } = usePeriod()
  const [entries, setEntries] = useState([])
  const [sites, setSites] = useState([])
  const [modalMode, setModalMode] = useState(null) // null | 'add' | 수정 중인 항목
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 현장관리 목록의 현장(진행중·완료 모두). 삭제(보관)된 현장은 고를 수 없다.
  useEffect(() => {
    fetchSites()
      .then(setSites)
      .catch((err) => setError(err.message))
  }, [])

  const loadMonth = useCallback(
    () => fetchMonthSalaryEntries({ userId: user.id, year, month }),
    [user.id, year, month]
  )

  useEffect(() => {
    let ignore = false
    loadMonth()
      .then((rows) => !ignore && setEntries(rows))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadMonth])

  async function reload() {
    try {
      setEntries(await loadMonth())
    } catch (err) {
      setError(err.message)
    }
  }

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  function openAdd() {
    setError('')
    setForm({ year, month, siteId: sites[0]?.id ?? '', amount: '', receiptFile: null })
    setModalMode('add')
  }

  function openEdit(entry) {
    setError('')
    setForm({
      year: entry.year,
      month: entry.month,
      siteId: entry.siteId ?? '',
      amount: String(entry.amount),
      receiptFile: null,
    })
    setModalMode(entry)
  }

  function closeModal() {
    setModalMode(null)
    setForm(null)
  }

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
      const isAdd = modalMode === 'add'
      const receiptPath = form.receiptFile
        ? await uploadReceipt({ userId: user.id, file: form.receiptFile })
        : (!isAdd && modalMode.receiptPath) || null

      const payload = { siteId: Number(form.siteId), year: form.year, month: form.month, amount, receiptPath }
      if (isAdd) {
        await addSalaryEntry({ userId: user.id, ...payload, clientId: crypto.randomUUID() })
      } else {
        await updateSalaryEntry({ id: modalMode.id, ...payload })
        if (form.receiptFile && modalMode.receiptPath) await deleteReceipt(modalMode.receiptPath)
      }

      // 다른 달로 입력했으면 그 달 화면으로 옮겨가서 방금 넣은 내역이 바로 보이게 한다
      if (form.year !== year || form.month !== month) setPeriod(form.year, form.month)
      closeModal()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await deleteSalaryEntry({ id: modalMode.id, receiptPath: modalMode.receiptPath })
      closeModal()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const total = entries.reduce((sum, entry) => sum + entry.amount, 0)
  const formYears = form ? [form.year - 1, form.year, form.year + 1] : []

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && !modalMode && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <div className="card-grid">
        <div className="metric-card">
          <div className="label">
            {year}년 {month}월 일한 급여 합계
          </div>
          <div className="value">{formatWon(total)}</div>
        </div>
        <div className="metric-card">
          <div className="label">입력 건수</div>
          <div className="value">{entries.length}건</div>
        </div>
      </div>
      <p className="text-secondary salary-period-note">
        일한 달 기준입니다. 이 합계가 인건비·대시보드의 <b>실급여</b>로 쓰입니다.
      </p>

      <div className="table">
        <div className="row head salary-entry-row">
          <span>현장</span>
          <span>수령 급여</span>
          <span>증빙</span>
        </div>
        {entries.length === 0 && (
          <div className="row">
            <span className="text-secondary">해당 월 입력한 급여가 없습니다.</span>
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="row clickable salary-entry-row" onClick={() => openEdit(entry)}>
            <span>{entry.siteName ?? '현장 미지정(이전 입력)'}</span>
            <span className="mono">{formatWon(entry.amount)}</span>
            <span>
              {entry.receiptPath ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewReceipt(entry.receiptPath)
                  }}
                >
                  <IconPaperclip size={14} stroke={1.75} /> 보기
                </button>
              ) : (
                '-'
              )}
            </span>
          </div>
        ))}
      </div>

      <button type="button" className="btn primary" onClick={openAdd}>
        급여 추가
      </button>

      {modalMode && form && (
        <Modal title={modalMode === 'add' ? '수령 급여 추가' : '수령 급여 수정'} onClose={closeModal}>
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
            증빙 사진 {modalMode === 'add' ? '첨부' : '재첨부'}
            {modalMode !== 'add' && modalMode.receiptPath && (
              <>
                {' '}
                (기존:{' '}
                <button type="button" className="link-btn" onClick={() => handleViewReceipt(modalMode.receiptPath)}>
                  보기
                </button>
                )
              </>
            )}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setForm({ ...form, receiptFile: e.target.files[0] ?? null })}
          />

          {error && (
            <p className="auth-message error" role="alert">
              {error}
            </p>
          )}

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
