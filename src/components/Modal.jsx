// wide: 목록처럼 가로로 넓은 내용을 담는 모달(좁은 화면에서는 어차피 화면 폭에 맞춰진다)
export default function Modal({ title, wide = false, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-box${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <button type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
