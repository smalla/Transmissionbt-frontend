import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import './DashboardPage.css';

function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [diskUsage, setDiskUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadDiskUsage();
    // Refresh every 10 seconds
    const interval = setInterval(() => {
      loadStats();
      loadDiskUsage();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const response = await apiClient.get('/torrents/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDiskUsage = async () => {
    try {
      const response = await apiClient.get('/torrents/disk-usage');
      setDiskUsage(response.data);
    } catch (err) {
      console.error('Failed to load disk usage:', err);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  if (loading) {
    return <div className="dashboard-page"><p>Loading...</p></div>;
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p className="welcome-text">Welcome back, {user?.username}!</p>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card speed-card">
          <h3>↓ Download Speed</h3>
          <div className="stat-value speed">{formatSpeed(stats?.download_speed)}</div>
        </div>
        
        <div className="stat-card speed-card">
          <h3>↑ Upload Speed</h3>
          <div className="stat-value speed">{formatSpeed(stats?.upload_speed)}</div>
        </div>
        
        <div className="stat-card">
          <h3>Total Torrents</h3>
          <div className="stat-value">{stats?.total_torrents || 0}</div>
        </div>
        
        <div className="stat-card">
          <h3>Active Downloads</h3>
          <div className="stat-value active">{stats?.active_torrents || 0}</div>
        </div>
        
        <div className="stat-card">
          <h3>Completed</h3>
          <div className="stat-value">{stats?.completed_torrents || 0}</div>
        </div>
        
        <div className="stat-card">
          <h3>Total Downloaded</h3>
          <div className="stat-value">{formatBytes(stats?.total_downloaded)}</div>
        </div>
        
        <div className="stat-card">
          <h3>Total Uploaded</h3>
          <div className="stat-value">{formatBytes(stats?.total_uploaded)}</div>
        </div>
      </div>

      {diskUsage && (diskUsage.downloads || diskUsage.incomplete) && (
        <div className="disk-usage-section">
          <h2>Disk Usage</h2>
          <div className="disk-cards">
            {diskUsage.downloads && (
              <div className="disk-card">
                <h3>Downloads Directory</h3>
                <div className="disk-bar">
                  <div 
                    className="disk-bar-fill" 
                    style={{ width: `${diskUsage.downloads.percent}%` }}
                  ></div>
                </div>
                <div className="disk-stats">
                  <span>{formatBytes(diskUsage.downloads.used)} used</span>
                  <span>{formatBytes(diskUsage.downloads.available)} free</span>
                </div>
                <div className="disk-total">
                  Total: {formatBytes(diskUsage.downloads.total)} ({diskUsage.downloads.percent}% used)
                </div>
              </div>
            )}
            {diskUsage.incomplete && (
              <div className="disk-card">
                <h3>Incomplete Directory</h3>
                <div className="disk-bar">
                  <div 
                    className="disk-bar-fill" 
                    style={{ width: `${diskUsage.incomplete.percent}%` }}
                  ></div>
                </div>
                <div className="disk-stats">
                  <span>{formatBytes(diskUsage.incomplete.used)} used</span>
                  <span>{formatBytes(diskUsage.incomplete.available)} free</span>
                </div>
                <div className="disk-total">
                  Total: {formatBytes(diskUsage.incomplete.total)} ({diskUsage.incomplete.percent}% used)
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {stats?.owner_counts && Object.keys(stats.owner_counts).length > 0 && (
        <div className="owner-breakdown">
          <h2>Torrents by Owner</h2>
          <div className="owner-list">
            {Object.entries(stats.owner_counts).map(([owner, count]) => (
              <div key={owner} className="owner-item">
                <span className="owner-name">{owner}</span>
                <span className="owner-count">{count} torrent{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="quick-links">
        <h2>Quick Actions</h2>
        <div className="links-grid">
          <Link to="/torrents" className="quick-link">
            <h3>Manage Torrents</h3>
            <p>Upload, view, and delete torrents</p>
          </Link>
          <Link to="/feeds" className="quick-link">
            <h3>RSS Feeds</h3>
            <p>Configure automatic downloads</p>
          </Link>
          {user?.is_admin && (
            <Link to="/admin" className="quick-link">
              <h3>User Management</h3>
              <p>Add and manage users</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
