import { useRef, useState } from 'react'
import { cellKey, checkKey } from '../../api/unitSheet'

// 경량은 왼쪽 절반, 합지는 오른쪽 절반을 칠해서 한 칸에 두 작업을 같이 보여준다.
function checkBackground(check) {
  if (!check?.light && !check?.laminate) return undefined
  const left = check.light ? 'var(--orange-bg)' : '#fff'
  const right = check.laminate ? 'var(--teal-bg)' : '#fff'
  return { background: `linear-gradient(to right, ${left} 50%, ${right} 50%)` }
}

function lineRange(line) {
  return { min: line.min_floor ?? 1, max: line.max_floor }
}

// 동에 그릴 층 목록. 가장 높은 층이 위로 오게 내림차순으로 만든다.
function floorsOf(building) {
  if (building.lines.length === 0) return []
  const min = Math.min(...building.lines.map((line) => lineRange(line).min))
  const max = Math.max(...building.lines.map((line) => lineRange(line).max))
  if (max < min) return []
  return Array.from({ length: max - min + 1 }, (_, i) => max - i)
}

function inLine(line, floor) {
  const { min, max } = lineRange(line)
  return floor >= min && floor <= max
}

// 처음 누른 칸과 지금 손이 올라간 칸이 만드는 직사각형 안에서, 실제로 존재하는 칸만 모은다.
// 체크/해제 방향은 처음 누른 칸을 기준으로 정하므로 그 칸을 맨 앞에 둔다.
function cellsInRect(building, from, to) {
  const lineLo = Math.min(from.lineNo, to.lineNo)
  const lineHi = Math.max(from.lineNo, to.lineNo)
  const floorLo = Math.min(from.floor, to.floor)
  const floorHi = Math.max(from.floor, to.floor)

  const rest = []
  building.lines.forEach((line) => {
    if (line.line_no < lineLo || line.line_no > lineHi) return
    for (let floor = floorLo; floor <= floorHi; floor++) {
      if (!inLine(line, floor)) continue
      if (line.line_no === from.lineNo && floor === from.floor) continue
      rest.push({ lineNo: line.line_no, floor })
    }
  })
  return [{ lineNo: from.lineNo, floor: from.floor }, ...rest]
}

function inRect(drag, buildingId, lineNo, floor) {
  if (!drag?.from || drag.buildingId !== buildingId) return false
  const { from, to } = drag
  return (
    lineNo >= Math.min(from.lineNo, to.lineNo) &&
    lineNo <= Math.max(from.lineNo, to.lineNo) &&
    floor >= Math.min(from.floor, to.floor) &&
    floor <= Math.max(from.floor, to.floor)
  )
}

export default function UnitSheetTable({
  buildings,
  checks,
  defects,
  sheetView,
  defectMode,
  dragMode,
  scale,
  horizontal,
  onCellClick,
  onCellsCheck,
}) {
  // 드래그 중인 범위. 화면에 미리보기를 그려야 해서 state로, 포인터 이벤트 안에서 바로
  // 읽어야 해서 ref로 같이 들고 있다.
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)

  function handlePointerDown(e, building, lineNo, floor) {
    if (!dragMode) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const next = { buildingId: building.id, from: { lineNo, floor }, to: { lineNo, floor } }
    dragRef.current = { ...next, building }
    setDrag(next)
  }

  // 포인터를 잡아둔 칸으로 이벤트가 오므로, 지금 손이 올라간 칸은 좌표로 직접 찾는다.
  function handlePointerMove(e) {
    const state = dragRef.current
    if (!state) return
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('td[data-floor]')
    if (!target) return
    if (target.closest('[data-building]')?.dataset.building !== String(state.buildingId)) return

    const to = { lineNo: Number(target.dataset.line), floor: Number(target.dataset.floor) }
    if (to.lineNo === state.to.lineNo && to.floor === state.to.floor) return
    dragRef.current = { ...state, to }
    setDrag((prev) => (prev ? { ...prev, to } : prev))
  }

  function handlePointerUp() {
    const state = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!state) return
    onCellsCheck(state.building, cellsInRect(state.building, state.from, state.to))
  }

  if (buildings.length === 0) {
    return <p className="text-secondary">등록된 동이 없습니다. 아래 &quot;세대표 수정&quot;에서 동을 추가하세요.</p>
  }

  return (
    <div className="sheet-scroll">
      <div
        className={`sheet-wrap${dragMode ? ' drag-mode' : ''}${horizontal ? ' horizontal' : ''}`}
        style={{ transform: `scale(${scale})` }}
      >
        {buildings.map((building) => (
          <div key={building.id} className="building-block" data-building={building.id}>
            <div className="building-title">{building.name}</div>
            <table className="unit-table">
              <tbody>
                <tr>
                  <td className="floor-head" />
                  {building.lines.map((line) => (
                    <td key={line.line_no} className="line-head-top">
                      <div>{line.line_no}호</div>
                      {line.unit_type && <div className="line-head-type">{line.unit_type}</div>}
                    </td>
                  ))}
                </tr>

                {floorsOf(building).map((floor) => (
                  <tr key={floor}>
                    <td className="floor-head">{floor}층</td>
                    {building.lines.map((line) => {
                      // 없는 칸에도 좌표를 달아둬야 그 위를 지나 드래그해도 범위가 이어진다
                      if (!inLine(line, floor)) {
                        return (
                          <td
                            key={line.line_no}
                            className="unit-cell disabled"
                            data-line={line.line_no}
                            data-floor={floor}
                          />
                        )
                      }

                      const check = checks[checkKey(building.id, line.line_no, floor, sheetView)]
                      const classNames = ['unit-cell']
                      let style

                      if (sheetView === 'plaster') {
                        style = checkBackground(check)
                      } else {
                        const unresolved = (defects[cellKey(building.id, line.line_no, floor)] ?? []).filter(
                          (defect) => !defect.resolved
                        )
                        if (defectMode) {
                          if (unresolved.length) classNames.push('defect')
                        } else {
                          style = checkBackground(check)
                        }
                        const plaster = checks[checkKey(building.id, line.line_no, floor, 'plaster')]
                        if (plaster?.light || plaster?.laminate) classNames.push('plaster-marked')
                      }

                      if (inRect(drag, building.id, line.line_no, floor)) classNames.push('selecting')

                      return (
                        <td
                          key={line.line_no}
                          className={classNames.join(' ')}
                          style={style}
                          data-line={line.line_no}
                          data-floor={floor}
                          onPointerDown={(e) => handlePointerDown(e, building, line.line_no, floor)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                          onClick={() => !dragMode && onCellClick(building, line.line_no, floor)}
                        />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}
