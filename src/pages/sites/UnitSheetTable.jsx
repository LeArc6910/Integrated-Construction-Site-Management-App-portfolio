import { cellKey, checkKey } from '../../api/unitSheet'

// 경량은 왼쪽 절반, 합지는 오른쪽 절반을 칠해서 한 칸에 두 작업을 같이 보여준다.
function checkBackground(check) {
  if (!check?.light && !check?.laminate) return undefined
  const left = check.light ? 'var(--orange-bg)' : '#fff'
  const right = check.laminate ? 'var(--teal-bg)' : '#fff'
  return { background: `linear-gradient(to right, ${left} 50%, ${right} 50%)` }
}

export default function UnitSheetTable({ buildings, checks, defects, sheetView, defectMode, scale, onCellClick }) {
  if (buildings.length === 0) {
    return <p className="text-secondary">등록된 동이 없습니다. 아래 &quot;세대표 수정&quot;에서 동을 추가하세요.</p>
  }

  return (
    <div className="sheet-scroll">
      <div className="sheet-wrap" style={{ transform: `scale(${scale})` }}>
        {buildings.map((building) => {
          const maxFloor = Math.max(...building.lines.map((line) => line.max_floor), 0)

          return (
            <div key={building.id} className="building-block">
              <div className="building-title">{building.name}</div>
              <table className="unit-table">
                <tbody>
                  <tr>
                    <td className="floor-head" />
                    {building.lines.map((line) => (
                      <td key={line.line_no} className="line-head-top">
                        {line.line_no}세대
                      </td>
                    ))}
                  </tr>

                  {Array.from({ length: maxFloor }, (_, i) => maxFloor - i).map((floor) => (
                    <tr key={floor}>
                      <td className="floor-head">{floor}층</td>
                      {building.lines.map((line) => {
                        if (floor > line.max_floor) {
                          return <td key={line.line_no} className="unit-cell disabled" />
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

                        return (
                          <td
                            key={line.line_no}
                            className={classNames.join(' ')}
                            style={style}
                            onClick={() => onCellClick(building, line.line_no, floor)}
                          />
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
