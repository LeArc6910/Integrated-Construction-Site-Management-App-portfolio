import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthProvider'
import { PeriodProvider } from './contexts/PeriodProvider'
import { router } from './router'

export default function App() {
  return (
    <AuthProvider>
      <PeriodProvider>
        <RouterProvider router={router} />
      </PeriodProvider>
    </AuthProvider>
  )
}
