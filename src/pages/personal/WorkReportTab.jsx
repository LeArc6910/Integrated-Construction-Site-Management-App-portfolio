import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadSiteSheet } from '../../api/unitSheet'
import { buildReportText, fetchTodayWork, highlightKeysOf } from '../../api/workReport'
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
  const [sites, setSites] = useState(null) // null: 불러오는 중
  const [siteId, setSiteId] = useState(null)
  const [sheets, setSheets] = useState({}) // { [siteId]: 세대표 데이터 }
  const [texts, setTexts] = useState({}) // { [siteId]: 사용자가 고친 보고 문구 }
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => fetchTodayWork({ userId: user.id }), [user.id])

  useEffect(() => {
    let ignore = false
    load()
      .then((rows) => {
        if (ignore) return
        setSites(rows)
        setSiteId((prev) => prev ?? rows[0]?.siteId ?? null)
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
  const autoText = site ? buildReportText({ site, userName: user.name }) : ''
  const text = siteId && texts[siteId] !== undefined ? texts[siteId] : autoText

  // 미리보기(빨간 테두리)와 보낼 파일(테두리 없음)을 세대표를 받아온 시점에 미리 만들어 둔다.
  // 보내기 버튼을 누른 뒤에 이미지를 그리면 그 사이 iOS가 공유 창 호출을 막을 수 있다.
  const images = useMemo(() => {
    if (!site || !sheet) return null
    try {
      const title = site.siteName
      const previewCanvas = renderUnitSheetImage({
        title,
        buildings: sheet.buildings,
        checks: sheet.checks,
        highlightKeys: highlightKeysOf(site),
      })
      const file = canvasToFile(
        renderUnitSheetImage({ title, buildings: sheet.buildings, checks: sheet.checks }),
        sheetImageFileName(title)
      )
      return {
        preview: previewCanvas.toDataURL('image/png'),
        previewWidth: previewCanvas.logicalWidth,
        file,
        error: null,
      }
    } catch (err) {
      return { preview: null, previewWidth: 0, file: null, error: err.message }
    }
  }, [site, sheet])

  function handleTextChange(value) {
    setTexts((prev) => ({ ...prev, [siteId]: value }))
  }

  function handleResetText() {
    setTexts((prev) => {
      const next = { ...prev }
      delete next[siteId]
      return next
    })
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
      <p className="text-secondary" style={{ marginTop: 0 }}>
        {todayString()} · 오늘 내가 처리한 경량·합지 체크, 미타공 등록/완료, 체크리스트 완료 내역입니다. 등록했다가
        취소한 건은 포함되지 않습니다.
      </p>

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="auth-message notice">{notice}</p>}

      {sites === null && !error && <p className="text-secondary">불러오는 중…</p>}
      {sites?.length === 0 && <p className="text-secondary">오늘 작업한 내역이 없습니다.</p>}

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

          <span className="section-label">세대표 (빨간 테두리 = 오늘 경량·합지 체크한 세대)</span>
          <div className="report-preview">
            {!images && <p className="text-secondary">세대표를 불러오는 중…</p>}
            {images?.error && <p className="text-secondary">세대표 이미지를 만들지 못했습니다: {images.error}</p>}
            {images?.preview && (
              <img src={images.preview} alt={`${site.siteName} 세대표`} style={{ width: images.previewWidth }} />
            )}
          </div>
          <p className="text-secondary report-hint">카카오톡에는 빨간 테두리가 없는 세대표로 보내집니다.</p>

          <div className="section-header">
            <span className="section-label">작업 내용</span>
            {texts[siteId] !== undefined && (
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
