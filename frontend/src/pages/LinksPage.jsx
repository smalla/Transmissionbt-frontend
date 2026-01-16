import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './LinksPage.css';

function LinksPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [formData, setFormData] = useState({ title: '', url: '', description: '' });

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    try {
      const response = await apiClient.get('/links');
      setLinks(response.data);
    } catch (err) {
      setError('Failed to load links');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (editingLink) {
        await apiClient.put(`/links/${editingLink.id}`, formData);
      } else {
        await apiClient.post('/links', formData);
      }
      
      setFormData({ title: '', url: '', description: '' });
      setIsEditing(false);
      setEditingLink(null);
      await loadLinks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save link');
    }
  };

  const handleEdit = (link) => {
    setEditingLink(link);
    setFormData({
      title: link.title,
      url: link.url,
      description: link.description || ''
    });
    setIsEditing(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this link?')) return;

    try {
      await apiClient.delete(`/links/${id}`);
      await loadLinks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete link');
    }
  };

  const handleCancel = () => {
    setFormData({ title: '', url: '', description: '' });
    setIsEditing(false);
    setEditingLink(null);
    setError('');
  };

  if (loading) {
    return <div className="links-page"><p>Loading...</p></div>;
  }

  return (
    <div className="links-page">
      <div className="links-header">
        <h1>Useful Links</h1>
        {user?.is_admin && !isEditing && (
          <button onClick={() => setIsEditing(true)} className="add-button">
            + Add Link
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {isEditing && user?.is_admin && (
        <div className="link-form-container">
          <h2>{editingLink ? 'Edit Link' : 'Add New Link'}</h2>
          <form onSubmit={handleSubmit} className="link-form">
            <div className="form-group">
              <label htmlFor="title">Title *</label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                maxLength={200}
              />
            </div>

            <div className="form-group">
              <label htmlFor="url">URL *</label>
              <input
                type="url"
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                required
                placeholder="https://example.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="form-actions">
              <button type="button" onClick={handleCancel} className="cancel-button">
                Cancel
              </button>
              <button type="submit" className="save-button">
                {editingLink ? 'Update' : 'Add'} Link
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="links-list">
        {links.length === 0 ? (
          <p className="no-links">No links available yet.</p>
        ) : (
          links.map((link) => (
            <div key={link.id} className="link-card">
              <div className="link-content">
                <h3>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.title}
                  </a>
                </h3>
                {link.description && <p className="link-description">{link.description}</p>}
                <div className="link-meta">
                  <span className="link-url">{link.url}</span>
                  <span className="link-added">Added by {link.created_by_username}</span>
                </div>
              </div>
              {user?.is_admin && (
                <div className="link-actions">
                  <button onClick={() => handleEdit(link)} className="edit-button">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(link.id)} className="delete-button">
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default LinksPage;
