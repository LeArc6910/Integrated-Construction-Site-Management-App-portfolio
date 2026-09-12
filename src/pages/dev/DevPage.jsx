import { useState } from 'react'
import { generateTestData, resetTestData } from '../../api/dev'
import { useAuth } from '../../hooks/useAuth'

export default function DevPage() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleGenerate() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await generateTestData()
      setMessage('임시 데이터를 생성했습니다. 현장관리 메뉴에서 확인할 수 있습니다.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await resetTestData()
      setMessage('임시 데이터를 초기화했습니다.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="page-title">개발자 페이지</h2>

      {user.is_test_account ? (
        <>
          <span className="section-label" style={{ marginTop: 0 }}>
            테스트 데이터
          </span>
          <p className="text-secondary" style={{ marginBottom: 8 }}>
            세대표·미타공이 있는 임시 현장 하나를 만들거나 지웁니다. is_test_data로 표시된 현장만 대상이라 실제
            현장에는 영향을 주지 않습니다.
          </p>

          {error && (
            <p className="auth-message error" role="alert">
              {error}
            </p>
          )}
          {message && <p className="text-secondary">{message}</p>}

          <div className="dev-actions">
            <button type="button" className="btn" disabled={busy} onClick={handleGenerate}>
              임시 데이터 생성
            </button>
            <button type="button" className="btn danger" disabled={busy} onClick={handleReset}>
              임시 데이터 초기화
            </button>
          </div>
        </>
      ) : (
        <p className="text-secondary">테스트 계정으로 로그인해야 임시 데이터 기능을 사용할 수 있습니다.</p>
      )}
    </div>
  )
}
