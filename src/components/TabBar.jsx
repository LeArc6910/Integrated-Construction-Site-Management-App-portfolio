import { NavLink } from 'react-router-dom'

export default function TabBar({ tabs }) {
  return (
    <div className="tab-bar">
      {tabs.map(({ to, label }) => (
        <NavLink key={to} to={to} className="tab-btn">
          {label}
        </NavLink>
      ))}
    </div>
  )
}
