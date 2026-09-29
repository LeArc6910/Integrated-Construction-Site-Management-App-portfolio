import { useEffect, useState } from 'react'
import { clearTeamNotice, fetchTeamNotice, notifyNoticeChanged, saveTeamNotice } from '../../api/notices'
import { fetchUserNames } from '../../api/unitSheet'
import AutoGrowTextarea from '../../components/AutoGrowTextarea'
import { useAuth } from '../../hooks/useAuth'

// DB 함수(set_team_notice)의 글자 수 제한과 같게 맞춘다
const MAX_NOTICE_LENGTH = 500

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatPostedAt(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function NoticeSection() {
  const { user } = useAuth()
  const [notice, setNotice] = useState(null)
  const [names, setNames] = useState({})
  const [draft, setDraft] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false
    Promise.all([fetchTeamNotice(), fetchUserNames()])
      .then(([row, nameMap]) => {
        if (ignore) return
        setNotice(row)
        setNames(nameMap)
        setDraft(row?.body ?? '')
        setLoaded(true)
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [])

  async function reload() {
    const row = await fetchTeamNotice()
    setNotice(row)
    setDraft(row?.body ?? '')
    notifyNoticeChanged()
  }

  async function handlePost() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await saveTeamNotice({ body: draft.trim() })
      await reload()
      setMessage(notice ? '공지를 수정했습니다. 닫아 두었던 사람에게도 다시 보입니다.' : '공지를 올렸습니다.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleClear() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await clearTeamNotice()
      await reload()
      setMessage('공지를 내렸습니다.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const trimmed = draft.trim()
  const tooLong = trimmed.length > MAX_NOTICE_LENGTH
  const unchanged = notice !== null && trimmed === notice.body

  return (
    <>
      <span className="section-label" style={{ marginTop: 0 }}>
        공지
      </span>
      <p className="text-secondary dev-help">
        <b>{user.current_team_name}</b> 팀 모두에게 모든 화면 맨 위에 보입니다. 각자 닫을 수 있고, 앱을 다시 켜면 다시
        보입니다. 공지는 하나만 걸리며 새로 올리면 이전 공지를 바꿉니다.
      </p>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="auth-message notice">{message}</p>}

      {loaded &&
        (notice ? (
          <div className="leader-notice-current">
            <p className="leader-notice-body">{notice.body}</p>
            <span className="text-secondary leader-notice-meta">
              게시 중 · {formatPostedAt(notice.updated_at)}
              {names[notice.updated_by] ? ` · ${names[notice.updated_by]}` : ''}
            </span>
          </div>
        ) : (
          <p className="text-secondary">지금 걸려 있는 공지가 없습니다.</p>
        ))}

      <div className="leader-notice-form">
        <AutoGrowTextarea
          value={draft}
          placeholder="공지 내용을 입력하세요"
          aria-label="공지 내용"
          disabled={!loaded || busy}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="leader-notice-form-foot">
          <span className={`text-secondary leader-notice-count${tooLong ? ' over' : ''}`}>
            {trimmed.length} / {MAX_NOTICE_LENGTH}자
          </span>
          {notice && (
            <button type="button" className="btn small danger" disabled={busy} onClick={handleClear}>
              공지 내리기
            </button>
          )}
          <button
            type="button"
            className="btn small primary"
            disabled={!loaded || busy || !trimmed || tooLong || unchanged}
            onClick={handlePost}
          >
            {notice ? '공지 수정' : '공지 올리기'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function LeaderPage() {
  return (
    <div>
      <h2 className="page-title">팀장 메뉴</h2>
      <NoticeSection />
    </div>
  )
}
