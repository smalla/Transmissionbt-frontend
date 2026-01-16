import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';
import './Layout.css';

function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handlePasswordChangeSuccess = (message) => {
    setSuccessMessage(message || 'Password changed successfully!');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Transmission</h1>
        </div>
        <nav className="sidebar-nav">
          <Link to="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>
            Dashboard
          </Link>
          <Link to="/torrents" className={isActive('/torrents') ? 'active' : ''}>
            Torrents
          </Link>
          <Link to="/feeds" className={isActive('/feeds') ? 'active' : ''}>
            RSS Feeds
          </Link>
          <Link to="/links" className={isActive('/links') ? 'active' : ''}>
            Links
          </Link>
          {user?.is_admin && (
            <Link to="/admin" className={isActive('/admin') ? 'active' : ''}>
              Admin
            </Link>
          )}
        </nav>
        <div className="sidebar-footer">
          {successMessage && (
            <div className="success-message">{successMessage}</div>
          )}
          <div className="user-info">
            <span className="username">{user?.username}</span>
            {user?.is_admin && <span className="admin-badge">Admin</span>}
          </div>
          <button 
            onClick={() => setIsPasswordModalOpen(true)} 
            className="change-password-button"
          >
            Change Password
          </button>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>
      <div className="main-content">
        {children}
      </div>
      <ChangePasswordModal 
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={handlePasswordChangeSuccess}
      />
    </div>
  );
}

export default Layout;
