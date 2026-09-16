import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addDefect,
  addUnitLog,
  addUnitLogs,
  cellKey,
  checkKey,
  clearUnitCheck,
  createBuilding,
  defectSummary,
  deleteBuilding,
  deleteDefect,
  fetchCellLogs,
  fetchUserNames,
  loadSiteSheet,
  reorderBuildings,
  resolveDefect,
  setUnitChecks,
  updateBuilding,
} from '../../api/unitSheet'
import { saveSheetSharing } from '../../api/sheetSharing'
import { useAuth } from '../../hooks/useAuth'
import { enqueueWrite } from '../../lib/offlineQueue'
import { canvasToFile, renderUnitSheetImage, saveImageFile, sheetImageFileName } from '../../lib/unitSheetImage'
import BuildingEditModal from './BuildingEditModal'
import CellPanel from './CellPanel'
import ChecklistPanel from './ChecklistPanel'
import DefectAddModal from './DefectAddModal'
import SheetShareModal from './SheetShareModal'
import UnitSheetTable from './UnitSheetTable'

const ALL_BUILDINGS = '전체'

// 가로/세로 보기는 기기에 기억해두고 다음에 어느 현장을 열어도 같은 방향으로 보여준다
const HORIZONTAL_STORAGE_KEY = 'unitSheetHorizontal'

