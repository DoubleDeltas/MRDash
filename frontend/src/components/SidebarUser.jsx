import './SidebarUser.css'

function SidebarUser({ avatarUrl, nickname, handle }) {
  return (
    <div className="sidebar-user">
      <img src={avatarUrl} alt={nickname} className="user-avatar" />
      <div className="user-info">
        <p className="user-nickname">{nickname}</p>
        <p className="user-handle">{handle}</p>
      </div>
    </div>
  )
}

export default SidebarUser