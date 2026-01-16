import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './FeedsPage.css';

function FeedsPage() {
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [polling, setPolling] = useState(false);
  
  const [formData, setFormData] = useState({
    url: '',
    regex: '.*',
    minSize: '',
    maxSize: '',
    category: ''
  });

  useEffect(() => {
    loadFeeds();
  }, []);

  const loadFeeds = async () => {
    try {
      const response = await apiClient.get('/feeds');
      setFeeds(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load feeds');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post('/feeds', formData);
      setShowAddForm(false);
      setFormData({ url: '', regex: '.*', minSize: '', maxSize: '', category: '' });
      loadFeeds();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add feed');
    }
  };

  const handleDelete = async (feedId) => {
    if (!confirm('Delete this feed?')) return;
    try {
      await apiClient.delete(`/feeds/${feedId}`);
      loadFeeds();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete feed');
    }
  };

  const handlePollAll = async () => {
    setPolling(true);
    try {
      const response = await apiClient.post('/feeds/poll');
      alert(`Poll complete! Check console for results.`);
      console.log('Poll results:', response.data);
      loadFeeds();
    } catch (err) {
      setError(err.response?.data?.error || 'Poll failed');
    } finally {
      setPolling(false);
    }
  };

  if (loading) {
    return <div className="feeds-page"><p>Loading...</p></div>;
  }

  return (
    <div className="feeds-page">
      <div className="feeds-header">
        <h2>RSS Feeds</h2>
        <div>
          <button onClick={handlePollAll} disabled={polling} className="poll-button">
            {polling ? 'Polling...' : 'Poll All Now'}
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="add-button">
            {showAddForm ? 'Cancel' : 'Add Feed'}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showAddForm && (
        <div className="add-form">
          <h3>Add RSS Feed</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>Feed URL *</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <label>Title Regex Pattern</label>
              <input
                type="text"
                value={formData.regex}
                onChange={(e) => setFormData({ ...formData, regex: e.target.value })}
                placeholder=".*"
              />
            </div>
            <div className="form-row">
              <label>Min Size (bytes)</label>
              <input
                type="number"
                value={formData.minSize}
                onChange={(e) => setFormData({ ...formData, minSize: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="form-row">
              <label>Max Size (bytes)</label>
              <input
                type="number"
                value={formData.maxSize}
                onChange={(e) => setFormData({ ...formData, maxSize: e.target.value })}
                placeholder="Unlimited"
              />
            </div>
            <button type="submit">Add Feed</button>
          </form>
        </div>
      )}

      <div className="feeds-list">
        {feeds.length === 0 ? (
          <p className="no-feeds">No feeds configured</p>
        ) : (
          feeds.map(feed => (
            <div key={feed.id} className="feed-card">
              <div className="feed-header">
                <h3>{feed.url}</h3>
                <button onClick={() => handleDelete(feed.id)} className="delete-button">
                  Delete
                </button>
              </div>
              <div className="feed-details">
                <p><strong>Regex:</strong> {feed.rules.regex}</p>
                <p><strong>Size Range:</strong> {feed.rules.minSize || 0} - {feed.rules.maxSize === Number.MAX_SAFE_INTEGER ? '∞' : feed.rules.maxSize} bytes</p>
                <p><strong>Matched:</strong> {feed.matched_count} items</p>
                <p><strong>Last Poll:</strong> {feed.last_poll ? new Date(feed.last_poll).toLocaleString() : 'Never'}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default FeedsPage;
