import { useEffect, useState } from 'react'
import { DEFAULT_TAX, fetchTaxSettingList, updateSiteTax } from '../../api/salaryTax'
import Modal from '../../components/Modal'

// 실급여 입력값에서 몇 %가 빠진 것으로 볼지 현장별로 정한다.
// 그 현장에서 그 달에 일한 출근일수가 기준 이하면 낮은 %, 초과하면 높은 %가 적용된다.
export default function SalaryTaxModal({ onClose, onSaved }) {
  const [rows, setRows] = useState(null) // null: 불러오는 중
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    fetchTaxSettingList()
      .then((data) => !ignore && setRows(data))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [])

  // 입력 중에는 글자 그대로 들고 있다가 저장할 때 숫자로 바꾼다(지우고 다시 쓰는 중간 상태 허용)
  function change(siteId, field, value) {
    setRows((prev) => prev.map((row) => (row.id === siteId ? { ...row, [field]: value } : row)))
  }

  function resetRow(siteId) {
    setRows((prev) => prev.map((row) => (row.id === siteId ? { ...row, ...DEFAULT_TAX } : row)))
  }

  async function handleSave() {
    const invalid = rows.find(
      (row) =>
        !Number.isFinite(Number(row.dayThreshold)) ||
        Number(row.dayThreshold) < 0 ||
        !Number.isFinite(Number(row.lowPercent)) ||
        !Number.isFinite(Number(row.highPercent)) ||
        Number(row.lowPercent) < 0 ||
        Number(row.lowPercent) >= 100 ||
        Number(row.highPercent) < 0 ||
        Number(row.highPercent) >= 100
    )
    if (invalid) {
      setError(`${invalid.name}: 기준 일수는 0 이상, 제외 %는 0 이상 100 미만으로 입력하세요.`)
      return
    }

    setSaving(true)
    setError('')
    try {
      for (const row of rows) {
        await updateSiteTax({
          siteId: row.id,
          dayThreshold: Number(row.dayThreshold),
          lowPercent: Number(row.lowPercent),
          highPercent: Number(row.highPercent),
        })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="급여 세금 설정" wide onClose={onClose}>
      <p className="text-secondary tax-modal-hint">
        실급여로 입력한 금액에서 몇 %가 빠진 것으로 볼지 현장별로 정합니다. 그 현장에서 그 달에 일한 출근일수가 기준
        일수 <b>이하</b>면 낮은 %, <b>초과</b>면 높은 %로 제외 전 금액을 되돌려 차액을 계산합니다.
      </p>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      {rows === null && !error && <p className="text-secondary">불러오는 중…</p>}
      {rows?.length === 0 && <p className="text-secondary">등록된 현장이 없습니다.</p>}

      {rows?.length > 0 && (
        <div className="tax-table">
          {rows.map((row) => (
            <div key={row.id} className="tax-row">
              <div className="tax-row-head">
                <span>{row.name}</span>
                <button type="button" className="link-btn" onClick={() => resetRow(row.id)}>
                  기본값
                </button>
              </div>
              <div className="tax-fields">
                <label className="tax-field">
                  기준 일수
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={row.dayThreshold}
                    onChange={(e) => change(row.id, 'dayThreshold', e.target.value)}
                  />
                </label>
                <label className="tax-field">
                  이하 %
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={row.lowPercent}
                    onChange={(e) => change(row.id, 'lowPercent', e.target.value)}
                  />
                </label>
                <label className="tax-field">
                  초과 %
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={row.highPercent}
                    onChange={(e) => change(row.id, 'highPercent', e.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button type="button" className="btn primary" disabled={saving || !rows?.length} onClick={handleSave}>
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </Modal>
  )
}
