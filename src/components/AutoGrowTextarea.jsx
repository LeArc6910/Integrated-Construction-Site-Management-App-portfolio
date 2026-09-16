import { useLayoutEffect, useRef } from 'react'

// 내용 길이에 맞춰 높이가 늘어나는 textarea. 한 줄 input은 긴 문장이 잘려 보여서,
// 줄바꿈된 전체 내용이 한눈에 보이도록 스크롤 높이만큼 키운다.
export default function AutoGrowTextarea({ value, className = '', ...props }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return <textarea ref={ref} rows={1} value={value} className={`auto-grow ${className}`} {...props} />
}
