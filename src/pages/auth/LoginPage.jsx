import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { getAuthErrorMessage, signIn } from '../../api/auth'
import { useAuth } from '../../hooks/useAuth'
import { getAutoLogin, setAutoLogin } from '../../lib/supabase'

export default function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [autoLogin, setAutoLoginChecked] = useState(getAutoLogin)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 로그인 성공 시 onAuthStateChange로 세션이 들어오면서 여기서 원래 가려던 페이지로 이동한다
  if (session) return <Navigate to={location.state?.from ?? '/'} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      setAutoLogin(autoLogin)
      await signIn({ email: email.trim(), password })
    } catch (err) {
      setError(getAuthErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-box" onSubmit={handleSubmit}>
        <h1>현장 관리 어플 로그인</h1>

        {location.state?.notice && <p className="auth-message notice">{location.state.notice}</p>}

        <input
          type="email"
          placeholder="ID (이메일)"
          aria-label="ID (이메일)"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          aria-label="비밀번호"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <label className="auth-check">
          <input type="checkbox" checked={autoLogin} onChange={(e) => setAutoLoginChecked(e.target.checked)} />
          자동 로그인
        </label>

        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary block" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>
        <Link to="/signup" className="btn block">
          회원가입
        </Link>
      </form>
    </div>
  )
}
