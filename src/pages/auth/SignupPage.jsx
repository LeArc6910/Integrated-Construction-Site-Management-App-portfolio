import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { getAuthErrorMessage, MIN_PASSWORD_LENGTH, signUp } from '../../api/auth'
import { listTeams } from '../../api/teams'
import { useAuth } from '../../hooks/useAuth'

const INITIAL_FORM = { name: '', teamId: '', email: '', password: '', passwordConfirm: '' }

function validate(form) {
  if (!form.name.trim()) return '이름을 입력해주세요.'
  if (!form.teamId) return '소속 팀을 선택해주세요.'
  if (form.password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`
  if (form.password !== form.passwordConfirm) return '비밀번호가 일치하지 않습니다.'
  return ''
}

export default function SignupPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [teams, setTeams] = useState([])

  // 팀이 하나뿐이면 고를 필요 없이 그 팀으로 채워둔다
  useEffect(() => {
    listTeams()
      .then((rows) => {
        setTeams(rows)
        if (rows.length === 1) setForm((prev) => ({ ...prev, teamId: String(rows[0].id) }))
      })
      .catch(() => setError('팀 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'))
  }, [])

  // 이메일 인증이 꺼져 있으면 가입과 동시에 로그인되어 바로 앱으로 이동한다
  if (session) return <Navigate to="/" replace />

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    const message = validate(form)
    setError(message)
    if (message) return

    setSubmitting(true)
    try {
      const { session: newSession } = await signUp({
        name: form.name.trim(),
        teamId: Number(form.teamId),
        email: form.email.trim(),
        password: form.password,
      })
      if (!newSession) {
        navigate('/login', {
          replace: true,
          state: { notice: '가입이 완료되었습니다. 이메일 인증 후 로그인해주세요.' },
        })
      }
    } catch (err) {
      setError(getAuthErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-box" onSubmit={handleSubmit}>
        <h1>회원가입</h1>

        <input
          type="text"
          placeholder="이름"
          aria-label="이름"
          autoComplete="name"
          value={form.name}
          onChange={update('name')}
          required
        />
        <select className="auth-select" aria-label="소속 팀" value={form.teamId} onChange={update('teamId')} required>
          <option value="">소속 팀 선택</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <p className="auth-hint">팀끼리는 현장·출근·급여 등 모든 기록이 서로 보이지 않습니다. 가입 후에는 직접 바꿀 수 없습니다.</p>
        <input
          type="email"
          placeholder="ID (이메일)"
          aria-label="ID (이메일)"
          autoComplete="username"
          value={form.email}
          onChange={update('email')}
          required
        />
        <input
          type="password"
          placeholder={`비밀번호 (${MIN_PASSWORD_LENGTH}자 이상)`}
          aria-label="비밀번호"
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          required
        />
        <input
          type="password"
          placeholder="비밀번호 확인"
          aria-label="비밀번호 확인"
          autoComplete="new-password"
          value={form.passwordConfirm}
          onChange={update('passwordConfirm')}
          required
        />

        {error && (
          <p className="auth-message error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn primary block" disabled={submitting}>
          {submitting ? '가입 중…' : '가입하기'}
        </button>
        <Link to="/login" className="btn block">
          로그인으로
        </Link>
      </form>
    </div>
  )
}
