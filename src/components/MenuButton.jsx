import { useEffect, useId, useRef, useState } from 'react'

// 버튼을 누르면 펼쳐지는 메뉴. 자주 쓰지 않는 버튼을 한데 모아 하단 버튼 줄을 줄일 때 쓴다.
// PC에서는 버튼 위로 펼쳐지고(하단 버튼 줄에서 쓰므로), 좁은 화면에서는 화면 아래에서 올라오는 목록(하단 시트)이 된다.
//
// 접근성: 메뉴 버튼(aria-haspopup/aria-expanded)과 메뉴 항목(role="menuitem")을 쓰고, 열면 첫 항목에
// 포커스가 간다. 위/아래 방향키로 항목을 옮기고, Esc나 바깥을 누르면 닫히며 포커스는 버튼으로 돌아온다.
// items: [{ key, label, onClick, disabled }]
export default function MenuButton({ label, items }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const itemRefs = useRef([])
  const menuId = useId()

  function close({ returnFocus = true } = {}) {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  // 열리면 누를 수 있는 첫 항목으로 포커스를 옮긴다
  useEffect(() => {
    if (!open) return
    itemRefs.current.find((item) => item && !item.disabled)?.focus()
  }, [open])

  // 메뉴 바깥을 누르면 닫는다(하단 시트의 어두운 배경은 메뉴 안쪽이라 따로 처리한다)
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  function handleMenuKeyDown(e) {
    const enabled = itemRefs.current.filter((item) => item && !item.disabled)
    const index = enabled.indexOf(document.activeElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      enabled[(index + 1) % enabled.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      enabled[(index - 1 + enabled.length) % enabled.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      enabled[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      enabled[enabled.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      // 메뉴 밖으로 포커스가 나가면 메뉴도 닫는다
      close({ returnFocus: false })
    }
  }

  function handleSelect(item) {
    // 항목이 모달을 여는 경우가 많아서, 포커스를 버튼으로 돌리지 않고 모달이 가져가게 둔다
    close({ returnFocus: false })
    item.onClick()
  }

  return (
    <div className="menu-button" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn${open ? ' primary' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          {/* 하단 시트 뒤 어두운 배경. 누르면 닫고, 그 누름이 뒤의 세대표 칸까지 가지 않게 여기서 받는다 */}
          <div className="menu-backdrop" aria-hidden="true" onClick={() => close({ returnFocus: false })} />
          <div id={menuId} className="menu-list" role="menu" aria-label={label} onKeyDown={handleMenuKeyDown}>
            <div className="menu-sheet-title" aria-hidden="true">
              {label}
            </div>
            {items.map((item, index) => (
              <button
                key={item.key}
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={item.disabled}
                onClick={() => handleSelect(item)}
              >
                {item.label}
              </button>
            ))}
            {/* 하단 시트에서만 보이는 닫기. PC에서는 display:none이라 접근성 트리에서도 빠진다 */}
            <button type="button" role="menuitem" className="menu-item menu-cancel" onClick={() => close()}>
              닫기
            </button>
          </div>
        </>
      )}
    </div>
  )
}
