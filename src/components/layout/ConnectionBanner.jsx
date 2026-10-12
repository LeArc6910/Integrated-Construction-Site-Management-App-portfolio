import { useEffect, useState } from 'react'
import { subscribeCacheStatus } from '../../lib/cachedCall'
import { pendingWriteCount, QUEUE_CHANGED } from '../../lib/offlineQueue'

function pad2(n) {
  return String(n).padStart(2, '0')
}

// '10/12 14:05' — 오늘이면 시각만
function formatSince(iso) {
  const d = new Date(iso)
  const now = new Date()
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  return sameDay ? time : `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

// 연결 상태 알림. 화면에 저장해 둔 내용을 보여주고 있는지, 최신 내용이 뒤늦게 도착했는지,
// 아직 서버로 못 보낸 기록이 몇 건인지를 모든 화면 맨 위에 알려준다.
// onRefresh: 지금 화면을 다시 불러온다(AppLayout이 화면을 새로 그린다).
export default function ConnectionBanner({ onRefresh }) {
  const [status, setStatus] = useState({ staleSince: null, freshArrived: false })
  const [pending, setPending] = useState(0)

  useEffect(() => subscribeCacheStatus(setStatus), [])

  useEffect(() => {
    let ignore = false
    const update = () => pendingWriteCount().then((count) => !ignore && setPending(count))
    update()
    window.addEventListener(QUEUE_CHANGED, update)
    return () => {
      ignore = true
      window.removeEventListener(QUEUE_CHANGED, update)
    }
  }, [])

  if (!status.staleSince && !status.freshArrived && pending === 0) return null

  return (
    <div className="connection-banner" role="status">
      {status.freshArrived ? (
        <p>
          <span>연결이 돌아왔습니다. 화면을 최신 내용으로 바꿀 수 있습니다.</span>
          <button type="button" className="btn small" onClick={onRefresh}>
            반영
          </button>
        </p>
      ) : (
        status.staleSince && (
          <p>
            <span>
              연결이 원활하지 않아 저장해 둔 내용을 보여주고 있습니다 · 마지막 업데이트 {formatSince(status.staleSince)}
            </span>
            <button type="button" className="btn small" onClick={onRefresh}>
              다시 시도
            </button>
          </p>
        )
      )}
      {pending > 0 && (
        <p>
          <span>아직 보내지 못한 기록 {pending}건 · 연결되면 자동으로 전송됩니다.</span>
        </p>
      )}
    </div>
  )
}
