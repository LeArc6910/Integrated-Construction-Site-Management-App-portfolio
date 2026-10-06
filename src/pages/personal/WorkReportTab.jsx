import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadSiteSheet } from '../../api/unitSheet'
import { buildReportText, checksAsOf, fetchTodayWork, highlightKeysOf } from '../../api/workReport'
import AutoGrowTextarea from '../../components/AutoGrowTextarea'
import { useAuth } from '../../hooks/useAuth'
import {
  canShareFile,
  canvasToFile,
  renderUnitSheetImage,
  saveImageFile,
  sheetImageFileName,
  todayString,
} from '../../lib/unitSheetImage'

// 클립보드 API가 막힌 환경(오래된 브라우저 등)에서는 예전 방식으로 복사한다
function legacyCopy(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok
}

// 'YYYY-MM-DD' → 그 날 0시(기기 시간)
function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 'YYYY-MM-DD' → '9/28(일)'
function shortDate(value) {
  const date = parseDate(value)
  return `${date.getMonth() + 1}/${date.getDate()}(${'일월화수목금토'[date.getDay()]})`
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {
      if (!legacyCopy(text)) throw new Error('copy failed')
    })
  }
  return legacyCopy(text) ? Promise.resolve() : Promise.reject(new Error('copy failed'))
}

