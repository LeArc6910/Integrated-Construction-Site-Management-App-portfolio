import {
  IconBuilding,
  IconCalendarEvent,
  IconCode,
  IconCreditCard,
  IconSettings,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'
import { ALL_ROLES, MANAGER_ROLES, ROLES } from '../constants/roles'

// 사이드바 메뉴와 라우트 권한 검사가 모두 이 목록을 기준으로 동작한다
export const MENU_ITEMS = [
  { key: 'personal', label: '개인', path: '/personal', icon: IconUser, roles: ALL_ROLES },
  { key: 'sites', label: '현장관리', path: '/sites', icon: IconBuilding, roles: ALL_ROLES },
  { key: 'payment', label: '결제', path: '/payment', icon: IconCreditCard, roles: MANAGER_ROLES },
  { key: 'hr', label: '인사관리', path: '/hr', icon: IconUsers, roles: MANAGER_ROLES },
  { key: 'upcoming', label: '예정현장', path: '/upcoming', icon: IconCalendarEvent, roles: MANAGER_ROLES },
  { key: 'settings', label: '설정', path: '/settings', icon: IconSettings, roles: ALL_ROLES },
  { key: 'dev', label: '개발자 페이지', path: '/dev', icon: IconCode, roles: [ROLES.DEVELOPER] },
]

export function canAccessMenu(menuKey, role) {
  const menu = MENU_ITEMS.find((item) => item.key === menuKey)
  return Boolean(menu && menu.roles.includes(role))
}
