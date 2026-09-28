import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  addDefect,
  addUnitLog,
  addUnitLogs,
  cellKey,
  checkKey,
  checkLogGroups,
  checkPatch,
  clearPatch,
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
  saveSiteSections,
  setUnitChecks,
  updateBuilding,
} from '../../api/unitSheet'
import { ensureSiteUnitTypes, fetchSiteHoleSetup, saveSiteHoleSetup, setUnitOption } from '../../api/holes'
import { saveSheetSharing } from '../../api/sheetSharing'
import { useAuth } from '../../hooks/useAuth'
import { unitHoleCount } from '../../lib/holes'
import { isCrcOwner } from '../../lib/siteMode'
import MenuButton from '../../components/MenuButton'
import { enqueueWrite } from '../../lib/offlineQueue'
import { canvasToFile, downloadImageFile, renderUnitSheetImage, sheetImageFileName } from '../../lib/unitSheetImage'
import BuildingEditModal from './BuildingEditModal'
import CellPanel from './CellPanel'
import ChecklistPanel from './ChecklistPanel'
import DefectAddModal from './DefectAddModal'
import HoleSetupModal from './HoleSetupModal'
import SectionEditModal from './SectionEditModal'
import SheetShareModal from './SheetShareModal'
import UnitSheetTable from './UnitSheetTable'

const ALL_BUILDINGS = '전체'
const ALL_SECTIONS = '전체'
// 공구를 지정하지 않은 동만 모아 보는 값. 공구 id(숫자)와 겹치지 않게 문자열을 쓴다.
const UNASSIGNED_SECTION = '미지정'

// 가로/세로 보기는 기기에 기억해두고 다음에 어느 현장을 열어도 같은 방향으로 보여준다
const HORIZONTAL_STORAGE_KEY = 'unitSheetHorizontal'

// 공구·동은 현장마다 구성이 달라서 현장별로 따로 기억한다
function loadFilter(prefix, siteId, fallback) {
  try {
    return localStorage.getItem(`${prefix}:${siteId}`) ?? fallback
  } catch {
    return fallback
  }
}

function saveFilter(prefix, siteId, value) {
  try {
    localStorage.setItem(`${prefix}:${siteId}`, value)
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)이면 이번 화면에서만 유지된다
  }
}

function loadSection(siteId) {
  return loadFilter('unitSheetSection', siteId, ALL_SECTIONS)
}

function saveSection(siteId, value) {
  saveFilter('unitSheetSection', siteId, value)
}

function loadBuilding(siteId) {
  return loadFilter('unitSheetBuilding', siteId, ALL_BUILDINGS)
}

