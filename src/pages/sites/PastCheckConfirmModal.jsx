import Modal from '../../components/Modal'

// 오늘 이전에 완료한 작업을 체크 해제하려 할 때 한 번 확인한다. 드래그 한 번에 지난 작업이 풀려
// 작업보고·타공 내역에서 빠지는 일을 막기 위해서다. 오늘 체크한 칸만 해제할 때는 띄우지 않는다.
// units: [{ label: '9/28 101동 1501호' }]
const SHOWN = 3

export default function PastCheckConfirmModal({ units, onCancel, onConfirm }) {
  const shown = units.slice(0, SHOWN).map((unit) => unit.label)
  const rest = units.length - shown.length

  return (
    <Modal title="작업 완료한 내역을 취소하게 됩니다" onClose={onCancel}>
      <p>
        이전 날짜에 완료한 세대 <b>{units.length}곳</b>의 체크를 해제합니다.
      </p>
      <p className="text-secondary past-check-units">
        {shown.join(', ')}
        {rest > 0 && ` 외 ${rest}곳`}
      </p>
      <p className="share-warning">
        해제하면 작업보고와 타공 내역·현황에서 빠집니다. 오늘 안에 다시 체크하면 원래 기록으로 돌아옵니다.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>
          취소
        </button>
        <button type="button" className="btn danger" onClick={onConfirm}>
          체크 해제
        </button>
      </div>
    </Modal>
  )
}
