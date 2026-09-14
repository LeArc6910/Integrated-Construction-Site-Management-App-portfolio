import { defectSummary } from '../../api/unitSheet'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatStamp(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function actorLabel(names, userId, at) {
  return [names[userId] ?? '알 수 없음', formatStamp(at)].filter(Boolean).join(' · ')
}

function CheckRow({ label, done, by }) {
  return (
    <div className="check-row">
      <span>{label}</span>
      <span>{done ? `완료 · ${by}` : '미완료'}</span>
    </div>
  )
}

function LogSection({ logs, names }) {
  return (
    <div className="log-section">
      <div className="log-title">작업 로그</div>
      {logs.length === 0 && <div className="text-secondary log-empty">기록 없음</div>}
      {logs.map((log) => (
        <div key={log.id} className="log-item">
          <div>
            <b>{log.action}</b>
            {log.detail ? ` · ${log.detail}` : ''}
          </div>
          <div className="text-secondary log-meta">{actorLabel(names, log.actor_id, log.created_at)}</div>
        </div>
      ))}
    </div>
  )
}

export default function CellPanel({
  panel,
  sheetView,
  check,
  defects,
  logs,
  names,
  selectedDefectId,
  onSelectDefect,
  onClose,
  onClearCheck,
  onAddDefect,
  onResolveDefect,
  onDeleteDefect,
}) {
  const title = `${panel.buildingName} ${panel.lineNo}호${panel.unitType ? `(${panel.unitType})` : ''} ${panel.floor}층${
    sheetView === 'plaster' ? ' · 석고 시공' : panel.kind === 'defect' ? ' · 미타공' : ''
  }`
  const unresolved = defects.filter((defect) => !defect.resolved)
  const selectable = defects.some((defect) => defect.id === selectedDefectId && !defect.resolved && !defect.pending)

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <b>{title}</b>
        <button type="button" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      {panel.kind === 'defect' ? (
        <>
          {defects.length > 1 && <div className="text-secondary log-meta">항목을 선택한 뒤 처리하세요</div>}
          {defects.length === 0 && <div className="text-secondary">등록된 항목 없음</div>}
          {defects.map((defect) => (
            // 처리완료 항목은 더 처리할 게 없으므로 선택되지 않게 둔다
            <div
              key={defect.id}
              className={`defect-item${defect.resolved ? ' resolved' : ''}${
                selectedDefectId === defect.id ? ' selected' : ''
              }`}
              onClick={() => !defect.resolved && onSelectDefect(defect.id)}
            >
              <div>
                <b>{defectSummary(defect)}</b>
                {defect.resolved && <span className="badge teal">처리완료</span>}
                {defect.pending && <span className="badge orange">동기화 대기중</span>}
              </div>
              <div className="text-secondary log-meta">
                등록: {actorLabel(names, defect.created_by, defect.created_at)}
              </div>
              {defect.resolved && (
                <div className="text-secondary log-meta">
                  처리: {actorLabel(names, defect.resolved_by, defect.resolved_at)}
                </div>
              )}
            </div>
          ))}

          <button type="button" className="btn primary block panel-btn" onClick={onAddDefect}>
            등록
          </button>
          <button type="button" className="btn block panel-btn" disabled={!selectable} onClick={onResolveDefect}>
            처리 완료
          </button>
          <button type="button" className="btn danger block panel-btn" disabled={!selectable} onClick={onDeleteDefect}>
            체크 취소
          </button>
        </>
      ) : (
        <>
          <CheckRow label="경량" done={check?.light} by={actorLabel(names, check?.light_by, check?.light_at)} />
          <CheckRow
            label="합지"
            done={check?.laminate}
            by={actorLabel(names, check?.laminate_by, check?.laminate_at)}
          />
          {sheetView === 'main' && (
            <div className="check-row">
              <span>미타공</span>
              <span>{unresolved.length ? `${unresolved.length}건 미처리` : '없음'}</span>
            </div>
          )}
          <button type="button" className="btn danger block panel-btn" onClick={onClearCheck}>
            체크 취소
          </button>
        </>
      )}

      <LogSection logs={logs} names={names} />
    </div>
  )
}
