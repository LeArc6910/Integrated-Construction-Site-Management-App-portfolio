import { NavLink } from 'react-router-dom'
import { IconLogout } from '@tabler/icons-react'
import { MENU_ITEMS } from '../../config/menu'
import { useAuth } from '../../hooks/useAuth'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const menus = MENU_ITEMS.filter((item) => item.roles.includes(user.role))

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">현장 관리 어플</div>
      <div className="sidebar-role">
        현재 권한: <b>{user.role}</b>
        <br />
        {user.current_team_id !== user.team_id ? '보는 중인 팀' : '소속 팀'}: <b>{user.current_team_name}</b>
      </div>

      {menus.map(({ key, label, path, icon: Icon }) => (
        <NavLink key={key} to={path} className="nav-item">
          <Icon size={18} stroke={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}

      <div className="sidebar-spacer" />

      <button type="button" className="nav-item" onClick={logout}>
        <IconLogout size={18} stroke={1.75} />
        <span>로그아웃</span>
      </button>
    </nav>
  )
}
