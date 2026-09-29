import {
  IconAdjustments,
  IconBuilding,
  IconCalendarEvent,
  IconChartBar,
  IconCode,
  IconCreditCard,
  IconSettings,
  IconSpeakerphone,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'
import { ALL_ROLES, MANAGER_ROLES, ROLES } from '../constants/roles'

// 사이드바 메뉴와 라우트 권한 검사가 모두 이 목록을 기준으로 동작한다.
// hiddenBy: 팀 설정으로 끌 수 있는 메뉴. user의 그 값이 true면 권한과 상관없이 누구에게도 안 보인다.
export const MENU_ITEMS = [
  { key: 'personal', label: '개인', path: '/personal', icon: IconUser, roles: ALL_ROLES },
  { key: 'sites', label: '현장관리', path: '/sites', icon: IconBuilding, roles: ALL_ROLES },
  {
    key: 'holeSetup',
    label: '타공 설정',
    path: '/hole-setup',
    icon: IconAdjustments,
    roles: ALL_ROLES,
    hiddenBy: 'hole_setup_menu_hidden',
  },
  { key: 'payment', label: '결제', path: '/payment', icon: IconCreditCard, roles: MANAGER_ROLES },
  { key: 'hr', label: '인사관리', path: '/hr', icon: IconUsers, roles: MANAGER_ROLES },
  { key: 'holes', label: '현장 타공 현황', path: '/holes', icon: IconChartBar, roles: MANAGER_ROLES },
  { key: 'upcoming', label: '예정현장', path: '/upcoming', icon: IconCalendarEvent, roles: MANAGER_ROLES },
  { key: 'leader', label: '팀장 메뉴', path: '/leader', icon: IconSpeakerphone, roles: MANAGER_ROLES },
  { key: 'settings', label: '설정', path: '/settings', icon: IconSettings, roles: ALL_ROLES },
  { key: 'dev', label: '개발자 페이지', path: '/dev', icon: IconCode, roles: [ROLES.DEVELOPER] },
]

function isVisible(menu, user) {
  return menu.roles.includes(user.role) && !(menu.hiddenBy && user[menu.hiddenBy])
}

export function visibleMenus(user) {
  return MENU_ITEMS.filter((item) => isVisible(item, user))
}

export function canAccessMenu(menuKey, user) {
  const menu = MENU_ITEMS.find((item) => item.key === menuKey)
  return Boolean(menu && isVisible(menu, user))
}