function saveBuilding(siteId, value) {
  saveFilter('unitSheetBuilding', siteId, value)
}

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
    sections: [],
    checks: {},
    defects: {},
    offline: false,
    cachedAt: null,
  })
  const [names, setNames] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [view, setView] = useState('sheet') // 'sheet' | 'checklist'
  const [sectionFilter, setSectionFilter] = useState(() => loadSection(siteId))
  const [buildingFilter, setBuildingFilter] = useState(() => loadBuilding(siteId))
  const [scale, setScale] = useState(1)
  const [horizontal, setHorizontal] = useState(loadHorizontal)
  const [sheetView, setSheetView] = useState('main') // 'main' | 'plaster'
  const [bar, setBar] = useState('default') // 'default' | 'work' | 'defect' | 'option'
  const [workSub, setWorkSub] = useState(null) // 'light' | 'laminate'
  // 타공 설정(현장 타입표·옵션표)과 세대별 옵션. 세대표와 따로 받아온다(오프라인 캐시 대상 아님).
  const [holeSetup, setHoleSetup] = useState({ types: [], options: [], unitOptions: {} })
  const [optionId, setOptionId] = useState(null) // 옵션 지정 중에 고른 옵션

  const [panel, setPanel] = useState(null) // { buildingId, buildingName, lineNo, floor, kind }
  const [logs, setLogs] = useState([])
  const [selectedDefectId, setSelectedDefectId] = useState(null)
  const [defectModal, setDefectModal] = useState(false)
  const [buildingModal, setBuildingModal] = useState(false)
  const [sectionModal, setSectionModal] = useState(false)
  const [shareModal, setShareModal] = useState(false)
  const [holeModal, setHoleModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const sheetOwner = sheet.ownerId ?? siteId
  // 체크·미타공을 한 현장. 공유 세대표라도 원본이 아니라 지금 보고 있는 현장이다(작업보고 기준)
  const workSiteId = Number(siteId)
  // 세대표를 공유하면 체크도 원본과 함께 쓰므로 CRC 여부는 원본 현장 이름으로 정한다
  const crc = isCrcOwner({ ownerName: sheet.ownerName, siteName: sheet.site?.name })

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

  // 동 목록이 바뀔 때(동 추가·삭제)만 다시 받도록 id 목록을 문자열 하나로 둔다
  const buildingIdsKey = sheet.buildings.map((building) => building.id).join(',')

  const reloadHoles = useCallback(async () => {
    if (!sheet.ownerId || sheet.offline) return
    try {
      const buildingIds = buildingIdsKey ? buildingIdsKey.split(',').map(Number) : []
      setHoleSetup(await fetchSiteHoleSetup({ siteId: sheet.ownerId, buildingIds }))
    } catch (err) {
      setError(err.message)
    }
  }, [sheet.ownerId, sheet.offline, buildingIdsKey])

  useEffect(() => {
    reloadHoles()
  }, [reloadHoles])

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
    setOptionId(null)
    closePanel()
  }

  // 드래그로 고른 세대들에 지금 고른 옵션을 붙이거나 뗀다. 방향은 작업 체크처럼 처음 누른 칸 기준.
  async function handleCellsOption(building, cells) {
    if (optionId === null || cells.length === 0) return
    setError('')
    setNotice('')

    const anchor = cellKey(building.id, cells[0].lineNo, cells[0].floor)
    const next = !(holeSetup.unitOptions[anchor] ?? []).includes(optionId)
    const targets = cells.map((cell) => ({ buildingId: building.id, lineNo: cell.lineNo, floor: cell.floor }))
    const option = holeSetup.options.find((item) => item.id === optionId)

    try {
      await setUnitOption({ cells: targets, optionId, value: next })
      setHoleSetup((prev) => {
        const unitOptions = { ...prev.unitOptions }
        targets.forEach((cell) => {
          const key = cellKey(cell.buildingId, cell.lineNo, cell.floor)
          const rest = (unitOptions[key] ?? []).filter((id) => id !== optionId)
          unitOptions[key] = next ? [...rest, optionId] : rest
        })
        return { ...prev, unitOptions }
      })
      await addUnitLogs({
        cells: targets,
        sheet: 'main',
        action: next ? '옵션 지정' : '옵션 해제',
        detail: option?.name ?? null,
        userId: user.id,
      })
    } catch (err) {
      setError(err.message)
    }
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
    const workName = crc ? 'CRC' : field === 'light' ? '경량' : '합지'
    const action = `${workName} 체크${next ? '' : ' 해제'}`
    const detail = sheetView === 'plaster' ? '석고 시공' : null
    // 이미 원하는 상태인 칸은 건너뛴다. 빈 칸에서 시작해 칠할 때 구간에 섞인 예전 완료 칸까지 저장하면
    // 처리자·시각이 지금·나로 덮어써져 오늘 작업보고에 잘못 들어간다.
    const targets = cells
      .map((cell) => {
        const prev = sheet.checks[checkKey(building.id, cell.lineNo, cell.floor, sheetView)] ?? null
        return { buildingId: building.id, lineNo: cell.lineNo, floor: cell.floor, prev }
      })
      .filter((cell) => Boolean(cell.prev?.[field]) !== next)
    if (targets.length === 0) return
    const now = new Date().toISOString()

    if (!navigator.onLine) {
      try {
        await enqueueWrite('unitCheck', {
          mode: 'set',
          cells: targets,
          sheet: sheetView,
          field,
          value: next,
          userId: user.id,
          siteId: workSiteId,
          now,
          action,
          detail,
          clientId: crypto.randomUUID(),
        })
      } catch (err) {
        setError(err.message)
        return
      }
      setSheet((prev) => {
        const checks = { ...prev.checks }
        targets.forEach((cell) => {
          const key = checkKey(cell.buildingId, cell.lineNo, cell.floor, sheetView)
          checks[key] = {
            ...checks[key],
            ...checkPatch({ prev: cell.prev, field, value: next, userId: user.id, siteId: workSiteId, now }),
          }
        })
        return { ...prev, checks }
      })
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      const rows = await setUnitChecks({
        cells: targets,
        sheet: sheetView,
        field,
        value: next,
        userId: user.id,
        siteId: workSiteId,
        now,
      })
      setSheet((prev) => {
        const checks = { ...prev.checks }
        rows.forEach((row) => {
          checks[checkKey(row.building_id, row.line_no, row.floor, row.sheet)] = row
        })
        return { ...prev, checks }
      })
      for (const group of checkLogGroups({ cells: targets, field, value: next, detail, now })) {
        await addUnitLogs({ cells: group.cells, sheet: sheetView, action, detail: group.detail, userId: user.id })
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleClearCheck() {
    setError('')
    setNotice('')
    const key = checkKey(panel.buildingId, panel.lineNo, panel.floor, sheetView)
    const cleared = crc ? 'CRC 해제' : '경량/합지 해제'
    const detail = sheetView === 'plaster' ? `석고 시공 · ${cleared}` : cleared
    const prev = sheet.checks[key] ?? null
    const now = new Date().toISOString()

    if (!navigator.onLine) {
      try {
        await enqueueWrite('unitCheck', {
          mode: 'clear',
          buildingId: panel.buildingId,
          lineNo: panel.lineNo,
          floor: panel.floor,
          sheet: sheetView,
          userId: user.id,
          prev: prev && { light: Boolean(prev.light), laminate: Boolean(prev.laminate) },
          now,
          action: '체크 취소',
          detail,
          clientId: crypto.randomUUID(),
        })
      } catch (err) {
        setError(err.message)
        return
      }
      const row = { ...prev, ...clearPatch(prev, now), updated_at: now }
      setSheet((current) => ({ ...current, checks: { ...current.checks, [key]: row } }))
      setNotice('오프라인 상태라 임시 저장했습니다. 온라인이 되면 자동으로 전송됩니다.')
      return
    }

    try {
      const row = await clearUnitCheck({ ...panel, sheet: sheetView, prev, now })
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
            siteId: workSiteId,
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
          siteId: workSiteId,
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
          siteId: workSiteId,
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
      await resolveDefect({ id: defect.id, userId: user.id, siteId: workSiteId })
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
      changeBuilding(name)
      await reload()
      // 새로 적은 타입 이름은 타공 설정에도 (타공 수 없이) 올려 둔다
      await ensureSiteUnitTypes({ siteId: sheetOwner, names: lines.map((line) => line.unitType) })
      await reloadHoles()
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
      changeBuilding(ALL_BUILDINGS)
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

  async function handleSaveHoleSetup(setup) {
    setSaving(true)
    setError('')
    try {
      await saveSiteHoleSetup({ siteId: sheetOwner, buildingIds: sheet.buildings.map((b) => b.id), ...setup })
      setHoleModal(false)
      // 타입 이름을 바꾸면 라인 값도 바뀌므로 세대표도 다시 받는다
      await reload()
      await reloadHoles()
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

  // 안드로이드·PC는 파일로 바로 받고, iOS만 공유 창을 쓴다(downloadImageFile 주석 참고).
  // 이미지 생성과 호출을 기다림 없이 이어서 해야 iOS에서 공유 창이 막히지 않는다.
  function handleDownloadSheet() {
    setError('')
    setNotice('')
    try {
      const siteName = sheet.site?.name ?? '현장'
      // 지금 화면에 보이는 범위를 제목에도 그대로 적는다 (예: "수원 LH SY 1공구 101동")
      const scope = [sectionLabel, buildingInSection ? buildingFilter : ''].filter(Boolean).join(' ')
      const title = scope ? `${siteName} ${scope}` : siteName
      const canvas = renderUnitSheetImage({ title, buildings: visibleBuildings, checks: sheet.checks, crc })
      const file = canvasToFile(canvas, sheetImageFileName(title))
      downloadImageFile(file).catch((err) => setError(err.message))
    } catch (err) {
      setError(`세대표 이미지를 만들지 못했습니다: ${err.message}`)
    }
  }

  // 공구를 바꾸면 그 공구에 없는 동이 걸려 있을 수 있어 동 선택은 전체로 되돌린다
  function changeSection(value) {
    setSectionFilter(value)
    saveSection(siteId, value)
    changeBuilding(ALL_BUILDINGS)
  }

  function changeBuilding(value) {
    setBuildingFilter(value)
    saveBuilding(siteId, value)
  }

  // CRC 현장은 고를 작업이 하나뿐이라 작업 체크를 누르면 바로 체크할 수 있게 해둔다
  function startWorkMode() {
    setBar('work')
    if (crc) setWorkSub('light')
  }

  async function handleSaveSections({ sections, removedIds, assignments }) {
    setSaving(true)
    setError('')
    try {
      await saveSiteSections({ siteId: sheetOwner, sections, removedIds, assignments })
      setSectionModal(false)
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleHorizontal() {
    const next = !horizontal
    setHorizontal(next)
    saveHorizontal(next)
  }

  // 기억해둔 공구가 사라졌으면(다른 사람이 지웠거나 예전 현장의 값이면) 전체로 되돌린다
  const sectionExists =
    sectionFilter === ALL_SECTIONS ||
    (sectionFilter === UNASSIGNED_SECTION && sheet.buildings.some((building) => building.sectionId == null)) ||
    sheet.sections.some((section) => String(section.id) === String(sectionFilter))
  const activeSection = sectionExists ? sectionFilter : ALL_SECTIONS

  const sectionBuildings = sheet.buildings.filter((building) => {
    if (activeSection === ALL_SECTIONS) return true
    if (activeSection === UNASSIGNED_SECTION) return building.sectionId == null
    return String(building.sectionId) === String(activeSection)
  })

  // 공구를 바꾸면 동 선택은 전체로 돌아가지만, 새로고침 등으로 지금 공구에 없는 동이 남아 있으면
  // 표가 통째로 비어 보인다. 그럴 때도 그 공구의 동을 다 보여준다.
  const buildingInSection = sectionBuildings.some((building) => building.name === buildingFilter)
  const visibleBuildings =
    buildingFilter === ALL_BUILDINGS || !buildingInSection
      ? sectionBuildings
      : sectionBuildings.filter((building) => building.name === buildingFilter)

  const sectionLabel =
    activeSection === ALL_SECTIONS
      ? ''
      : activeSection === UNASSIGNED_SECTION
        ? UNASSIGNED_SECTION
        : (sheet.sections.find((section) => String(section.id) === String(activeSection))?.name ?? '')

  const hasUnassigned = sheet.buildings.some((building) => building.sectionId == null)

  // 옵션 지정 중에 고른 옵션이 붙은 세대들
  const optionCells = useMemo(() => {
    if (optionId === null) return null
    return new Set(
      Object.entries(holeSetup.unitOptions)
        .filter(([, ids]) => ids.includes(optionId))
        .map(([key]) => key)
    )
  }, [holeSetup.unitOptions, optionId])

  // 세대 정보 패널에 보여줄 타공 수와 그 내역
  function holeInfoOf(target) {
    const typeHoles = Object.fromEntries(holeSetup.types.map((type) => [type.name, type.hole_count]))
    const optionDeltas = Object.fromEntries(holeSetup.options.map((option) => [option.id, option.hole_delta]))
    const optionIds = holeSetup.unitOptions[cellKey(target.buildingId, target.lineNo, target.floor)] ?? []
    return {
      holes: unitHoleCount({ unitType: target.unitType, optionIds, typeHoles, optionDeltas }),
      options: holeSetup.options.filter((option) => optionIds.includes(option.id)),
    }
  }

  // 타공 설정 모달에 보여줄 사용 현황
  const lineCountByType = {}
  sheet.buildings.forEach((building) =>
    building.lines.forEach((line) => {
      const name = line.unit_type?.trim()
      if (name) lineCountByType[name] = (lineCountByType[name] ?? 0) + 1
    })
  )
  const optionUnitCount = {}
  Object.values(holeSetup.unitOptions).forEach((ids) =>
    ids.forEach((id) => {
      optionUnitCount[id] = (optionUnitCount[id] ?? 0) + 1
    })
  )

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
        {/* 공구를 쓰지 않는 현장에서는 공구 선택을 띄우지 않는다 */}
        {(sheet.sections.length > 0 || activeSection !== ALL_SECTIONS) && (
          <select value={activeSection} onChange={(e) => changeSection(e.target.value)} aria-label="공구 선택">
            <option value={ALL_SECTIONS}>공구 {ALL_SECTIONS}</option>
            {sheet.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
            {hasUnassigned && <option value={UNASSIGNED_SECTION}>{UNASSIGNED_SECTION}</option>}
          </select>
        )}
        <select
          value={buildingInSection ? buildingFilter : ALL_BUILDINGS}
          onChange={(e) => changeBuilding(e.target.value)}
          aria-label="동 선택"
        >
          <option value={ALL_BUILDINGS}>동 {ALL_BUILDINGS}</option>
          {sectionBuildings.map((building) => (
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
        dragMode={(bar === 'work' && workSub !== null) || (bar === 'option' && optionId !== null)}
        scale={scale}
        horizontal={horizontal}
        crc={crc}
        optionMode={bar === 'option'}
        optionCells={optionCells}
        onCellClick={handleCellClick}
        onCellsCheck={bar === 'option' ? handleCellsOption : handleCellsCheck}
      />

      <div className="mode-bar">
        {bar === 'work' ? (
          <>
            {/* CRC 현장은 작업이 하나뿐이라 CRC 버튼만 둔다(체크 값은 경량과 같은 자리에 저장) */}
            <button
              type="button"
              className={`btn${workSub === 'light' ? ' primary' : ''}`}
              onClick={() => setWorkSub('light')}
            >
              {crc ? 'CRC' : '경량'}
            </button>
            {!crc && (
              <button
                type="button"
                className={`btn${workSub === 'laminate' ? ' primary' : ''}`}
                onClick={() => setWorkSub('laminate')}
              >
                합지
              </button>
            )}
            <button type="button" className="btn danger" onClick={cancelMode}>
              취소
            </button>
            {workSub && <span className="mode-hint">칸을 끌면 여러 칸이 한 번에 체크됩니다</span>}
          </>
        ) : bar === 'option' ? (
          <>
            {holeSetup.options.length === 0 ? (
              <span className="mode-hint">&quot;타공 설정&quot;에서 옵션을 먼저 추가하세요</span>
            ) : (
              <select
                value={optionId ?? ''}
                onChange={(e) => setOptionId(e.target.value ? Number(e.target.value) : null)}
                aria-label="옵션 선택"
              >
                <option value="">옵션 선택</option>
                {holeSetup.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.hole_delta >= 0 ? `+${option.hole_delta}` : option.hole_delta})
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn danger" onClick={cancelMode}>
              취소
            </button>
            {optionId !== null && (
              <span className="mode-hint">칸을 누르거나 끌면 옵션이 붙고, 이미 붙은 칸에서 시작하면 떼어집니다</span>
            )}
          </>
        ) : bar === 'defect' ? (
          <button type="button" className="btn danger" onClick={cancelMode}>
            취소
          </button>
        ) : sheetView === 'plaster' ? (
          <>
            <button type="button" className="btn" onClick={startWorkMode}>
              작업 체크
            </button>
            <button type="button" className="btn" onClick={() => switchSheetView('main')}>
              메인 세대표로
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={startWorkMode}>
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
            <button
              type="button"
              className="btn"
              disabled={visibleBuildings.length === 0}
              onClick={handleDownloadSheet}
            >
              세대표 다운로드
            </button>
            {/* 현장에서 매일 쓰는 작업만 바로 누를 수 있게 두고, 가끔 쓰는 설정은 관리 메뉴로 모은다 */}
            <MenuButton
              label="관리"
              items={[
                { key: 'building', label: '세대표 수정', onClick: () => setBuildingModal(true) },
                { key: 'section', label: '공구 수정', onClick: () => setSectionModal(true) },
                { key: 'hole', label: '타공 설정', disabled: sheet.offline, onClick: () => setHoleModal(true) },
                {
                  key: 'option',
                  label: '옵션 지정',
                  disabled: sheet.offline,
                  onClick: () => {
                    setBar('option')
                    closePanel()
                  },
                },
                { key: 'share', label: '세대표 공유', disabled: sheet.offline, onClick: () => setShareModal(true) },
              ]}
            />
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
          crc={crc}
          holeInfo={sheetView === 'main' && !sheet.offline ? holeInfoOf(panel) : null}
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
          typeNames={holeSetup.types.map((type) => type.name)}
          saving={saving}
          onClose={() => setBuildingModal(false)}
          onSubmit={handleSaveBuilding}
          onDelete={handleDeleteBuilding}
          onReorder={handleReorderBuildings}
        />
      )}
      {sectionModal && (
        <SectionEditModal
          buildings={sheet.buildings}
          sections={sheet.sections}
          saving={saving}
          onClose={() => setSectionModal(false)}
          onSubmit={handleSaveSections}
        />
      )}
      {holeModal && (
        <HoleSetupModal
          types={holeSetup.types}
          options={holeSetup.options}
          lineCountByType={lineCountByType}
          optionUnitCount={optionUnitCount}
          saving={saving}
          onClose={() => setHoleModal(false)}
          onSubmit={handleSaveHoleSetup}
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
