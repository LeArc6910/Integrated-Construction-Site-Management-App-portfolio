import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getAuthErrorMessage, sendPasswordResetEmail } from '../../api/auth'

export default function ForgotPasswordPage() {
  const location = useLocation()
  // 로그인 화면에서 입력하던 ID를 그대로 채워둔다
  const [email, setEmail] = useState(location.state?.email ?? '')
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const trimmed = email.trim()
      await sendPasswordResetEmail({ email: trimmed })
      setSentTo(trimmed)
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1>메일을 보냈습니다</h1>
          <p className="auth-message notice">
            {sentTo}(으)로 비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 누르면 새 비밀번호를 정할 수 있습니다.
          </p>
          <p className="auth-hint">
            몇 분이 지나도 메일이 없으면 스팸함을 확인해주세요. 가입할 때 쓴 ID(이메일)가 아니면 메일이 가지 않습니다.
          </p>
          <button type="button" className="btn block" onClick={() => setSentTo('')}>
            다시 보내기
          </button>
          <Link to="/login" className="btn primary block">
            로그인으로
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-box" onSubmit={handleSubmit}>
        <h1>비밀번호 찾기</h1>
        <p className="auth-hint">가입할 때 쓴 ID(이메일)를 입력하면 새 비밀번호를 정할 수 있는 링크를 메일로 보내드립니다.</p>

        <input
          type="email"
          placeholder="ID (이메일)"
          aria-label="ID (이메일)"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary block" disabled={submitting}>
          {submitting ? '보내는 중…' : '재설정 메일 보내기'}
        </button>
        <Link to="/login" className="btn block">
          로그인으로
        </Link>
      </form>
    </div>
  )
}
