import { useCallback, useEffect, useState } from 'react'
import { IconSpeakerphone, IconX } from '@tabler/icons-react'
import { fetchTeamNotice, NOTICE_CHANGED_EVENT } from '../../api/notices'

// 닫은 공지는 이 기기에서 앱을 끄기 전까지만 숨긴다(sessionStorage). 앱을 다시 켜면 또 뜬다.
// 팀장이 내용을 고쳐 다시 게시하면 게시 시각이 바뀌므로 닫아 둔 상태여도 새 공지로 다시 뜬다.
const DISMISS_KEY = 'dismissed-team-notice'

function noticeVersion(notice) {
  return `${notice.team_id}:${notice.updated_at}`
}

function loadDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

function saveDismissed(version) {
  try {
    sessionStorage.setItem(DISMISS_KEY, version)
  } catch {
    // 저장이 막힌 환경이면 이번 화면에서만 닫힌다
  }
}

export default function NoticeBanner() {
  const [notice, setNotice] = useState(null)
  const [dismissed, setDismissed] = useState(loadDismissed)

  // 오프라인 등으로 못 받으면 보이던 공지를 그대로 둔다
  const load = useCallback(() => {
    fetchTeamNotice()
      .then(setNotice)
      .catch(() => {})
  }, [])

  // 앱을 열 때, 다른 앱에 갔다가 돌아올 때, 연결이 돌아올 때, 팀장 메뉴에서 공지를 바꿨을 때 다시 받는다
  useEffect(() => {
    load()
    function handleVisible() {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('online', load)
    window.addEventListener(NOTICE_CHANGED_EVENT, load)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('online', load)
      window.removeEventListener(NOTICE_CHANGED_EVENT, load)
    }
  }, [load])

  if (!notice || dismissed === noticeVersion(notice)) return null

  function handleClose() {
    const version = noticeVersion(notice)
    saveDismissed(version)
    setDismissed(version)
  }

  return (
    <div className="notice-banner" role="status">
      <IconSpeakerphone size={16} stroke={1.75} className="notice-banner-icon" aria-hidden="true" />
      <p className="notice-banner-body">{notice.body}</p>
      <button type="button" className="notice-banner-close" onClick={handleClose} aria-label="공지 닫기">
        <IconX size={16} stroke={1.75} />
      </button>
    </div>
  )
}
