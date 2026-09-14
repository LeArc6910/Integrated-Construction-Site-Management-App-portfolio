import { useCallback, useEffect, useState } from 'react'
import { IconPaperclip } from '@tabler/icons-react'
import {
  addExpense,
  deleteExpense,
  deleteReceipt,
  fetchMonthExpenses,
  getReceiptUrl,
  updateExpense,
  uploadReceipt,
} from '../../api/expense'
import CalendarNav from '../../components/CalendarNav'
import Modal from '../../components/Modal'
import { useAuth } from '../../hooks/useAuth'
import { usePeriod } from '../../hooks/usePeriod'
import { enqueueWrite } from '../../lib/offlineQueue'

const ROW_COLUMNS = '0.9fr 1fr 1.3fr 0.9fr 0.9fr'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function won(amount) {
  return `₩${amount.toLocaleString()}`
}

const EMPTY_FORM = { date: todayStr(), place: '', content: '', amount: '', receiptFile: null }

export default function ExpenseTab() {
  const { user } = useAuth()
  const { year, month, setPeriod } = usePeriod()
  const [expenses, setExpenses] = useState([])
  const [modalMode, setModalMode] = useState(null) // null | 'add' | expense 객체(수정 중)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadMonth = useCallback(
    () => fetchMonthExpenses({ userId: user.id, year, month }),
    [user.id, year, month]
  )

  useEffect(() => {
    let ignore = false
    loadMonth()
      .then((rows) => !ignore && setExpenses(rows))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [loadMonth])

  const reload = useCallback(async () => {
    try {
      setExpenses(await loadMonth())
    } catch (err) {
      setError(err.message)
    }
  }, [loadMonth])

  // 오프라인 큐에 쌓아둔 지출 기록이 서버로 전송되면 목록을 최신 상태로 다시 받아온다
  useEffect(() => {
    function handleFlushed() {
      reload()
    }
    window.addEventListener('offline-queue-flushed', handleFlushed)
    return () => window.removeEventListener('offline-queue-flushed', handleFlushed)
  }, [reload])

  function handleCalChange({ year: y, month: m }) {
    setPeriod(y, m)
  }

  function openAdd() {
    setForm(EMPTY_FORM)
    setModalMode('add')
    setNotice('')
  }

  function openEdit(expense) {
    setForm({
      date: expense.date,
      place: expense.place ?? '',
      content: expense.content ?? '',
      amount: String(expense.amount),
      receiptFile: null,
    })
    setModalMode(expense)
  }

  function closeModal() {
    setModalMode(null)
    setError('')
  }

  async function handleViewReceipt(path) {
    try {
      window.open(await getReceiptUrl(path), '_blank', 'noopener')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const amount = parseInt(form.amount, 10) || 0

      // 오프라인이면 영수증 파일(있다면)까지 통째로 큐에 담아두고, 온라인이 되면
      // offlineQueue가 영수증 업로드 → 지출 저장 순서로 대신 처리한다.
      if (modalMode === 'add' && !navigator.onLine) {
        await enqueueWrite('expense', {
          userId: user.id,
          date: form.date,
          place: form.place,
          content: form.content,
          amount,
          receiptFile: form.receiptFile,
          clientId: crypto.randomUUID(),
        })
        closeModal()
        setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
        return
      }

      const receiptPath = form.receiptFile
        ? await uploadReceipt({ userId: user.id, file: form.receiptFile })
        : (modalMode !== 'add' && modalMode.receiptPath) || null

      const payload = {
        date: form.date,
        place: form.place,
        content: form.content,
        amount,
        receiptPath,
      }

      if (modalMode === 'add') {
        await addExpense({ userId: user.id, ...payload, clientId: crypto.randomUUID() })
      } else {
        await updateExpense({ id: modalMode.id, ...payload })
        if (form.receiptFile && modalMode.receiptPath) await deleteReceipt(modalMode.receiptPath)
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
      await deleteExpense({ id: modalMode.id, receiptPath: modalMode.receiptPath })
      closeModal()
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div>
      <CalendarNav year={year} month={month} onChange={handleCalChange} />

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="auth-message notice">{notice}</p>}

      <div className="table">
        <div className="row head" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>날짜</span>
          <span>장소</span>
          <span>지출 내용</span>
          <span>금액</span>
          <span>영수증</span>
        </div>
        {expenses.length === 0 && (
          <div className="row">
            <span className="text-secondary">해당 월 지출 내역 없음</span>
          </div>
        )}
        {expenses.map((e) => (
          <div
            key={e.id}
            className="row clickable"
            style={{ gridTemplateColumns: ROW_COLUMNS }}
            onClick={() => openEdit(e)}
          >
            <span>{e.date}</span>
            <span>{e.place}</span>
            <span>{e.content}</span>
            <span className="mono">{won(e.amount)}</span>
            <span>
              {e.receiptPath ? (
                <>
                  <IconPaperclip size={14} stroke={1.75} /> 첨부됨
                </>
              ) : (
                '-'
              )}
            </span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 10, fontSize: 13 }}>
        합계: <span className="mono">{won(total)}</span>
      </p>
      <button type="button" className="btn primary" onClick={openAdd}>
        추가
      </button>

      {modalMode && (
        <Modal title={modalMode === 'add' ? '지출 추가' : '지출 수정'} onClose={closeModal}>
          <label>날짜</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />

          <label>장소</label>
          <input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} />

          <label>지출 내용</label>
          <input value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />

          <label>금액</label>
          <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />

          <label>
            {modalMode !== 'add' && (
              <>
                기존:{' '}
                {modalMode.receiptPath ? (
                  <button type="button" className="link-btn" onClick={() => handleViewReceipt(modalMode.receiptPath)}>
                    보기
                  </button>
                ) : (
                  '없음'
                )}{' '}
              </>
            )}
            영수증 이미지 {modalMode === 'add' ? '첨부' : '재첨부'}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setForm({ ...form, receiptFile: e.target.files[0] ?? null })}
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
