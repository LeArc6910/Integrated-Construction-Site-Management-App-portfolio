import { useEffect, useState } from 'react'
import { getAuthErrorMessage, MIN_PASSWORD_LENGTH, pingSync, updatePassword, updateProfile } from '../../api/auth'
import Modal from '../../components/Modal'
import { useAuth } from '../../hooks/useAuth'
import { getInstallPrompt, onInstallPromptChange, triggerInstallPrompt } from '../../lib/installPrompt'

const SYNC_STORAGE_KEY = 'lastSyncTime'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDateTime(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function installGuideText() {
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return isIOS
    ? '아이폰(Safari)에서는 하단 공유 버튼을 누른 뒤 "홈 화면에 추가"를 선택해주세요. 홈 화면에 추가해야 알림 같은 기능이 정상적으로 동작합니다.'
    : '안드로이드 Chrome에서는 아래 버튼을 누르거나, 브라우저 메뉴(⋮)에서 "설치 및 바로가기 만들기"를 선택해주세요. 이어서 뜨는 목록에서는 "바로가기 만들기"가 아니라 "설치"를 선택해야 앱처럼 동작합니다.'
}

export default function SettingsPage() {
  const { user, refreshProfile, logout } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', password: '', passwordConfirm: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [installPrompt, setInstallPrompt] = useState(() => getInstallPrompt())
  const [lastSync, setLastSync] = useState(() => {
    const stored = localStorage.getItem(SYNC_STORAGE_KEY)
    return stored ? new Date(stored) : null
  })
  const [syncing, setSyncing] = useState(false)

  useEffect(() => onInstallPromptChange(setInstallPrompt), [])

  function openEdit() {
    setForm({ name: user.name, phone: user.phone ?? '', password: '', passwordConfirm: '' })
    setError('')
    setEditing(true)
  }

  async function handleSaveProfile() {
    const name = form.name.trim()
    if (!name) {
      setError('이름을 입력해주세요.')
      return
    }
    if (form.password || form.passwordConfirm) {
      if (form.password.length < MIN_PASSWORD_LENGTH) {
        setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
        return
      }
      if (form.password !== form.passwordConfirm) {
        setError('새 비밀번호가 일치하지 않습니다.')
        return
      }
    }
    setError('')
    setSaving(true)
    try {
      await updateProfile({ userId: user.id, name, phone: form.phone.trim() })
      if (form.password) await updatePassword({ password: form.password })
      await refreshProfile()
      setEditing(false)
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleInstallClick() {
    await triggerInstallPrompt()
  }

  async function handleSync() {
    setSyncing(true)
    setError('')
    try {
      await pingSync()
      const now = new Date()
      localStorage.setItem(SYNC_STORAGE_KEY, now.toISOString())
      setLastSync(now)
    } catch (err) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <h2 className="page-title">설정</h2>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}

      <span className="section-label" style={{ marginTop: 0 }}>
        내 정보
      </span>
      <div className="metric-card settings-profile-card">
        <div className="label">이름</div>
        <div className="value">{user.name}</div>
        <div className="label" style={{ marginTop: 8 }}>
          연락처
        </div>
        <div className="value">{user.phone || '미등록'}</div>
        <div className="label" style={{ marginTop: 8 }}>
          소속 팀
        </div>
        <div className="value">{user.team_name || '-'}</div>
      </div>
      <button type="button" className="btn small" onClick={openEdit}>
        내 정보 수정
      </button>

      <span className="section-label">홈 화면에 추가하기</span>
      <p className="text-secondary settings-install-guide">{installGuideText()}</p>
      {installPrompt && (
        <button type="button" className="btn primary small" onClick={handleInstallClick}>
          지금 설치하기
        </button>
      )}

      <span className="section-label">동기화</span>
      <p className="text-secondary">
        마지막 동기화: <span className="mono">{lastSync ? formatDateTime(lastSync) : '-'}</span>
      </p>
      <button type="button" className="btn small" disabled={syncing} onClick={handleSync}>
        {syncing ? '동기화 중...' : '지금 동기화'}
      </button>

      <div className="settings-logout">
        <button type="button" className="btn danger" onClick={logout}>
          로그아웃
        </button>
      </div>

      <p className="settings-version">
        버전 <span className="mono">{__APP_VERSION__}</span>
      </p>

      {editing && (
        <Modal title="내 정보 수정" onClose={() => setEditing(false)}>
          <label>이름</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <label>연락처</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

          <label>새 비밀번호</label>
          <input
            type="password"
            placeholder="변경하지 않으려면 비워두세요"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />

          <label>새 비밀번호 확인</label>
          <input
            type="password"
            value={form.passwordConfirm}
            onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
          />

          <div className="modal-actions">
            <button type="button" className="btn primary" disabled={saving} onClick={handleSaveProfile}>
              저장
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
