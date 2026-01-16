import { useState, useEffect } from 'react';
import './ChangePasswordModal.css';

function ChangePasswordModal({ isOpen, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('account');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ftpPassword, setFtpPassword] = useState('');
  const [confirmFtpPassword, setConfirmFtpPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ftpEnabled, setFtpEnabled] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Check if user has FTP enabled
      fetch('/api/auth/me', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          setFtpEnabled(data.ftp_enabled || false);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (activeTab === 'account') {
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match');
        return;
      }

      // Validate password length
      if (newPassword.length < 6) {
        setError('New password must be at least 6 characters');
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to change password');
        }

        // Clear form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        
        // Call success callback
        if (onSuccess) {
          onSuccess('Account password changed successfully!');
        }

        // Close modal
        onClose();
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    } else if (activeTab === 'ftp') {
      // Validate FTP passwords match
      if (ftpPassword !== confirmFtpPassword) {
        setError('FTP passwords do not match');
        return;
      }

      // Validate password length
      if (ftpPassword.length < 8) {
        setError('FTP password must be at least 8 characters');
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetch('/api/auth/ftp-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            ftpPassword,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to set FTP password');
        }

        // Clear form
        setFtpPassword('');
        setConfirmFtpPassword('');
        setFtpEnabled(true);
        
        // Call success callback
        if (onSuccess) {
          onSuccess('FTP password set successfully!');
        }

        // Close modal
        onClose();
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleDisableFtp = async () => {
    if (!confirm('Are you sure you want to disable FTP access?')) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/ftp-password', {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disable FTP access');
      }

      setFtpEnabled(false);
      setFtpPassword('');
      setConfirmFtpPassword('');
      
      if (onSuccess) {
        onSuccess('FTP access disabled successfully!');
      }

      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFtpPassword('');
    setConfirmFtpPassword('');
    setError('');
    setActiveTab('account');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Passwords</h2>
          <button className="close-button" onClick={handleClose}>&times;</button>
        </div>
        
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => { setActiveTab('account'); setError(''); }}
          >
            Account Password
          </button>
          <button 
            className={`tab ${activeTab === 'ftp' ? 'active' : ''}`}
            onClick={() => { setActiveTab('ftp'); setError(''); }}
          >
            FTP Password
          </button>
        </div>

        <form onSubmit={handleSubmit} className="change-password-form">
          {error && <div className="error-message">{error}</div>}
          
          {activeTab === 'account' ? (
            <>
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={isLoading}
                />
              </div>
            </>
          ) : (
            <>
              {ftpEnabled && (
                <div className="info-message">
                  FTP access is currently enabled. You can change your FTP password or disable FTP access below.
                </div>
              )}
              
              <div className="form-group">
                <label htmlFor="ftpPassword">FTP Password</label>
                <input
                  type="password"
                  id="ftpPassword"
                  value={ftpPassword}
                  onChange={(e) => setFtpPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isLoading}
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmFtpPassword">Confirm FTP Password</label>
                <input
                  type="password"
                  id="confirmFtpPassword"
                  value={confirmFtpPassword}
                  onChange={(e) => setConfirmFtpPassword(e.target.value)}
                  required
                  minLength={8}
                  disabled={isLoading}
                />
              </div>

              {ftpEnabled && (
                <button 
                  type="button"
                  onClick={handleDisableFtp}
                  disabled={isLoading}
                  className="disable-ftp-button"
                >
                  Disable FTP Access
                </button>
              )}
            </>
          )}

          <div className="form-actions">
            <button 
              type="button" 
              onClick={handleClose}
              disabled={isLoading}
              className="cancel-button"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isLoading}
              className="submit-button"
            >
              {isLoading ? 'Saving...' : activeTab === 'account' ? 'Change Password' : 'Set FTP Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ChangePasswordModal;
