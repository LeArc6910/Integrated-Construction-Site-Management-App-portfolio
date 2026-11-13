import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAuthErrorMessage, MIN_PASSWORD_LENGTH, updatePassword } from '../../api/auth'
import { useAuth } from '../../hooks/useAuth'

// 재설정 링크가 만료됐거나 이미 쓰였으면 Supabase가 주소 뒤(#)에 error_code를 붙여 보낸다
function readLinkError() {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return ''
  if (code === 'otp_expired') return '링크가 만료되었거나 이미 사용되었습니다. 재설정 메일을 다시 받아주세요.'
  return '링크를 확인하지 못했습니다. 재설정 메일을 다시 받아주세요.'
}

// 재설정 메일의 링크로 열리는 화면. 링크를 누르면 supabase-js가 주소의 로그인 정보로 그 계정에 로그인시키고,
// 여기서 새 비밀번호를 저장한다.
export default function ResetPasswordPage() {
  const { session } = useAuth()
  const [linkError] = useState(readLinkError)
  const [form, setForm] = useState({ password: '', passwordConfirm: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
      return
    }
    if (form.password !== form.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await updatePassword({ password: form.password })
      setDone(true)
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (session === undefined && !linkError) {
    return (
      <div className="auth-page">
        <p className="text-secondary">확인 중…</p>
      </div>
    )
  }

  if (linkError || !session) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1>비밀번호 재설정</h1>
          <p className="auth-message error" role="alert">
            {linkError || '로그인 정보가 없습니다. 메일의 링크를 다시 눌러주세요. 그래도 안 되면 재설정 메일을 다시 받아주세요.'}
          </p>
          <Link to="/forgot-password" className="btn primary block">
            재설정 메일 다시 받기
          </Link>
          <Link to="/login" className="btn block">
            로그인으로
          </Link>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          <h1>비밀번호를 바꿨습니다</h1>
          <p className="auth-message notice">다음부터는 새 비밀번호로 로그인하세요.</p>
          <Link to="/" replace className="btn primary block">
            앱으로 가기
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-box" onSubmit={handleSubmit}>
        <h1>새 비밀번호 설정</h1>
        <p className="auth-hint">ID: {session.user.email}</p>

        {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알 수 있게 ID를 숨겨서 함께 둔다 */}
        <input type="email" autoComplete="username" value={session.user.email ?? ''} readOnly hidden />
        <input
          type="password"
          placeholder={`새 비밀번호 (${MIN_PASSWORD_LENGTH}자 이상)`}
          aria-label="새 비밀번호"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <input
          type="password"
          placeholder="새 비밀번호 확인"
          aria-label="새 비밀번호 확인"
          autoComplete="new-password"
          value={form.passwordConfirm}
          onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
          required
        />

        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary block" disabled={submitting}>
          {submitting ? '저장 중…' : '새 비밀번호 저장'}
        </button>
      </form>
    </div>
  )
}
