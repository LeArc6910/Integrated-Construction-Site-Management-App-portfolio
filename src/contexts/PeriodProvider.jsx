import { useState } from 'react'
import { PeriodContext } from './PeriodContext'

// 결제·인사관리·개인 메뉴가 공통으로 쓰는 연/월 선택 상태. 메뉴를 옮겨도 초기화되지 않도록
// 앱 최상단에서 한 번만 들고 있는다.
export function PeriodProvider({ children }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  function setPeriod(nextYear, nextMonth) {
    setYear(nextYear)
    setMonth(nextMonth)
  }

  return <PeriodContext.Provider value={{ year, month, setPeriod }}>{children}</PeriodContext.Provider>
}