export default function WorkReportTab() {
  const { user } = useAuth()
  // 메뉴에 들어올 때마다 항상 오늘로 시작한다(기기에 기억하지 않는다). 오늘 작업을 다른 날짜로
  // 잘못 보고하는 일을 막기 위해서다. 지난 날짜는 볼 수도, 보낼 수도 있다.
  const today = todayString()
  const [date, setDate] = useState(today)
  const isToday = date === today
  const reportDate = useMemo(() => parseDate(date), [date])
  const [sites, setSites] = useState(null) // null: 불러오는 중
  const [siteId, setSiteId] = useState(null)
  const [sheets, setSheets] = useState({}) // { [siteId]: 세대표 데이터 }
  const [texts, setTexts] = useState({}) // { ['날짜:현장']: 사용자가 고친 보고 문구 }
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => fetchTodayWork({ userId: user.id, date: reportDate }), [user.id, reportDate])

  useEffect(() => {
    let ignore = false
    load()
      .then((rows) => {
        if (ignore) return
        setSites(rows)
        // 날짜를 바꾸면 그 날 작업한 현장이 달라질 수 있어, 고른 현장이 없으면 첫 현장으로 돌린다
        setSiteId((prev) => (rows.some((row) => row.siteId === prev) ? prev : (rows[0]?.siteId ?? null)))
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  const site = sites?.find((s) => s.siteId === siteId) ?? null

  useEffect(() => {
    if (!siteId || sheets[siteId]) return
    let ignore = false
    loadSiteSheet({ siteId })
      .then((data) => !ignore && setSheets((prev) => ({ ...prev, [siteId]: data })))
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [siteId, sheets])

  const sheet = siteId ? sheets[siteId] : null
  const textKey = `${date}:${siteId}`
  const autoText = site ? buildReportText({ site, userName: user.name, buildings: sheet?.buildings, date: reportDate }) : ''
  const text = siteId && texts[textKey] !== undefined ? texts[textKey] : autoText

  // 미리보기와 보낼 파일을 세대표를 받아온 시점에 미리 만들어 둔다. 보내기 버튼을 누른 뒤에
  // 이미지를 그리면 그 사이 iOS가 공유 창 호출을 막을 수 있다.
  // 그날 작업한 세대의 빨간 테두리는 보내는 이미지에도 그대로 들어간다(같은 캔버스를 쓴다).
  // 지난 날짜는 그 날이 끝난 시점까지 체크된 칸만 칠해 그날 보고와 같은 모습으로 만든다.
  const images = useMemo(() => {
    if (!site || !sheet) return null
    try {
      const title = site.siteName
      const canvas = renderUnitSheetImage({
        title,
        buildings: sheet.buildings,
        checks: isToday ? sheet.checks : checksAsOf(sheet.checks, reportDate),
        highlightKeys: highlightKeysOf(site),
        crc: site.crc,
        date: reportDate,
      })
      return {
        preview: canvas.toDataURL('image/png'),
        previewWidth: canvas.logicalWidth,
        file: canvasToFile(canvas, sheetImageFileName(title, reportDate)),
        error: null,
      }
    } catch (err) {
      return { preview: null, previewWidth: 0, file: null, error: err.message }
    }
  }, [site, sheet, isToday, reportDate])

  function handleTextChange(value) {
    setTexts((prev) => ({ ...prev, [textKey]: value }))
  }

  function handleResetText() {
    setTexts((prev) => {
      const next = { ...prev }
      delete next[textKey]
      return next
    })
  }

  function changeDate(value) {
    // 날짜 칸을 비우거나 미래 날짜를 넣으면 오늘로 둔다
    const next = value && value <= today ? value : today
    if (next === date) return
    setDate(next)
    setSites(null)
    setError('')
    setNotice('')
  }

  function handleCopyOnly() {
    setError('')
    copyText(text)
      .then(() => setNotice('작업 내용을 복사했습니다. 카카오톡 대화방에 붙여넣기 하세요.'))
      .catch(() => setError('복사하지 못했습니다. 텍스트 칸을 길게 눌러 직접 복사해주세요.'))
  }

  // 버튼을 누른 이벤트 안에서 기다림 없이 복사 → 공유를 연달아 호출해야 iOS가 둘 다 허용한다.
  function handleSend() {
    setError('')
    setNotice('')
    if (!images?.file) return

    const copying = copyText(text)

    if (canShareFile(images.file)) {
      const sharing = navigator.share({ files: [images.file] })
      Promise.allSettled([copying, sharing]).then(([copyResult, shareResult]) => {
        if (shareResult.status === 'rejected' && shareResult.reason?.name === 'AbortError') {
          setNotice(copyResult.status === 'fulfilled' ? '공유를 취소했습니다. 작업 내용은 복사되어 있습니다.' : '')
          return
        }
        if (shareResult.status === 'rejected') {
          setError(`공유 창을 열지 못했습니다: ${shareResult.reason?.message ?? '알 수 없는 오류'}`)
          return
        }
        setNotice(
          copyResult.status === 'fulfilled'
            ? '세대표를 보냈습니다. 같은 카카오톡 대화방에 붙여넣기 하면 작업 내용이 전송됩니다.'
            : '세대표를 보냈습니다. 작업 내용 복사에 실패했으니 "텍스트만 복사"를 눌러주세요.'
        )
      })
      return
    }

    // 파일 공유를 지원하지 않는 PC 브라우저: 이미지는 내려받고 텍스트는 복사해둔다
    saveImageFile(images.file).catch((err) => setError(err.message))
    copying
      .then(() => setNotice('세대표 이미지를 내려받고 작업 내용을 복사했습니다. 카카오톡에 이미지를 보낸 뒤 붙여넣기 하세요.'))
      .catch(() => setError('세대표 이미지는 내려받았지만 작업 내용 복사에 실패했습니다.'))
  }

  return (
    <div>
      <div className="report-date-row">
        <label className="text-secondary" htmlFor="report-date">
          날짜
        </label>
        <input id="report-date" type="date" value={date} max={today} onChange={(e) => changeDate(e.target.value)} />
        {!isToday && (
          <button type="button" className="btn small" onClick={() => changeDate(today)}>
            오늘로
          </button>
        )}
      </div>
      {!isToday && (
        <p className="share-warning report-past-warning" role="status">
          오늘이 아닌 {shortDate(date)} 내역입니다. 보내기 전에 날짜를 꼭 확인하세요.
        </p>
      )}
      <p className="text-secondary" style={{ marginTop: 0 }}>
        {date} · {isToday ? '오늘' : '이 날'} 내가 처리한 작업 체크, 미타공 등록/완료, 체크리스트 완료 내역입니다.
        등록했다가 취소한 건은 포함되지 않습니다.
      </p>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="auth-message notice">{notice}</p>}

      {sites === null && !error && <p className="text-secondary">불러오는 중…</p>}
      {sites?.length === 0 && (
        <p className="text-secondary">{isToday ? '오늘' : shortDate(date)} 작업한 내역이 없습니다.</p>
      )}

      {site && (
        <>
          {sites.length > 1 && (
            <div className="report-site-select">
              <label className="text-secondary" htmlFor="report-site">
                현장
              </label>
              <select id="report-site" value={siteId} onChange={(e) => setSiteId(Number(e.target.value))}>
                {sites.map((s) => (
                  <option key={s.siteId} value={s.siteId}>
                    {s.siteName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <span className="section-label">
            세대표 (빨간 테두리 = {isToday ? '오늘' : '이 날'} {site.crc ? 'CRC' : '경량·합지'} 체크한 세대
            {isToday ? '' : ', 칠한 칸은 이 날까지 완료된 세대'})
          </span>
          <div className="report-preview">
            {!images && <p className="text-secondary">세대표를 불러오는 중…</p>}
            {images?.error && <p className="text-secondary">세대표 이미지를 만들지 못했습니다: {images.error}</p>}
            {images?.preview && (
              <img src={images.preview} alt={`${site.siteName} 세대표`} style={{ width: images.previewWidth }} />
            )}
          </div>
          <p className="text-secondary report-hint">위에 보이는 그대로(빨간 테두리 포함) 보내집니다.</p>

          <div className="section-header">
            <span className="section-label">작업 내용</span>
            {texts[textKey] !== undefined && (
              <button type="button" className="btn small" onClick={handleResetText}>
                자동 작성으로 되돌리기
              </button>
            )}
          </div>
          <AutoGrowTextarea
            className="report-text"
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            aria-label="작업 내용"
          />

          <div className="report-actions">
            <button type="button" className="btn primary" disabled={!images?.file} onClick={handleSend}>
              작업보고 보내기
            </button>
            <button type="button" className="btn" onClick={handleCopyOnly}>
              텍스트만 복사
            </button>
          </div>
          <p className="text-secondary report-hint">
            보내기를 누르면 작업 내용이 복사되고 공유 창이 열립니다. 카카오톡 → 대화방을 골라 세대표를 보낸 뒤, 같은
            대화방에 붙여넣기 해주세요.
          </p>
        </>
      )}
    </div>
  )
}
