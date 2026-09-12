import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addDefect,
  addUnitLog,
  cellKey,
  checkKey,
  clearUnitCheck,
  createBuilding,
  defectSummary,
  deleteDefect,
  fetchCellLogs,
  fetchUserNames,
  loadSiteSheet,
  resolveDefect,
  setUnitCheck,
  updateBuilding,
} from '../../api/unitSheet'
import { saveSheetSharing } from '../../api/sheetSharing'
import { useAuth } from '../../hooks/useAuth'
import { enqueueWrite } from '../../lib/offlineQueue'
import BuildingEditModal from './BuildingEditModal'
import CellPanel from './CellPanel'
import DefectAddModal from './DefectAddModal'
import SheetShareModal from './SheetShareModal'
import UnitSheetTable from './UnitSheetTable'

const ALL_BUILDINGS = '전체'

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

  const [buildingFilter, setBuildingFilter] = useState(ALL_BUILDINGS)
  const [scale, setScale] = useState(1)
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
    const target = { buildingId: building.id, buildingName: building.name, lineNo, floor, kind }
    setPanel(target)
    setSelectedDefectId(null)
    await refreshLogs(target)
  }

  async function handleCellClick(building, lineNo, floor) {
    if (bar === 'work' && workSub) {
      await toggleCheck(building, lineNo, floor, workSub)
      return
    }
    if (sheetView === 'main' && bar === 'defect') {
      await openPanel(building, lineNo, floor, 'defect')
      return
    }
    await openPanel(building, lineNo, floor, 'info')
  }

  async function toggleCheck(building, lineNo, floor, field) {
    setError('')
    setNotice('')
    const key = checkKey(building.id, lineNo, floor, sheetView)
    const next = !sheet.checks[key]?.[field]
    const action = `${field === 'light' ? '경량' : '합지'} 체크${next ? '' : ' 해제'}`
    const detail = sheetView === 'plaster' ? '석고 시공' : null

    if (!navigator.onLine) {
      try {
        await enqueueWrite('unitCheck', {
          mode: 'set',
          buildingId: building.id,
          lineNo,
          floor,
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
      const row = {
        ...sheet.checks[key],
        [field]: next,
        [`${field}_by`]: next ? user.id : null,
        [`${field}_at`]: next ? now : null,
      }
      setSheet((prev) => ({ ...prev, checks: { ...prev.checks, [key]: row } }))
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      const row = await setUnitCheck({
        buildingId: building.id,
        lineNo,
        floor,
        sheet: sheetView,
        field,
        value: next,
        userId: user.id,
      })
      setSheet((prev) => ({ ...prev, checks: { ...prev.checks, [key]: row } }))
      await addUnitLog({ buildingId: building.id, lineNo, floor, sheet: sheetView, action, detail, userId: user.id })
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

  async function handleAddDefect({ locations, content }) {
    setSaving(true)
    setError('')
    setNotice('')

    if (!navigator.onLine) {
      const clientId = crypto.randomUUID()
      try {
        await enqueueWrite('defectAdd', {
          buildingId: panel.buildingId,
          lineNo: panel.lineNo,
          floor: panel.floor,
          locations,
          content,
          userId: user.id,
          clientId,
        })
      } catch (err) {
        setError(err.message)
        setSaving(false)
        return
      }
      const key = cellKey(panel.buildingId, panel.lineNo, panel.floor)
      const pendingDefect = {
        id: clientId,
        locations,
        content,
        created_by: user.id,
        created_at: new Date().toISOString(),
        resolved: false,
        pending: true,
      }
      setSheet((prev) => ({
        ...prev,
        defects: { ...prev.defects, [key]: [...(prev.defects[key] ?? []), pendingDefect] },
      }))
      setDefectModal(false)
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      setSaving(false)
      return
    }

    try {
      const defect = await addDefect({ ...panel, locations, content, userId: user.id, clientId: crypto.randomUUID() })
      await addUnitLog({
        ...panel,
        sheet: 'main',
        action: '미타공 등록',
        detail: defectSummary(defect),
        userId: user.id,
      })
      setDefectModal(false)
      setSelectedDefectId(defect.id)
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

  async function handleSaveBuilding({ id, name, maxFloors }) {
    setSaving(true)
    setError('')
    try {
      if (id) {
        await updateBuilding({ buildingId: id, name, maxFloors })
      } else {
        // 공유 중인 세대표에 동을 추가하면 원본 현장에 달려야 같이 보인다
        await createBuilding({ siteId: sheetOwner, name, maxFloors })
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
        scale={scale}
        onCellClick={handleCellClick}
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

      {defectModal && (
        <DefectAddModal saving={saving} onClose={() => setDefectModal(false)} onSubmit={handleAddDefect} />
      )}
      {buildingModal && (
        <BuildingEditModal
          buildings={sheet.buildings}
          saving={saving}
          onClose={() => setBuildingModal(false)}
          onSubmit={handleSaveBuilding}
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
