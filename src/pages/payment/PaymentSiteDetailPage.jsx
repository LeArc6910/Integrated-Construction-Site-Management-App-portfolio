import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addSiteMember,
  addSiteReceipt,
  deleteSiteReceipt,
  fetchAllProfiles,
  fetchPaymentSiteDetail,
  removeSiteMember,
  updateContractAmount,
} from '../../api/payment'
import CalendarNav from '../../components/CalendarNav'
import Modal from '../../components/Modal'
import { formatDays, formatWon } from '../../lib/format'

export default function PaymentSiteDetailPage() {
  const { siteId } = useParams()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingContract, setEditingContract] = useState(false)
  const [contractInput, setContractInput] = useState('')
  const [addingReceipt, setAddingReceipt] = useState(false)
  const [receiptForm, setReceiptForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, amount: '' })
  const [profiles, setProfiles] = useState([])
  const [addingMember, setAddingMember] = useState(false)
  const [memberId, setMemberId] = useState('')

  const load = useCallback(
    () => fetchPaymentSiteDetail({ siteId, year, month }),
    [siteId, year, month]
  )

  useEffect(() => {
    let ignore = false
    load()
      .then((data) => !ignore && setDetail(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  useEffect(() => {
    fetchAllProfiles()
      .then(setProfiles)
      .catch((err) => setError(err.message))
  }, [])

  async function reload() {
    try {
      setDetail(await load())
    } catch (err) {
      setError(err.message)
    }
  }

  function handleCalChange({ year: y, month: m }) {
    setYear(y)
    setMonth(m)
  }

  function openContractModal() {
    setContractInput(String(detail.contractAmount))
    setEditingContract(true)
  }

  async function handleSaveContract() {
    setSaving(true)
    setError('')
    try {
      await updateContractAmount({ siteId, amount: parseInt(contractInput, 10) || 0 })
      setEditingContract(false)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddReceipt() {
    setSaving(true)
    setError('')
    try {
      await addSiteReceipt({
        siteId,
        year: receiptForm.year,
        month: receiptForm.month,
        amount: parseInt(receiptForm.amount, 10) || 0,
      })
      setAddingReceipt(false)
      setReceiptForm({ year: now.getFullYear(), month: now.getMonth() + 1, amount: '' })
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteReceipt(id) {
    setError('')
    try {
      await deleteSiteReceipt({ id })
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  function openMemberModal() {
    setMemberId(candidates[0]?.id ?? '')
    setAddingMember(true)
  }

  async function handleAddMember() {
    if (!memberId) return
    setSaving(true)
    setError('')
    try {
      await addSiteMember({ siteId, userId: memberId })
      setAddingMember(false)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveMember(userId) {
    setError('')
    try {
      await removeSiteMember({ siteId, userId })
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  // 이미 투입된 인원은 후보에서 뺀다 (site_members PK가 (site_id, user_id)라 중복 추가는 어차피 막힌다)
  const memberIds = new Set(detail?.labor.map((row) => row.userId))
  const candidates = profiles.filter((p) => !memberIds.has(p.id))

  return (
    <>
      <Link to="/payment/sites" className="back-btn">
        ← 목록으로
      </Link>
      <h2 className="page-title">{detail ? detail.name : '현장 결제 상세'}</h2>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      {detail && (
        <>
          <div className="card-grid">
            <div className="metric-card">
              <div className="label">
                계약 금액{' '}
                <button type="button" className="btn small" onClick={openContractModal}>
                  수정
                </button>
              </div>
              <div className="value">{formatWon(detail.contractAmount)}</div>
            </div>
            <div className="metric-card">
              <div className="label">남은 금액</div>
              <div className="value">{formatWon(detail.remaining)}</div>
            </div>
            <div className="metric-card">
              <div className="label">투입 인원</div>
              <div className="value">{detail.labor.length}명</div>
            </div>
          </div>

          <div className="section-header">
            <span className="section-label">월별 수령금액</span>
            <button type="button" className="btn small" onClick={() => setAddingReceipt(true)}>
              추가
            </button>
          </div>
          <div className="table">
            {detail.receipts.length === 0 && (
              <div className="row">
                <span className="text-secondary">등록된 수령 내역이 없습니다.</span>
              </div>
            )}
            {detail.receipts.map((receipt) => (
              <div key={receipt.id} className="row receipt-row">
                <span>
                  {receipt.year}년 {receipt.month}월
                </span>
                <span className="mono">{formatWon(receipt.amount)}</span>
                <button type="button" className="link-btn" onClick={() => handleDeleteReceipt(receipt.id)}>
                  삭제
                </button>
              </div>
            ))}
          </div>

          <div className="section-header">
            <span className="section-label">인건비</span>
            <button type="button" className="btn small" disabled={candidates.length === 0} onClick={openMemberModal}>
              투입인원 추가
            </button>
          </div>
          <CalendarNav year={year} month={month} onChange={handleCalChange} />
          <div className="table">
            <div className="row head pay-labor-row">
              <span>이름</span>
              <span>출근일수</span>
              <span>급여</span>
              <span>실급여</span>
              <span>차액</span>
              <span />
            </div>
            {detail.labor.length === 0 && (
              <div className="row">
                <span className="text-secondary">투입 인원이 없습니다.</span>
              </div>
            )}
            {detail.labor.map((row) => (
              <div key={row.userId} className="row pay-labor-row">
                <span>{row.name}</span>
                <span>{formatDays(row.days)}</span>
                <span className="mono">{formatWon(row.salary)}</span>
                <span className="mono">{formatWon(row.actual)}</span>
                <span className="mono">{formatWon(row.gap)}</span>
                <button type="button" className="link-btn" onClick={() => handleRemoveMember(row.userId)}>
                  제외
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {editingContract && (
        <Modal title="계약 금액 수정" onClose={() => setEditingContract(false)}>
          <label>계약 금액 (원)</label>
          <input
            type="number"
            value={contractInput}
            onChange={(e) => setContractInput(e.target.value)}
          />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setEditingContract(false)}>
              취소
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={handleSaveContract}>
              저장
            </button>
          </div>
        </Modal>
      )}

      {addingReceipt && (
        <Modal title="월별 수령금액 추가" onClose={() => setAddingReceipt(false)}>
          <label>연도</label>
          <input
            type="number"
            value={receiptForm.year}
            onChange={(e) => setReceiptForm({ ...receiptForm, year: Number(e.target.value) })}
          />
          <label>월</label>
          <input
            type="number"
            min="1"
            max="12"
            value={receiptForm.month}
            onChange={(e) => setReceiptForm({ ...receiptForm, month: Number(e.target.value) })}
          />
          <label>금액 (원)</label>
          <input
            type="number"
            value={receiptForm.amount}
            onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })}
          />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setAddingReceipt(false)}>
              취소
            </button>
            <button type="button" className="btn primary" disabled={saving} onClick={handleAddReceipt}>
              추가
            </button>
          </div>
        </Modal>
      )}

      {addingMember && (
        <Modal title="투입인원 추가" onClose={() => setAddingMember(false)}>
          <label>인원</label>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setAddingMember(false)}>
              취소
            </button>
            <button type="button" className="btn primary" disabled={saving || !memberId} onClick={handleAddMember}>
              추가
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
