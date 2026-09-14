import { useContext } from 'react'
import { PeriodContext } from '../contexts/PeriodContext'

export function usePeriod() {
  return useContext(PeriodContext)
}
