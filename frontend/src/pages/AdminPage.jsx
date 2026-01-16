import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import apiClient from '../api/client';
import './AdminPage.css';

function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPassword, setEditingPassword] = useState(null);
  const [editingFtpPassword, setEditingFtpPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [newFtpPassword, setNewFtpPassword] = useState('');
  
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    is_admin: false
  });

  useEffect(() => {
    loadUsers();
  }, []);

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  const loadUsers = async () => {
    try {
      const response = await apiClient.get('/admin/users');
      setUsers(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/admin/users', formData);
      setShowAddForm(false);
      setFormData({ username: '', password: '', email: '', is_admin: false });
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDelete = async (userId, username) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handlePasswordChange = async (userId, username) => {
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    try {
      await apiClient.patch(`/admin/users/${userId}`, { password: newPassword });
      setEditingPassword(null);
      setNewPassword('');
      setError('');
      alert(`Password updated for "${username}"`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password');
    }
  };

  const handleFtpPasswordSet = async (userId, username) => {
    if (!newFtpPassword || newFtpPassword.length < 8) {
      setError('FTP password must be at least 8 characters');
      return;
    }
    try {
      await apiClient.post(`/admin/users/${userId}/ftp-password`, { password: newFtpPassword });
      setEditingFtpPassword(null);
      setNewFtpPassword('');
      setError('');
      alert(`FTP access enabled for "${username}"`);
      loadUsers(); // Refresh to show FTP status
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set FTP password');
    }
  };

  const handleFtpDisable = async (userId, username) => {
    if (!confirm(`Disable FTP access for "${username}"?`)) return;
    try {
      await apiClient.delete(`/admin/users/${userId}/ftp-password`);
      setError('');
      alert(`FTP access disabled for "${username}"`);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disable FTP');
    }
  };

  if (loading) {
    return <div className="admin-page"><p>Loading...</p></div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>User Management</h2>
        <button onClick={() => setShowAddForm(!showAddForm)} className="add-button">
          {showAddForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showAddForm && (
        <div className="add-form">
          <h3>Create New User</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>Username *</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <label>Password * (min 8 characters)</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={8}
              />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="form-row checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={formData.is_admin}
                  onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                />
                Admin
              </label>
            </div>
            <button type="submit">Create User</button>
          </form>
        </div>
      )}

      <div className="users-list">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>FTP</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.email || '-'}</td>
                <td>
                  {u.is_admin ? (
                    <span className="role-badge admin">Admin</span>
                  ) : (
                    <span className="role-badge">User</span>
                  )}
                </td>
                <td>
                  {u.ftp_enabled ? (
                    <span className="ftp-enabled">✓ Enabled</span>
                  ) : (
                    <span className="ftp-disabled">✗ Disabled</span>
                  )}
                </td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="actions-cell">
                  {editingPassword === u.id ? (
                    <div className="password-edit">
                      <input
                        type="password"
                        placeholder="New password (min 8)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        minLength={8}
                        autoFocus
                      />
                      <button onClick={() => handlePasswordChange(u.id, u.username)} className="save-button">
                        Save
                      </button>
                      <button onClick={() => { setEditingPassword(null); setNewPassword(''); }} className="cancel-button">
                        Cancel
                      </button>
                    </div>
                  ) : editingFtpPassword === u.id ? (
                    <div className="password-edit">
                      <input
                        type="password"
                        placeholder="FTP password (min 8)"
                        value={newFtpPassword}
                        onChange={(e) => setNewFtpPassword(e.target.value)}
                        minLength={8}
                        autoFocus
                      />
                      <button onClick={() => handleFtpPasswordSet(u.id, u.username)} className="save-button">
                        Save
                      </button>
                      <button onClick={() => { setEditingFtpPassword(null); setNewFtpPassword(''); }} className="cancel-button">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditingPassword(u.id)}
                        className="edit-button"
                      >
                        Change Password
                      </button>
                      {u.ftp_enabled ? (
                        <button
                          onClick={() => handleFtpDisable(u.id, u.username)}
                          className="warning-button"
                        >
                          Disable FTP
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingFtpPassword(u.id)}
                          className="ftp-button"
                        >
                          Enable FTP
                        </button>
                      )}
                      {u.id !== user.id && (
                        <button
                          onClick={() => handleDelete(u.id, u.username)}
                          className="delete-button"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminPage;
