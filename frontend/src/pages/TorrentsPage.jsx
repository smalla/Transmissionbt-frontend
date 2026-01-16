import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './TorrentsPage.css';

function TorrentsPage() {
  const { user } = useAuth();
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadTorrents();
    // Refresh every 5 seconds
    const interval = setInterval(loadTorrents, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTorrents = async () => {
    try {
      const response = await apiClient.get('/torrents');
      setTorrents(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load torrents');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    setError('');

    const formData = new FormData();
    files.forEach(file => formData.append('torrents', file));

    try {
      const response = await apiClient.post('/torrents/upload', formData);

      const results = response.data;
      const failed = results.filter(r => !r.success);
      
      if (failed.length > 0) {
        setError(`${failed.length} upload(s) failed: ${failed.map(f => f.error).join(', ')}`);
      }
      
      loadTorrents();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (torrentId, torrentName) => {
    if (!confirm(`Delete torrent "${torrentName}"?`)) return;

    try {
      await apiClient.delete(`/torrents/${torrentId}`);
      loadTorrents();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  const toggleAutoRemoveBlock = async (torrentId, currentBlock) => {
    try {
      await apiClient.patch(`/torrents/${torrentId}/block-auto-remove`, {
        block: !currentBlock
      });
      loadTorrents();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatProgress = (percent) => {
    return Math.round(percent * 100) + '%';
  };

  const filteredTorrents = torrents.filter(t =>
    t.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) {
    return <div className="torrents-page"><p>Loading...</p></div>;
  }

  return (
    <div className="torrents-page">
      <div className="torrents-header">
        <h2>Torrents</h2>
        <div className="torrents-actions">
          <input
            type="text"
            placeholder="Filter by name..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-input"
          />
          <label className="upload-button">
            {uploading ? 'Uploading...' : 'Upload Torrent(s)'}
            <input
              type="file"
              multiple
              accept=".torrent"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="torrents-list">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Size</th>
              <th>Owner</th>
              <th>Block Auto-Remove</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTorrents.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-torrents">
                  {filter ? 'No torrents match filter' : 'No torrents'}
                </td>
              </tr>
            ) : (
              filteredTorrents.map(torrent => (
                <tr key={torrent.id} className={torrent.is_own ? 'own-torrent' : ''}>
                  <td title={torrent.name}>{torrent.name}</td>
                  <td>
                    <span className={`status-badge status-${torrent.statusLabel}`}>
                      {torrent.statusLabel}
                    </span>
                  </td>
                  <td>
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: formatProgress(torrent.percentDone) }}
                      />
                      <span className="progress-text">{formatProgress(torrent.percentDone)}</span>
                    </div>
                  </td>
                  <td>{formatBytes(torrent.totalSize)}</td>
                  <td>
                    <span className={torrent.is_own ? 'owner-badge own' : 'owner-badge'}>
                      {torrent.owner}
                    </span>
                  </td>
                  <td>
                    {(torrent.is_own || user?.is_admin) && (
                      <input
                        type="checkbox"
                        checked={torrent.block_auto_remove}
                        onChange={() => toggleAutoRemoveBlock(torrent.id, torrent.block_auto_remove)}
                      />
                    )}
                  </td>
                  <td>
                    {(torrent.is_own || user?.is_admin) && (
                      <button
                        onClick={() => handleDelete(torrent.id, torrent.name)}
                        className="delete-button"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TorrentsPage;