function loadHorizontal() {
  try {
    return localStorage.getItem(HORIZONTAL_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveHorizontal(value) {
  try {
    localStorage.setItem(HORIZONTAL_STORAGE_KEY, String(value))
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 이번 화면에서만 유지된다
  }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatCachedTime(iso) {
  const d = new Date(iso)
  return `${pad2(d.getHours())}시 ${pad2(d.getMinutes())}분`
}

export default function SiteDetailPage() {
  const { siteId } = useParams()
  const { user } = useAuth()

  const [sheet, setSheet] = useState({
    site: null,
    ownerId: null,
    ownerName: null,
    sharedWith: [],
    buildings: [],
    checks: {},
    defects: {},
    offline: false,
    cachedAt: null,
  })
  const [names, setNames] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [view, setView] = useState('sheet') // 'sheet' | 'checklist'
  const [buildingFilter, setBuildingFilter] = useState(ALL_BUILDINGS)
  const [scale, setScale] = useState(1)
  const [horizontal, setHorizontal] = useState(loadHorizontal)
  const [sheetView, setSheetView] = useState('main') // 'main' | 'plaster'
  const [bar, setBar] = useState('default') // 'default' | 'work' | 'defect'
  const [workSub, setWorkSub] = useState(null) // 'light' | 'laminate'

  const [panel, setPanel] = useState(null) // { buildingId, buildingName, lineNo, floor, kind }
  const [logs, setLogs] = useState([])
  const [selectedDefectId, setSelectedDefectId] = useState(null)
  const [defectModal, setDefectModal] = useState(false)
  const [buildingModal, setBuildingModal] = useState(false)
  const [shareModal, setShareModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const sheetOwner = sheet.ownerId ?? siteId

  const load = useCallback(() => loadSiteSheet({ siteId }), [siteId])

  useEffect(() => {
    let ignore = false
    Promise.all([load(), fetchUserNames()])
      .then(([sheetData, nameMap]) => {
        if (ignore) return
        setSheet(sheetData)
        setNames(nameMap)
      })
      .catch((err) => !ignore && setError(err.message))
    return () => {
      ignore = true
    }
  }, [load])

  const reload = useCallback(async () => {
    try {
      setSheet(await load())
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [load])

  // 오프라인이던 중에 연결이 돌아오면 캐시 대신 최신 세대표를 다시 받아온다
  useEffect(() => {
    function handleOnline() {
      reload()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [reload])

  // 오프라인 큐에 쌓아둔 체크·미타공 기록이 서버로 전송되면 세대표를 최신 상태로 다시 받아온다
  useEffect(() => {
    function handleFlushed() {
      reload()
    }
    window.addEventListener('offline-queue-flushed', handleFlushed)
    return () => window.removeEventListener('offline-queue-flushed', handleFlushed)
  }, [reload])

  async function refreshLogs(target = panel) {
    if (!target) return
    try {
      setLogs(await fetchCellLogs({ ...target, sheet: sheetView }))
    } catch (err) {
      setError(err.message)
    }
  }

  function closePanel() {
    setPanel(null)
    setLogs([])
    setSelectedDefectId(null)
  }

  function switchSheetView(view) {
    setSheetView(view)
    setBar('default')
    setWorkSub(null)
    closePanel()
  }

  function cancelMode() {
    setBar('default')
    setWorkSub(null)
    closePanel()
  }

  async function openPanel(building, lineNo, floor, kind) {
    const unitType = building.lines.find((line) => line.line_no === lineNo)?.unit_type ?? null
    const target = { buildingId: building.id, buildingName: building.name, lineNo, floor, unitType, kind }
    setPanel(target)
    setSelectedDefectId(null)
    await refreshLogs(target)
  }

  async function handleCellClick(building, lineNo, floor) {
    if (sheetView === 'main' && bar === 'defect') {
      await openPanel(building, lineNo, floor, 'defect')
      return
    }
    await openPanel(building, lineNo, floor, 'info')
  }

  // 드래그로 고른 칸들(cells[0]은 처음 누른 칸)을 한 번에 칠하거나 지운다. 한 칸만 탭한
  // 경우도 칸이 하나인 드래그로 들어와서 같은 경로를 탄다.
  async function handleCellsCheck(building, cells) {
    if (!workSub || cells.length === 0) return
    setError('')
    setNotice('')

    const field = workSub
    // 체크할지 해제할지는 처음 누른 칸의 상태로 정한다. 드래그 구간에 체크된 칸과 안 된
    // 칸이 섞여 있어도 한 방향으로만 칠해져서 결과를 예측할 수 있다.
    const anchorKey = checkKey(building.id, cells[0].lineNo, cells[0].floor, sheetView)
    const next = !sheet.checks[anchorKey]?.[field]
    const action = `${field === 'light' ? '경량' : '합지'} 체크${next ? '' : ' 해제'}`
    const detail = sheetView === 'plaster' ? '석고 시공' : null
    const targets = cells.map((cell) => ({ buildingId: building.id, lineNo: cell.lineNo, floor: cell.floor }))

    if (!navigator.onLine) {
      try {
        await enqueueWrite('unitCheck', {
          mode: 'set',
          cells: targets,
          sheet: sheetView,
          field,
          value: next,
          userId: user.id,
          action,
          detail,
          clientId: crypto.randomUUID(),
        })
      } catch (err) {
        setError(err.message)
        return
      }
      const now = new Date().toISOString()
      setSheet((prev) => {
        const checks = { ...prev.checks }
        targets.forEach((cell) => {
          const key = checkKey(cell.buildingId, cell.lineNo, cell.floor, sheetView)
          checks[key] = {
            ...checks[key],
            [field]: next,
            [`${field}_by`]: next ? user.id : null,
            [`${field}_at`]: next ? now : null,
          }
        })
        return { ...prev, checks }
      })
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      const rows = await setUnitChecks({ cells: targets, sheet: sheetView, field, value: next, userId: user.id })
      setSheet((prev) => {
        const checks = { ...prev.checks }
        rows.forEach((row) => {
          checks[checkKey(row.building_id, row.line_no, row.floor, row.sheet)] = row
        })
        return { ...prev, checks }
      })
      await addUnitLogs({ cells: targets, sheet: sheetView, action, detail, userId: user.id })
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClearCheck() {
    setError('')
    setNotice('')
    const key = checkKey(panel.buildingId, panel.lineNo, panel.floor, sheetView)
    const detail = sheetView === 'plaster' ? '석고 시공 · 경량/합지 해제' : '경량/합지 해제'

    if (!navigator.onLine) {
      try {
        await enqueueWrite('unitCheck', {
          mode: 'clear',
          buildingId: panel.buildingId,
          lineNo: panel.lineNo,
          floor: panel.floor,
          sheet: sheetView,
          userId: user.id,
          action: '체크 취소',
          detail,
          clientId: crypto.randomUUID(),
        })
      } catch (err) {
        setError(err.message)
        return
      }
      const row = {
        light: false,
        light_by: null,
        light_at: null,
        laminate: false,
        laminate_by: null,
        laminate_at: null,
        updated_at: new Date().toISOString(),
      }
      setSheet((prev) => ({ ...prev, checks: { ...prev.checks, [key]: row } }))
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      const row = await clearUnitCheck({ ...panel, sheet: sheetView })
      setSheet((prev) => ({ ...prev, checks: { ...prev.checks, [key]: row } }))
      await addUnitLog({ ...panel, sheet: sheetView, action: '체크 취소', detail, userId: user.id })
      await refreshLogs()
    } catch (err) {
      setError(err.message)
    }
  }

  // 위치를 여러 개 고른 등록은 하나로 묶지 않고, 위치마다 별도의 미타공 건으로 나눠 등록한다.
  async function handleAddDefect({ locations, content }) {
    setSaving(true)
    setError('')
    setNotice('')

    if (!navigator.onLine) {
      const key = cellKey(panel.buildingId, panel.lineNo, panel.floor)
      const pendingDefects = []
      try {
        for (const location of locations) {
          const clientId = crypto.randomUUID()
          await enqueueWrite('defectAdd', {
            buildingId: panel.buildingId,
            lineNo: panel.lineNo,
            floor: panel.floor,
            locations: [location],
            content,
            userId: user.id,
            clientId,
          })
          pendingDefects.push({
            id: clientId,
            locations: [location],
            content,
            created_by: user.id,
            created_at: new Date().toISOString(),
            resolved: false,
            pending: true,
          })
        }
      } catch (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      setSheet((prev) => ({
        ...prev,
        defects: { ...prev.defects, [key]: [...(prev.defects[key] ?? []), ...pendingDefects] },
      }))
      setDefectModal(false)
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      setSaving(false)
      return
    }

    try {
      let lastDefect = null
      for (const location of locations) {
        const defect = await addDefect({
          ...panel,
          locations: [location],
          content,
          userId: user.id,
          clientId: crypto.randomUUID(),
        })
        await addUnitLog({
          ...panel,
          sheet: 'main',
          action: '미타공 등록',
          detail: defectSummary(defect),
          userId: user.id,
        })
        lastDefect = defect
      }
      setDefectModal(false)
      if (lastDefect) setSelectedDefectId(lastDefect.id)
      await reload()
      await refreshLogs()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleResolveDefect() {
    setError('')
    setNotice('')
    const defect = currentDefects.find((item) => item.id === selectedDefectId)
    if (!defect || defect.pending) return

    if (!navigator.onLine) {
      try {
        await enqueueWrite('defectResolve', {
          id: defect.id,
          buildingId: panel.buildingId,
          lineNo: panel.lineNo,
          floor: panel.floor,
          detail: defectSummary(defect),
          userId: user.id,
          clientId: crypto.randomUUID(),
        })
      } catch (err) {
        setError(err.message)
        return
      }
      const key = cellKey(panel.buildingId, panel.lineNo, panel.floor)
      setSheet((prev) => ({
        ...prev,
        defects: {
          ...prev.defects,
          [key]: prev.defects[key].map((item) =>
            item.id === defect.id
              ? { ...item, resolved: true, resolved_by: user.id, resolved_at: new Date().toISOString() }
              : item
          ),
        },
      }))
      setSelectedDefectId(null)
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      await resolveDefect({ id: defect.id, userId: user.id })
      await addUnitLog({
        ...panel,
        sheet: 'main',
        action: '미타공 처리 완료',
        detail: defectSummary(defect),
        userId: user.id,
      })
      setSelectedDefectId(null)
      await reload()
      await refreshLogs()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteDefect() {
    setError('')
    setNotice('')
    const defect = currentDefects.find((item) => item.id === selectedDefectId)
    if (!defect || defect.pending) return

    if (!navigator.onLine) {
      try {
        await enqueueWrite('defectDelete', {
          id: defect.id,
          buildingId: panel.buildingId,
          lineNo: panel.lineNo,
          floor: panel.floor,
          detail: defectSummary(defect),
          userId: user.id,
          clientId: crypto.randomUUID(),
        })
      } catch (err) {
        setError(err.message)
        return
      }
      const key = cellKey(panel.buildingId, panel.lineNo, panel.floor)
      setSheet((prev) => ({
        ...prev,
        defects: { ...prev.defects, [key]: prev.defects[key].filter((item) => item.id !== defect.id) },
      }))
      setSelectedDefectId(null)
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      await deleteDefect({ id: defect.id })
      await addUnitLog({
        ...panel,
        sheet: 'main',
        action: '미타공 체크 취소',
        detail: defectSummary(defect),
        userId: user.id,
      })
      setSelectedDefectId(null)
      await reload()
      await refreshLogs()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSaveBuilding({ id, name, lines }) {
    setSaving(true)
    setError('')
    try {
      if (id) {
        await updateBuilding({ buildingId: id, name, lines })
      } else {
        // 공유 중인 세대표에 동을 추가하면 원본 현장에 달려야 같이 보인다
        await createBuilding({ siteId: sheetOwner, name, lines })
      }
      setBuildingModal(false)
      setBuildingFilter(name)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteBuilding(buildingId) {
    setSaving(true)
    setError('')
    try {
      await deleteBuilding({ buildingId })
      setBuildingModal(false)
      setBuildingFilter(ALL_BUILDINGS)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleReorderBuildings(orderedIds) {
    setSaving(true)
    setError('')
    try {
      await reorderBuildings({ orderedIds })
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveSharing({ siteIds }) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await saveSheetSharing({ ownerSiteId: sheetOwner, siteIds })
      setShareModal(false)
      setNotice('세대표 공유 설정을 저장했습니다.')
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // 이미지 생성과 공유 호출을 기다림 없이 이어서 해야 iOS에서 공유 창이 막히지 않는다
  function handleDownloadSheet() {
    setError('')
    setNotice('')
    try {
      const siteName = sheet.site?.name ?? '현장'
      const title = buildingFilter === ALL_BUILDINGS ? siteName : `${siteName} ${buildingFilter}`
      const canvas = renderUnitSheetImage({ title, buildings: visibleBuildings, checks: sheet.checks })
      const file = canvasToFile(canvas, sheetImageFileName(title))
      saveImageFile(file).catch((err) => setError(err.message))
    } catch (err) {
      setError(`세대표 이미지를 만들지 못했습니다: ${err.message}`)
    }
  }

  function toggleHorizontal() {
    const next = !horizontal
    setHorizontal(next)
    saveHorizontal(next)
  }

  const visibleBuildings =
    buildingFilter === ALL_BUILDINGS
      ? sheet.buildings
      : sheet.buildings.filter((building) => building.name === buildingFilter)

  const currentDefects = panel ? (sheet.defects[cellKey(panel.buildingId, panel.lineNo, panel.floor)] ?? []) : []

  return (
    <div>
      <Link to="/sites" className="back-btn">
        ← 목록으로
      </Link>
      <h2 className="page-title">{sheet.site?.name ?? ''}</h2>

      <div className="site-view-tabs">
        <button
          type="button"
          className={`btn${view === 'sheet' ? ' primary' : ''}`}
          onClick={() => setView('sheet')}
        >
          세대표
        </button>
        <button
          type="button"
          className={`btn${view === 'checklist' ? ' primary' : ''}`}
          onClick={() => setView('checklist')}
        >
          체크리스트
        </button>
      </div>

      {sheet.offline && (
        <p className="offline-banner">오프라인 · 마지막 업데이트 {formatCachedTime(sheet.cachedAt)}</p>
      )}

      {sheet.sharedWith?.length > 0 && (
        <p className="share-banner">
          공유 세대표 · {sheet.sharedWith.join(', ')} 현장과 함께 기록됩니다. 체크가 모든 현장에 반영됩니다.
        </p>
      )}

      {error && (
        <p className="auth-message error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="auth-message notice">{notice}</p>}

      {view === 'checklist' ? (
        <ChecklistPanel siteId={sheetOwner} userId={user.id} names={names} />
      ) : (
        <>
      <div className="toolbar">
        <select value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value)}>
          <option value={ALL_BUILDINGS}>{ALL_BUILDINGS}</option>
          {sheet.buildings.map((building) => (
            <option key={building.id} value={building.name}>
              {building.name}
            </option>
          ))}
        </select>
        <div className="zoom-controls">
          <button type="button" className="btn small" onClick={toggleHorizontal}>
            {horizontal ? '세로 보기' : '가로 보기'}
          </button>
          <button type="button" className="btn small" onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}>
            －
          </button>
          <button type="button" className="btn small" onClick={() => setScale((s) => Math.min(2, s + 0.2))}>
            ＋
          </button>
        </div>
      </div>

      <span className="section-label">{sheetView === 'plaster' ? '석고 시공 세대표' : '메인 세대표'}</span>

      <UnitSheetTable
        buildings={visibleBuildings}
        checks={sheet.checks}
        defects={sheet.defects}
        sheetView={sheetView}
        defectMode={bar === 'defect'}
        dragMode={bar === 'work' && workSub !== null}
        scale={scale}
        horizontal={horizontal}
        onCellClick={handleCellClick}
        onCellsCheck={handleCellsCheck}
      />

      <div className="mode-bar">
        {bar === 'work' ? (
          <>
            <button
              type="button"
              className={`btn${workSub === 'light' ? ' primary' : ''}`}
              onClick={() => setWorkSub('light')}
            >
              경량
            </button>
            <button
              type="button"
              className={`btn${workSub === 'laminate' ? ' primary' : ''}`}
              onClick={() => setWorkSub('laminate')}
            >
              합지
            </button>
            <button type="button" className="btn danger" onClick={cancelMode}>
              취소
            </button>
            {workSub && <span className="mode-hint">칸을 끌면 여러 칸이 한 번에 체크됩니다</span>}
          </>
        ) : bar === 'defect' ? (
          <button type="button" className="btn danger" onClick={cancelMode}>
            취소
          </button>
        ) : sheetView === 'plaster' ? (
          <>
            <button type="button" className="btn" onClick={() => setBar('work')}>
              작업 체크
            </button>
            <button type="button" className="btn" onClick={() => switchSheetView('main')}>
              메인 세대표로
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => setBar('work')}>
              작업 체크
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setBar('defect')
                closePanel()
              }}
            >
              미타공
            </button>
            <button type="button" className="btn" onClick={() => switchSheetView('plaster')}>
              석고 시공
            </button>
            <button type="button" className="btn" onClick={() => setBuildingModal(true)}>
              세대표 수정
            </button>
            <button type="button" className="btn" disabled={sheet.offline} onClick={() => setShareModal(true)}>
              세대표 공유
            </button>
            <button
              type="button"
              className="btn"
              disabled={visibleBuildings.length === 0}
              onClick={handleDownloadSheet}
            >
              세대표 다운로드
            </button>
          </>
        )}
      </div>

      {panel && (
        <CellPanel
          panel={panel}
          sheetView={sheetView}
          check={sheet.checks[checkKey(panel.buildingId, panel.lineNo, panel.floor, sheetView)]}
          defects={currentDefects}
          logs={logs}
          names={names}
          selectedDefectId={selectedDefectId}
          onSelectDefect={(id) => setSelectedDefectId((prev) => (prev === id ? null : id))}
          onClose={closePanel}
          onClearCheck={handleClearCheck}
          onAddDefect={() => setDefectModal(true)}
          onResolveDefect={handleResolveDefect}
          onDeleteDefect={handleDeleteDefect}
        />
      )}
        </>
      )}

      {defectModal && (
        <DefectAddModal saving={saving} onClose={() => setDefectModal(false)} onSubmit={handleAddDefect} />
      )}
      {buildingModal && (
        <BuildingEditModal
          buildings={sheet.buildings}
          saving={saving}
          onClose={() => setBuildingModal(false)}
          onSubmit={handleSaveBuilding}
          onDelete={handleDeleteBuilding}
          onReorder={handleReorderBuildings}
        />
      )}
      {shareModal && (
        <SheetShareModal
          ownerSiteId={sheetOwner}
          ownerName={sheet.ownerName ?? sheet.site?.name ?? ''}
          saving={saving}
          onClose={() => setShareModal(false)}
          onSubmit={handleSaveSharing}
        />
      )}
    </div>
  )
}
